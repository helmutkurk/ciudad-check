import { z } from "zod";
import { ImageMimeTypeSchema, IsoTimestampSchema, OutcomeSchema, Sha256Schema } from "./common.js";

// Verifier contract (contracts.md section 3, verifier-rules.md sections 2, 2a and 3).

/**
 * Gate names. Price photo set: G1-G8. Out-of-stock set: G1, G2, G8, O3-O5, G6, G7.
 * G2 `code_match` is the challenge gate: a written/printed code or a gesture (ADR-19).
 */
export const GateNameSchema = z.enum([
  "image_ok",
  "code_match",
  "not_screen",
  "readable",
  "product_match",
  "price_sanity",
  "timing",
  "not_duplicate",
  "label_visible",
  "label_match",
  "slot_empty",
]);
export type GateName = z.infer<typeof GateNameSchema>;

export const GATES_OBSERVED = [
  "image_ok",
  "code_match",
  "not_screen",
  "readable",
  "product_match",
  "price_sanity",
  "timing",
  "not_duplicate",
] as const satisfies readonly GateName[];

export const GATES_OUT_OF_STOCK = [
  "image_ok",
  "code_match",
  "not_screen",
  "label_visible",
  "label_match",
  "slot_empty",
  "timing",
  "not_duplicate",
] as const satisfies readonly GateName[];

export function gatesFor(outcome: z.infer<typeof OutcomeSchema>): readonly GateName[] {
  return outcome === "OBSERVED" ? GATES_OBSERVED : GATES_OUT_OF_STOCK;
}

/** Reason codes per gate (verifier-rules tables). */
export const GATE_REASON_CODES = {
  image_ok: ["image_undecodable", "image_too_small", "image_too_large", "image_blank"],
  code_match: [
    "code_missing",
    "code_mismatch",
    "code_low_confidence",
    "gesture_missing",
    "gesture_mismatch",
    "gesture_low_confidence",
  ],
  not_screen: ["screen_recapture"],
  readable: ["price_unreadable", "product_unreadable", "low_confidence"],
  product_match: ["product_mismatch", "ean_mismatch"],
  price_sanity: ["price_out_of_range", "price_deviates_from_reference", "price_format"],
  timing: ["submitted_too_early", "claim_expired", "window_closed", "challenge_stale"],
  not_duplicate: ["duplicate_image", "near_duplicate_image"],
  label_visible: ["label_not_visible", "label_unreadable"],
  label_match: ["label_product_mismatch", "label_ean_mismatch"],
  slot_empty: ["product_present", "slot_not_empty", "facing_not_in_frame"],
} as const satisfies Record<GateName, readonly string[]>;

export const ReasonCodeSchema = z.enum([
  "image_undecodable",
  "image_too_small",
  "image_too_large",
  "image_blank",
  "code_missing",
  "code_mismatch",
  "code_low_confidence",
  "gesture_missing",
  "gesture_mismatch",
  "gesture_low_confidence",
  "screen_recapture",
  "price_unreadable",
  "product_unreadable",
  "low_confidence",
  "product_mismatch",
  "ean_mismatch",
  "price_out_of_range",
  "price_deviates_from_reference",
  "price_format",
  "submitted_too_early",
  "claim_expired",
  "window_closed",
  "challenge_stale",
  "duplicate_image",
  "near_duplicate_image",
  "label_not_visible",
  "label_unreadable",
  "label_product_mismatch",
  "label_ean_mismatch",
  "product_present",
  "slot_not_empty",
  "facing_not_in_frame",
]);
export type ReasonCode = z.infer<typeof ReasonCodeSchema>;

export const GateResultSchema = z.object({
  name: GateNameSchema,
  pass: z.boolean(),
  reasonCode: ReasonCodeSchema.optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type GateResult = z.infer<typeof GateResultSchema>;

// ---- Vision extraction (verifier-rules section 3). Missing fields are null, never invented.
const confidence = z.number().min(0).max(1);
const sceneSchema = z.object({
  isShelfOrPriceTag: z.boolean().nullable().optional(),
  peopleVisible: z.boolean().nullable(),
  glare: z.string().nullable(),
  blur: z.string().nullable(),
});
const codeSchema = z.object({
  text: z.string().nullable(),
  confidence,
  location: z.string().nullable().optional(),
});

// ---- Gesture challenge (ADR-19): a hand with N raised fingers beside the tag or label.
export const GESTURE_MIN_FINGERS = 2;
export const GESTURE_MAX_FINGERS = 5;
export const GestureSideSchema = z.enum(["left", "right"]);
export type GestureSide = z.infer<typeof GestureSideSchema>;
/** Issued by the engine: `side` is where the hand is, seen in the photo, relative to the tag. */
export const GestureChallengeSchema = z
  .object({
    fingers: z.number().int().min(GESTURE_MIN_FINGERS).max(GESTURE_MAX_FINGERS),
    side: GestureSideSchema,
  })
  .strict();
export type GestureChallenge = z.infer<typeof GestureChallengeSchema>;
/** Read by the model: what it sees, never the expected gesture. Optional for older fixtures. */
const gestureReadSchema = z.object({
  handVisible: z.boolean().nullable(),
  fingers: z.number().int().min(0).max(10).nullable(),
  side: GestureSideSchema.nullable(),
  confidence,
});
const advisorySchema = z
  .object({
    tamperSuspected: z.boolean().nullable().optional(),
    looksLikeScreenPhoto: z.boolean().nullable().optional(),
    exifTime: z.string().nullable().optional(),
  })
  .optional();

export const ObservedExtractionSchema = z.object({
  code: codeSchema,
  gesture: gestureReadSchema.nullable().optional(),
  price: z.object({
    text: z.string().nullable(),
    value: z.number().nullable(),
    currency: z.string().nullable(),
    confidence,
    unit: z.string().nullable().optional(),
  }),
  product: z.object({ text: z.string().nullable(), confidence }),
  barcode: z.object({ digits: z.string().nullable(), confidence }).nullable().optional(),
  scene: sceneSchema,
  advisory: advisorySchema,
  overallConfidence: confidence,
  notes: z.string().nullable().optional(),
});
export type ObservedExtraction = z.infer<typeof ObservedExtractionSchema>;

export const OosExtractionSchema = z.object({
  code: codeSchema,
  gesture: gestureReadSchema.nullable().optional(),
  label: z.object({
    visible: z.boolean(),
    text: z.string().nullable(),
    productText: z.string().nullable(),
    barcodeDigits: z.string().nullable(),
    priceText: z.string().nullable(),
    confidence,
  }),
  facing: z.object({
    empty: z.boolean().nullable(),
    productAboveLabel: z.boolean().nullable(),
    inFrame: z.boolean().nullable(),
    confidence,
    description: z.string().nullable().optional(),
  }),
  scene: sceneSchema,
  advisory: advisorySchema,
  overallConfidence: confidence,
  notes: z.string().nullable().optional(),
});
export type OosExtraction = z.infer<typeof OosExtractionSchema>;

/** Extraction as carried in verdicts: raw model JSON (see the two schemas above). */
export const ExtractionSchema = z.record(z.string(), z.unknown());
export type Extraction = z.infer<typeof ExtractionSchema>;

// ---- POST /v1/verify request
export const VerifyTaskSchema = z.object({
  taskId: z.string(),
  product: z.object({
    name: z.string(),
    ean: z.string(),
    aliases: z.array(z.string()).default([]),
    // verify Friday: not in the contracts.md example, but G5 needs the catalog range
    // ("the engine passes the product's priceMinEur/priceMaxEur", verifier-rules G5).
    priceMinEur: z.number().optional(),
    priceMaxEur: z.number().optional(),
    referencePriceEur: z.number().optional(),
  }),
  store: z.object({ id: z.string(), name: z.string() }),
  expectedCode: z.string(),
  /** Gesture mode (ADR-19): the issued gesture; G2 then compares the gesture, not the code. */
  expectedGesture: GestureChallengeSchema.optional(),
  /** Gesture mode: when the engine revealed the gesture; G6 bounds receivedAt - revealedAt. */
  challengeRevealedAt: IsoTimestampSchema.optional(),
  outcome: OutcomeSchema,
  claimIssuedAt: IsoTimestampSchema,
  // verify Friday: G6 also needs claimExpiresAt (verifier-rules G6); not in the contracts example.
  claimExpiresAt: IsoTimestampSchema.optional(),
  taskWindowEndsAt: IsoTimestampSchema,
  receivedAt: IsoTimestampSchema,
});
export type VerifyTask = z.infer<typeof VerifyTaskSchema>;

export const VerifyImageSchema = z.object({
  mimeType: ImageMimeTypeSchema,
  base64: z.string().min(1),
  sha256: Sha256Schema,
});
export type VerifyImage = z.infer<typeof VerifyImageSchema>;

export const VerifyRequestSchema = z.object({
  packId: z.string(),
  submissionId: z.string(),
  task: VerifyTaskSchema,
  image: VerifyImageSchema,
  previousImageSha256: z.array(Sha256Schema).default([]),
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

// ---- POST /v1/verify response
export const VerifyResponseSchema = z.object({
  submissionId: z.string(),
  outcome: OutcomeSchema,
  pass: z.boolean(),
  gates: z.array(GateResultSchema),
  failedGates: z.array(GateNameSchema),
  extraction: ExtractionSchema,
  workerMessage: z.string(),
  model: z.object({ provider: z.string(), id: z.string(), latencyMs: z.number().nonnegative() }),
  cached: z.boolean(),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

/** GET /health on the verifier. */
export const VerifierHealthSchema = z.object({
  ok: z.boolean(),
  packId: z.string(),
  visionConfigured: z.boolean(),
});

/** GET /v1/price (free). */
export const VerifierPriceSchema = z.object({
  scheme: z.literal("exact"),
  network: z.string(),
  price: z.object({ amount: z.string().regex(/^\d+$/), asset: z.literal("lovelace") }),
  payTo: z.string(),
});

/** Verifier-side idempotency header value: `verify:<submissionId>`. */
export function verifyIdempotencyKey(submissionId: string): string {
  return `verify:${submissionId}`;
}

/** Payout idempotency key `payout:<taskId>`; on-chain metadata tag `shelfie:<payoutId>`. */
export function payoutIdempotencyKey(taskId: string): string {
  return `payout:${taskId}`;
}
export function payoutMetadataTag(payoutId: string): string {
  return `shelfie:${payoutId}`;
}
