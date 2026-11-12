import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import {
  GateNameSchema,
  GestureChallengeSchema,
  GestureSideSchema,
  OutcomeSchema,
  ReasonCodeSchema,
} from "@shelfie/core";
import { z } from "zod";

// eval/labels.json (verifier-rules.md section 7). Photos live in eval/photos/ (git-ignored).

export const CaseSchema = z.enum([
  "valid",
  "valid_hard",
  "wrong_code",
  "no_code",
  "wrong_gesture",
  "no_gesture",
  "wrong_product",
  "unreadable_tag",
  "absurd_price",
  "duplicate",
  "screen_photo",
  "oos_valid",
  "oos_product_present",
  "oos_label_cropped",
  "oos_no_label",
  "oos_other_label",
]);
export type EvalCase = z.infer<typeof CaseSchema>;

export const LabelSchema = z.object({
  /** Photo basename inside photosDir, or an absolute external photo path. */
  file: z
    .string()
    .min(1)
    .refine(
      (file) =>
        !file.includes("\0") &&
        /\.(jpe?g|png)$/i.test(file) &&
        (isAbsolute(file) || !/[\\/]/.test(file)),
      "Expected a JPEG/PNG basename or absolute path",
    ),
  outcome: OutcomeSchema.default("OBSERVED"),
  case: CaseSchema,
  /** The throwaway challenge code that was written on paper for this photo (code modes). */
  expectedCode: z.string().min(1).default("XXX-XXX"),
  /** Gesture mode (ADR-19): the hand sign the photo was meant to show; G2 then checks it. */
  expectedGesture: GestureChallengeSchema.optional(),
  product: z.object({
    name: z.string(),
    ean: z.string(),
    aliases: z.array(z.string()).default([]),
    priceMinEur: z.number().optional(),
    priceMaxEur: z.number().optional(),
    referencePriceEur: z.number().optional(),
  }),
  store: z.object({ id: z.string(), name: z.string() }).default({ id: "eval", name: "Eval shelf" }),
  /** Ground truth read by a human from the photo. */
  truth: z
    .object({
      code: z.string().nullable().optional(),
      // An observation can show an invalid challenge (e.g. one raised thumb).
      gesture: z
        .object({
          fingers: z.number().int().min(0).max(10),
          side: GestureSideSchema,
        })
        .nullable()
        .optional(),
      priceValue: z.number().nullable().optional(),
    })
    .default({}),
  expect: z.object({
    pass: z.boolean(),
    failedGates: z.array(GateNameSchema).default([]),
    /** Every listed code must appear among the failed gates' reason codes. */
    reasonCodes: z.array(ReasonCodeSchema).default([]),
    /** At least one of these must appear (for example price_unreadable or low_confidence). */
    reasonCodesAnyOf: z.array(ReasonCodeSchema).default([]),
  }),
  /** Seconds between claim and receipt in the synthetic timing (default 60). */
  claimOffsetSec: z.number().nonnegative().default(60),
  /** Resubmission: the sha256 of this earlier file goes into previousImageSha256. */
  duplicateOf: z.string().optional(),
  /** Stub mode only: scenario marker for synthetic photos (see apps/verifier stub-reader). */
  stubScenario: z.string().optional(),
  notes: z.string().optional(),
});
export type Label = z.infer<typeof LabelSchema>;

export const LabelsFileSchema = z.object({
  version: z.literal(1),
  /** Free text, for humans. */
  description: z.string().optional(),
  labels: z.array(LabelSchema),
});
export type LabelsFile = z.infer<typeof LabelsFileSchema>;

export function loadLabels(path: string): LabelsFile {
  const parsed = LabelsFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(
      `labels file invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  const files = new Set<string>();
  for (const l of parsed.data.labels) {
    if (files.has(l.file)) throw new Error(`labels file invalid: duplicate file ${l.file}`);
    files.add(l.file);
  }
  return parsed.data;
}
