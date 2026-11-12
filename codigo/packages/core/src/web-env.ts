import { z } from "zod";

/** Public browser build-time configuration; dev proxy settings stay in the Node schema. */
export const WebEnvSchema = z.object({
  VITE_API_BASE: z.string().trim().default(""),
  VITE_DEMO_BADGES: z.stringbool().default(false),
});
export type WebEnv = z.output<typeof WebEnvSchema>;
