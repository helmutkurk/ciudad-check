import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";

export type LogLevel = "debug" | "info" | "warn" | "error";
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose value is never logged (case-insensitive substring match). */
export const SECRET_KEY_PATTERN = /mnemonic|key|token|secret|password|seed/i;
/** Keys that are safe despite matching the pattern (idempotency keys are not secrets). */
const SAFE_KEYS = new Set(["idempotencykey", "verifyidempotencykey", "idempotency-key"]);
/** Keys that carry image payloads; value replaced entirely. */
const IMAGE_KEY_PATTERN = /^(imagebase64|base64|imagebytes|image|photo)$/i;

export const REDACTED = "[REDACTED]";
const MAX_STRING = 2000;
const MAX_DEPTH = 8;

const BASE64_LIKE = /^[A-Za-z0-9+/=_-]+$/;

function looksLikeImageData(s: string): boolean {
  if (s.startsWith("data:image")) return true;
  return s.length >= 256 && BASE64_LIKE.test(s);
}

export interface RedactOptions {
  /** Literal secret values to scrub from any string (for example values read from env). */
  secretValues?: readonly string[];
}

export function redact(value: unknown, opts: RedactOptions = {}): unknown {
  const secrets = (opts.secretValues ?? []).filter((s) => s.length >= 4);
  const seen = new WeakSet<object>();

  const scrubString = (s: string): string => {
    if (looksLikeImageData(s)) return "[image data omitted]";
    let out = s;
    for (const secret of secrets) out = out.split(secret).join(REDACTED);
    return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}...[truncated]` : out;
  };

  const walk = (v: unknown, depth: number): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v === "string") return scrubString(v);
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "function" || typeof v === "symbol") return "[unserializable]";
    if (Buffer.isBuffer(v)) return `[binary ${v.byteLength} bytes]`;
    if (ArrayBuffer.isView(v)) return `[binary ${v.byteLength} bytes]`;
    if (v instanceof ArrayBuffer) return `[binary ${v.byteLength} bytes]`;
    if (v instanceof Date) return v.toISOString();
    if (typeof v !== "object") return "[unserializable]";
    if (seen.has(v)) return "[circular]";
    if (depth >= MAX_DEPTH) return "[max depth]";
    seen.add(v);
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    if (v instanceof Error) {
      const extra: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) extra[k] = val;
      return {
        name: v.name,
        message: scrubString(v.message),
        ...(walk(extra, depth + 1) as Record<string, unknown>),
      };
    }
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      const lower = k.toLowerCase();
      if (SECRET_KEY_PATTERN.test(k) && !SAFE_KEYS.has(lower)) out[k] = REDACTED;
      else if (IMAGE_KEY_PATTERN.test(k) && val !== null && val !== undefined) {
        out[k] = "[image data omitted]";
      } else out[k] = walk(val, depth + 1);
    }
    return out;
  };

  return walk(value, 0);
}

/** Standard correlation fields. Any extra field is allowed (and redacted). */
export interface LogFields {
  jobId?: string;
  taskId?: string;
  submissionId?: string;
  claimId?: string;
  payoutId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Child logger with fixed fields (for example `{ component: "engine", jobId }`). */
  child(fields: LogFields): Logger;
}

export type LogSink = (line: string) => void;

export interface LoggerOptions {
  level?: LogLevel;
  clock?: Clock;
  sink?: LogSink;
  base?: LogFields;
  secretValues?: readonly string[];
}

const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

/** Structured JSON lines with redaction. One line per event: {ts, level, msg, ...fields}. */
export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? "info";
  const clock = opts.clock ?? systemClock;
  const sink = opts.sink ?? stdoutSink;
  const redactOpts: RedactOptions = { secretValues: opts.secretValues ?? [] };

  const make = (base: LogFields): Logger => {
    const emit = (lvl: LogLevel, msg: string, fields?: LogFields): void => {
      if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level]) return;
      const body = redact({ ...base, ...fields }, redactOpts) as Record<string, unknown>;
      const line = JSON.stringify({
        ts: clock.nowIso(),
        level: lvl,
        msg: redact(msg, redactOpts) as string,
        ...body,
      });
      sink(line);
    };
    return {
      debug: (m, f) => {
        emit("debug", m, f);
      },
      info: (m, f) => {
        emit("info", m, f);
      },
      warn: (m, f) => {
        emit("warn", m, f);
      },
      error: (m, f) => {
        emit("error", m, f);
      },
      child: (f) => make({ ...base, ...f }),
    };
  };
  return make(opts.base ?? {});
}

/** Collect literal values of secret-looking env variables, to pass as `secretValues`. */
export function collectSecretValues(env: Readonly<Record<string, unknown>>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(env)) {
    // BRAND_ACCOUNTS holds one access code per brand in its fourth field (ADR-21).
    if (k === "BRAND_ACCOUNTS" && typeof v === "string") {
      for (const entry of v.split(";")) {
        const token = entry.split("|")[3]?.trim() ?? "";
        if (token.length >= 4) out.push(token);
      }
      continue;
    }
    if (SECRET_KEY_PATTERN.test(k) && typeof v === "string" && v.length >= 4) out.push(v);
  }
  return out;
}
