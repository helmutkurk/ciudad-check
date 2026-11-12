import { AppError, systemClock } from "@shelfie/core";
import type { Clock, Logger, VisionClient, VisionRequest, VisionResult } from "@shelfie/core";
import { parseModelJson } from "./json.js";

// One adapter for every provider that speaks the OpenAI chat-completions dialect. The design
// default (verifier-rules.md section 3, rule 6) is Gemini Flash through its OpenAI-compatible
// endpoint as primary and OpenAI as fallback, so the two named adapters below are thin presets.
// Plain fetch, no SDK. Model ids and base URLs come from env: verify Friday, never hard-coded.

export interface OpenAiCompatibleConfig {
  provider: string;
  /** For example the provider's ".../openai" or ".../v1" root; "/chat/completions" is appended. */
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTokens?: number;
  /** verify Friday: newer OpenAI models want max_completion_tokens, Gemini max_tokens. */
  tokenParam?: "max_tokens" | "max_completion_tokens";
  /** Omit for models that reject a temperature parameter. */
  temperature?: number;
  /** Send response_format json_object (verify Friday per model). Default true. */
  jsonMode?: boolean;
  /** Repair attempts when the reply is not parseable JSON. Default 1 (design rule 2). */
  repairAttempts?: number;
  fetchImpl?: typeof fetch;
  logger?: Logger;
  clock?: Clock;
}

type ContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}

const REPAIR_INSTRUCTION =
  "Your previous reply was not valid JSON. Reply again with ONE JSON object that matches the schema, and nothing else (no markdown, no commentary).";

export class OpenAiCompatibleVisionClient implements VisionClient {
  private readonly cfg: OpenAiCompatibleConfig;

  constructor(cfg: OpenAiCompatibleConfig) {
    this.cfg = cfg;
  }

  get provider(): string {
    return this.cfg.provider;
  }

  async extract(req: VisionRequest): Promise<VisionResult> {
    const clock = this.cfg.clock ?? systemClock;
    const started = clock.nowMs();
    const imageUrl = `data:${req.image.mimeType};base64,${req.image.base64}`;
    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: req.prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ];
    const repairs = this.cfg.repairAttempts ?? 1;
    for (let attempt = 0; attempt <= repairs; attempt++) {
      const text = await this.complete(messages, req.timeoutMs);
      const json = parseModelJson(text);
      if (json !== undefined) {
        return {
          json,
          model: { provider: this.cfg.provider, id: this.cfg.model },
          latencyMs: clock.nowMs() - started,
        };
      }
      this.cfg.logger?.warn("vision reply is not JSON", {
        provider: this.cfg.provider,
        attempt,
        replyChars: text.length,
      });
      // The failed reply goes back as context so the model can fix its own output.
      messages.push({ role: "assistant", content: text.slice(0, 4000) });
      messages.push({ role: "user", content: REPAIR_INSTRUCTION });
    }
    throw this.unavailable("bad_json");
  }

  private unavailable(reason: string, extra: Record<string, unknown> = {}): AppError {
    return new AppError("vision_unavailable", "Vision provider unavailable.", undefined, {
      provider: this.cfg.provider,
      reason,
      ...extra,
    });
  }

  private async complete(messages: ChatMessage[], timeoutMs: number): Promise<string> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages,
      [this.cfg.tokenParam ?? "max_tokens"]: this.cfg.maxTokens ?? 1024,
    };
    if (this.cfg.temperature !== undefined) body["temperature"] = this.cfg.temperature;
    if (this.cfg.jsonMode ?? true) body["response_format"] = { type: "json_object" };

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${this.cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        // The raw body is never logged (it can contain request fragments); only the provider's
        // error.message, bounded and stripped, so a wrong model id or quota error is diagnosable.
        const providerMessage = errorMessageOf(
          await readCapped(res, 8192).catch(() => ""),
          this.cfg.apiKey,
        );
        throw this.unavailable("http_status", {
          status: res.status,
          ...(providerMessage ? { providerMessage } : {}),
        });
      }
      const payload: unknown = await res.json();
      return extractContent(payload);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (controller.signal.aborted) throw this.unavailable("timeout", { timeoutMs });
      throw this.unavailable("network");
    } finally {
      clearTimeout(timer);
    }
  }
}

/** First `maxBytes` of a response body; the rest is cancelled, never buffered. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const chunk = (await reader.read()) as { done: boolean; value?: Uint8Array };
    if (chunk.done || !chunk.value) break;
    chunks.push(chunk.value);
    size += chunk.value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).subarray(0, maxBytes).toString("utf8");
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-[A-Za-z0-9_*-]+/g, // OpenAI keys, also the masked "sk-proj-****abcd" form
  /AIza[0-9A-Za-z_-]+/g, // Google API keys
  /Bearer\s+\S+/gi,
  /data:\S+/g, // inline image data
  /[A-Za-z0-9+/=_-]{40,}/g, // long tokens or base64 runs
];

/**
 * `error.message` of a provider error body (OpenAI or Gemini shape, also as a one-item array),
 * with keys, tokens and base64 runs redacted, control characters stripped, at most 200 chars.
 */
export function errorMessageOf(text: string, apiKey?: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const root: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
  const msg = (root as { error?: { message?: unknown } } | null)?.error?.message;
  if (typeof msg !== "string") return null;
  let clean = apiKey && apiKey.length >= 8 ? msg.split(apiKey).join("[redacted]") : msg;
  for (const p of SECRET_PATTERNS) clean = clean.replace(p, "[redacted]");
  clean = clean.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return clean.length > 200 ? `${clean.slice(0, 200)}...` : clean || null;
}

function extractContent(payload: unknown): string {
  const choices = (payload as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        typeof p === "object" && p !== null && "text" in p
          ? String((p as { text: unknown }).text)
          : "",
      )
      .join("");
  }
  return "";
}

export type PresetConfig = Omit<OpenAiCompatibleConfig, "provider" | "tokenParam">;

/** Primary: Gemini via its OpenAI-compatible endpoint (base URL from env, verify Friday). */
export function createGeminiClient(cfg: PresetConfig): OpenAiCompatibleVisionClient {
  return new OpenAiCompatibleVisionClient({
    ...cfg,
    provider: "gemini",
    tokenParam: "max_tokens",
    temperature: cfg.temperature ?? 0,
  });
}

/** Fallback: OpenAI chat completions (base URL from env, verify Friday). */
export function createOpenAiClient(cfg: PresetConfig): OpenAiCompatibleVisionClient {
  return new OpenAiCompatibleVisionClient({
    ...cfg,
    provider: "openai",
    tokenParam: "max_completion_tokens",
  });
}
