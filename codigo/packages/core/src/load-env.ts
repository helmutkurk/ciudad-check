import type { z } from "zod";
import { AppError } from "./errors.js";
type RawEnv = Readonly<Record<string, string | undefined>>;

/**
 * Parse an environment with a schema. Fails fast with an AppError(`internal`, 500) whose message
 * and details list variable NAMES and problems only, never values. Empty strings count as unset
 * (so a copied .env.example with blank values behaves like an empty environment).
 */
export function loadEnv<S extends z.ZodType>(
  schema: S,
  source: RawEnv = typeof process === "undefined" ? {} : process.env,
): z.output<S> {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === "string" && v.trim() !== "") cleaned[k] = v;
  }
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const name = String(issue.path[0] ?? "(root)");
    const problem = cleaned[name] === undefined ? "missing or invalid" : issue.message;
    return { name, problem };
  });
  const summary = issues.map((i) => `${i.name} (${i.problem})`).join(", ");
  throw new AppError("internal", `Invalid environment configuration: ${summary}`, 500, {
    kind: "invalid_env",
    issues,
  });
}
