import { z } from "zod";
import { ChallengeModeSchema } from "./entities.js";
import { LovelaceSchema } from "./common.js";

// Domain pack config (contracts.md section 6). Rule names map to functions exported by the pack
// module; unknown names fail startup (checked by the pack loader, not by this schema).

export const RuleConfigSchema = z.object({
  name: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});
export type RuleConfig = z.infer<typeof RuleConfigSchema>;

export const PackConfigSchema = z.object({
  id: z.string().min(1),
  version: z.string(),
  jobInputSchemaRef: z.string(),
  worker: z.object({
    kind: z.enum(["human", "agent"]),
    capture: z.string(), // "photo"
    challenge: z
      .object({
        mode: ChallengeModeSchema,
        alphabet: z.string().min(2),
        length: z.number().int().positive(),
        ttlSec: z.number().int().positive(),
        cardPool: z.string().nullable(), // verify Friday: shape of a card pool is not specified
      })
      .nullable(), // Plan B (agent workers): null
    maxAttempts: z.number().int().positive(),
    instructions: z.array(z.string()),
  }),
  extraction: z.object({
    promptRef: z.string(),
    outputSchemaRef: z.string(),
    imageRequired: z.boolean(),
  }),
  rules: z.array(RuleConfigSchema),
  outOfStock: z
    .object({
      enabled: z.boolean(),
      rules: z.array(RuleConfigSchema),
      payoutLovelace: LovelaceSchema,
      reportTemplateRef: z.string(),
    })
    .optional(),
  location: z.object({
    defaultGeofenceM: z.number().positive(),
    accuracyCapM: z.number().positive(),
    maxAccuracyM: z.number().positive(),
    maxFixAgeMs: z.number().positive(),
    maxTries: z.number().int().positive(),
  }),
  payout: z.object({ amountLovelace: LovelaceSchema, perTask: z.boolean() }),
  jobInput: z.object({
    idsOnly: z.boolean(),
    maxStores: z.number().int().positive(),
    catalogs: z.object({ stores: z.string(), products: z.string() }),
    city: z.string(),
  }),
  settlement: z.object({
    rule: z.literal("k-of-n"),
    kDefault: z.enum(["n"]).or(z.number().int().positive()),
    earlyDeliver: z.boolean(),
  }),
  report: z.object({ templateRef: z.string(), columns: z.array(z.string()) }),
  ui: z.record(z.string(), z.string()),
});
export type PackConfig = z.infer<typeof PackConfigSchema>;
