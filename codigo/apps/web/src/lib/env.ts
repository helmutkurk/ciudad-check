import { WebEnvSchema, loadEnv } from "@shelfie/core/browser";
import type { WebEnv } from "@shelfie/core/browser";
export { WebEnvSchema };
export type { WebEnv };

export function readWebEnv(source: Record<string, unknown>): WebEnv {
  return loadEnv(
    WebEnvSchema,
    Object.fromEntries(
      Object.entries(source).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  );
}
