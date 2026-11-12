import type { z } from "zod";

// JSON repair and strict schema enforcement for untrusted model output
// (security.md section 3.3: model output is untrusted; extra keys rejected; strings bounded).

export const MAX_MODEL_STRING = 1000;

/**
 * Best-effort repair of model text into a JSON value: strips code fences and prose around the
 * first balanced object, removes trailing commas and comments, converts smart quotes.
 * Returns undefined when nothing parseable is found. Never evaluates anything.
 */
export function parseModelJson(text: string): unknown {
  const candidates: string[] = [];
  const trimmed = text.trim();
  candidates.push(trimmed);
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) candidates.push(fence[1].trim());
  const obj = extractBalanced(trimmed);
  if (obj) candidates.push(obj);

  for (const raw of candidates) {
    const direct = tryParse(raw);
    if (direct !== undefined) return direct;
    const fixed = tryParse(repairText(raw));
    if (fixed !== undefined) return fixed;
  }
  return undefined;
}

function tryParse(s: string): unknown {
  try {
    const v: unknown = JSON.parse(s);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function repairText(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
}

/** First balanced {...} block, respecting strings. */
export function extractBalanced(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export type EnforceResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: { path: string; message: string }[] };

/** Paths present in `input` but dropped by the schema parse (`output`). */
export function findExtraKeys(input: unknown, output: unknown): string[] {
  const out: string[] = [];
  extraKeys(input, output, "", out);
  return out;
}

function extraKeys(input: unknown, output: unknown, path: string, out: string[]): void {
  if (Array.isArray(input) && Array.isArray(output)) {
    input.forEach((v, i) => {
      extraKeys(v, output[i], `${path}[${i}]`, out);
    });
    return;
  }
  if (typeof input === "object" && input !== null && typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    for (const [k, v] of Object.entries(input)) {
      if (!(k in o)) out.push(`${path}.${k}`.replace(/^\./, ""));
      else extraKeys(v, o[k], `${path}.${k}`, out);
    }
  }
}

function longStrings(value: unknown, path: string, out: string[]): void {
  if (typeof value === "string") {
    if (value.length > MAX_MODEL_STRING) out.push(path);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => {
      longStrings(v, `${path}[${i}]`, out);
    });
  } else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) longStrings(v, `${path}.${k}`, out);
  }
}

/**
 * Validate with a zod schema, then reject keys the schema would silently strip (zod objects strip
 * unknown keys by default) and over-long strings. Messages carry paths only, never values.
 */
export function enforceSchema<S extends z.ZodType>(schema: S, json: unknown): EnforceResult<z.output<S>> {
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const extras = findExtraKeys(json, parsed.data);
  const longs: string[] = [];
  longStrings(json, "", longs);
  if (extras.length > 0 || longs.length > 0) {
    return {
      ok: false,
      issues: [
        ...extras.map((p) => ({ path: p, message: "unexpected key" })),
        ...longs.map((p) => ({ path: p, message: `string longer than ${MAX_MODEL_STRING}` })),
      ],
    };
  }
  return { ok: true, data: parsed.data };
}
