import type { Logger, VerifierEnv, VisionClient } from "@shelfie/core";
import { VisionChain } from "./chain.js";
import type { ValidateFn } from "./chain.js";
import { createGeminiClient, createOpenAiClient, OpenAiCompatibleVisionClient } from "./openai-compatible.js";
import { StubVisionClient } from "./stub.js";
import type { StubVisionOptions } from "./stub.js";

export interface CreateVisionOptions {
  validate?: ValidateFn;
  stub?: StubVisionOptions;
  fetchImpl?: typeof fetch;
  /** VISION_RUN_CAP: maximum extract() calls for this process. */
  runCap?: number;
}

type VisionEnv = Pick<
  VerifierEnv,
  | "VERIFIER_MODE"
  | "VISION_PROVIDER"
  | "VISION_MODEL"
  | "VISION_BASE_URL"
  | "VISION_API_KEY"
  | "VISION_FALLBACK_BASE_URL"
  | "VISION_FALLBACK_MODEL"
  | "VISION_FALLBACK_API_KEY"
  | "VISION_MAX_TOKENS"
>;

/** Stub in `VERIFIER_MODE=stub`; otherwise primary (+ optional fallback) from env. */
export function createVisionClient(
  env: VisionEnv,
  logger: Logger,
  opts: CreateVisionOptions = {},
): VisionClient {
  if (env.VERIFIER_MODE === "stub") {
    const stub = new StubVisionClient(opts.stub);
    return opts.validate || opts.runCap !== undefined
      ? new VisionChain({
          clients: [stub],
          logger,
          ...(opts.validate ? { validate: opts.validate } : {}),
          ...(opts.runCap !== undefined ? { runCap: opts.runCap } : {}),
        })
      : stub;
  }
  const clients: VisionClient[] = [];
  if (env.VISION_BASE_URL && env.VISION_MODEL && env.VISION_API_KEY) {
    const base = {
      baseUrl: env.VISION_BASE_URL,
      model: env.VISION_MODEL,
      apiKey: env.VISION_API_KEY,
      maxTokens: env.VISION_MAX_TOKENS,
      logger,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    };
    const provider = (env.VISION_PROVIDER ?? "gemini").toLowerCase();
    clients.push(
      provider === "openai"
        ? createOpenAiClient(base)
        : provider === "gemini"
          ? createGeminiClient(base)
          : new OpenAiCompatibleVisionClient({ ...base, provider }),
    );
  }
  if (env.VISION_FALLBACK_BASE_URL && env.VISION_FALLBACK_MODEL && env.VISION_FALLBACK_API_KEY) {
    clients.push(
      createOpenAiClient({
        baseUrl: env.VISION_FALLBACK_BASE_URL,
        model: env.VISION_FALLBACK_MODEL,
        apiKey: env.VISION_FALLBACK_API_KEY,
        maxTokens: env.VISION_MAX_TOKENS,
        logger,
        ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      }),
    );
  }
  if (clients.length === 0) {
    throw new Error("No vision provider configured (VISION_BASE_URL, VISION_MODEL, VISION_API_KEY)");
  }
  return new VisionChain({
    clients,
    logger,
    ...(opts.validate ? { validate: opts.validate } : {}),
    ...(opts.runCap !== undefined ? { runCap: opts.runCap } : {}),
  });
}

export function isVisionConfigured(env: VisionEnv): boolean {
  if (env.VERIFIER_MODE === "stub") return true;
  return Boolean(env.VISION_BASE_URL && env.VISION_MODEL && env.VISION_API_KEY);
}
