import { CHALLENGE_ALPHABET, PackConfigSchema } from "@shelfie/core";
import type { PackConfig } from "@shelfie/core";
import type { z } from "zod";

// Shelf-check pack config (contracts.md section 6). Validated with the core schema at import
// time, so a typo here fails every consumer at startup rather than at the first photo.
// Thresholds are starting values (verifier-rules.md section 4); tune from the evaluation, never
// inline in the gates.

const rawPack = {
  id: "shelf-check",
  version: "1",
  jobInputSchemaRef: "./schemas/job-input.schema.json",
  worker: {
    kind: "human",
    capture: "photo",
    challenge: {
      mode: "gesture",
      alphabet: CHALLENGE_ALPHABET,
      length: 6,
      ttlSec: 300,
      cardPool: null,
    },
    maxAttempts: 3,
    instructions: [
      "Find the product",
      "Open the camera: it shows your hand sign",
      "Hold up that many fingers on that side of the price tag",
      "Take one photo, tag and hand in frame",
    ],
  },
  extraction: {
    promptRef: "./prompts/extract.md",
    outputSchemaRef: "./schemas/extraction.schema.json",
    imageRequired: true,
  },
  rules: [
    { name: "image_ok", params: { minWidth: 800, minHeight: 600, maxBytes: 2_000_000 } },
    {
      name: "code_match",
      params: { maxEditDistance: 0, minConfidence: 0.7, minGestureConfidence: 0.7 },
    },
    { name: "not_screen", params: { enabled: true } },
    { name: "readable", params: { minConfidence: 0.6, requirePrice: true } },
    { name: "product_match", params: { minTokenScore: 0.8, eanOverrides: true } },
    { name: "price_sanity", params: { minEur: 0.2, maxEur: 60, maxDeviationFromRef: 0.6 } },
    { name: "timing", params: { minSecondsAfterClaim: 5, maxSecondsAfterReveal: 90 } },
    { name: "not_duplicate", params: {} },
  ],
  outOfStock: {
    enabled: true,
    rules: [
      { name: "image_ok", params: {} },
      {
        name: "code_match",
        params: { maxEditDistance: 0, minConfidence: 0.7, minGestureConfidence: 0.7 },
      },
      { name: "not_screen", params: { enabled: true } },
      { name: "label_visible", params: { minConfidence: 0.6 } },
      { name: "label_match", params: { minTokenScore: 0.8, eanOverrides: true } },
      { name: "slot_empty", params: { minConfidence: 0.7 } },
      { name: "timing", params: { minSecondsAfterClaim: 5, maxSecondsAfterReveal: 90 } },
      { name: "not_duplicate", params: {} },
    ],
    payoutLovelace: "3000000",
    reportTemplateRef: "./report/oos.md.hbs",
  },
  location: {
    defaultGeofenceM: 150,
    accuracyCapM: 100,
    maxAccuracyM: 300,
    maxFixAgeMs: 30_000,
    maxTries: 3,
  },
  payout: { amountLovelace: "3000000", perTask: true },
  jobInput: {
    idsOnly: true,
    maxStores: 1,
    catalogs: { stores: "./catalog/stores.json", products: "./catalog/products.json" },
    city: "Munich",
  },
  settlement: { rule: "k-of-n", kDefault: "n", earlyDeliver: false },
  report: {
    templateRef: "./report/report.md.hbs",
    columns: ["store", "price", "verdict", "evidenceTx", "payoutTx"],
  },
  ui: {
    taskTitle: "Check {product} at {store}",
    claimButton: "Take this task",
    doneMessage: "Verified. Payment sent.",
  },
} satisfies z.input<typeof PackConfigSchema>;

export const shelfPack: PackConfig = PackConfigSchema.parse(rawPack);

/** Rule names the gates implement. Unknown names in a pack fail startup (`assertKnownRules`). */
export const KNOWN_RULES = [
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
] as const;

export function assertKnownRules(pack: PackConfig): void {
  const names = [...pack.rules, ...(pack.outOfStock?.rules ?? [])].map((r) => r.name);
  const unknown = names.filter((n) => !(KNOWN_RULES as readonly string[]).includes(n));
  if (unknown.length > 0) throw new Error(`Unknown rule name(s) in pack: ${unknown.join(", ")}`);
}
assertKnownRules(shelfPack);

export interface Thresholds {
  image: { minWidth: number; minHeight: number; maxBytes: number; minVariance: number };
  code: { maxEditDistance: number; minConfidence: number; minGestureConfidence: number };
  screen: { enabled: boolean };
  readable: { minConfidence: number; requirePrice: boolean };
  product: { minTokenScore: number; eanOverrides: boolean; minBarcodeConfidence: number };
  price: { minEur: number; maxEur: number; maxDeviationFromRef: number };
  timing: { minSecondsAfterClaim: number; maxSecondsAfterReveal: number };
  label: { minConfidence: number; minTokenScore: number; eanOverrides: boolean };
  slot: { minConfidence: number };
  duplicate: { maxHashDistance: number };
}

const num = (v: unknown, def: number): number => (typeof v === "number" ? v : def);
const bool = (v: unknown, def: boolean): boolean => (typeof v === "boolean" ? v : def);

/** Read thresholds from a pack, falling back to the documented defaults. */
export function thresholdsFromPack(pack: PackConfig = shelfPack): Thresholds {
  const params = (rules: PackConfig["rules"], name: string): Record<string, unknown> =>
    rules.find((r) => r.name === name)?.params ?? {};
  const oos = pack.outOfStock?.rules ?? [];
  const img = params(pack.rules, "image_ok");
  const code = params(pack.rules, "code_match");
  const read = params(pack.rules, "readable");
  const prod = params(pack.rules, "product_match");
  const price = params(pack.rules, "price_sanity");
  const timing = params(pack.rules, "timing");
  const screen = params(pack.rules, "not_screen");
  const lvis = params(oos, "label_visible");
  const lmat = params(oos, "label_match");
  const slot = params(oos, "slot_empty");
  return {
    // near-uniform floor: mean pixel variance below this counts as blank (verify Friday: tune)
    image: {
      minWidth: num(img["minWidth"], 800),
      minHeight: num(img["minHeight"], 600),
      maxBytes: num(img["maxBytes"], 2_000_000),
      minVariance: num(img["minVariance"], 25),
    },
    code: {
      maxEditDistance: num(code["maxEditDistance"], 0),
      minConfidence: num(code["minConfidence"], 0.7),
      minGestureConfidence: num(code["minGestureConfidence"], 0.7),
    },
    // G8 kill switch: false turns the screen-recapture gate into a pass (stage fallback)
    screen: { enabled: bool(screen["enabled"], true) },
    readable: {
      minConfidence: num(read["minConfidence"], 0.6),
      requirePrice: bool(read["requirePrice"], true),
    },
    product: {
      minTokenScore: num(prod["minTokenScore"], 0.8),
      eanOverrides: bool(prod["eanOverrides"], true),
      // below this a barcode read is ignored (hallucinated digits can pass a checksum 1 in 10)
      minBarcodeConfidence: num(prod["minBarcodeConfidence"], 0.5),
    },
    price: {
      minEur: num(price["minEur"], 0.2),
      maxEur: num(price["maxEur"], 60),
      maxDeviationFromRef: num(price["maxDeviationFromRef"], 0.6),
    },
    timing: {
      minSecondsAfterClaim: num(timing["minSecondsAfterClaim"], 5),
      // gesture mode: seconds from reveal (camera opened) to the engine receiving the photo
      maxSecondsAfterReveal: num(timing["maxSecondsAfterReveal"], 90),
    },
    label: {
      minConfidence: num(lvis["minConfidence"], 0.6),
      minTokenScore: num(lmat["minTokenScore"], 0.8),
      eanOverrides: bool(lmat["eanOverrides"], true),
    },
    slot: { minConfidence: num(slot["minConfidence"], 0.7) },
    duplicate: { maxHashDistance: 6 },
  };
}
