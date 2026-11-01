import type {
  GateResult,
  GestureChallenge,
  ObservedExtraction,
  OosExtraction,
  ReasonCode,
  VerifyTask,
} from "@shelfie/core";
import {
  bestNameSimilarity,
  editDistance,
  isValidEan13,
  normalizeCode,
  parsePriceEur,
  sameGtin,
} from "@shelfie/domain-shelf";
import type { ParsedPrice, Thresholds } from "@shelfie/domain-shelf";
import { hammingDistance } from "./image.js";
import type { ImageInfo } from "./image.js";

// The gates of verifier-rules.md sections 2 and 2a as pure functions: same inputs, same result,
// no clock, no I/O. The vision model only produced the extraction; everything below decides.
// Every gate returns a GateResult; `detail` carries machine-readable context, never image data.

const pass = (name: GateResult["name"], detail?: Record<string, unknown>): GateResult =>
  detail ? { name, pass: true, detail } : { name, pass: true };
const fail = (
  name: GateResult["name"],
  reasonCode: ReasonCode,
  detail?: Record<string, unknown>,
): GateResult =>
  detail ? { name, pass: false, reasonCode, detail } : { name, pass: false, reasonCode };

// ---------------------------------------------------------------- G1
export interface G1Input {
  byteLength: number;
  info: ImageInfo;
}
export function gateImageOk(input: G1Input, t: Thresholds): GateResult {
  if (input.byteLength > t.image.maxBytes) {
    return fail("image_ok", "image_too_large", { bytes: input.byteLength, maxBytes: t.image.maxBytes });
  }
  if (!input.info.ok) return fail("image_ok", "image_undecodable");
  const { width, height, variance } = input.info;
  // Orientation-agnostic (like the engine's jpeg.ts): a portrait phone photo is 900x1600.
  if (Math.max(width, height) < t.image.minWidth || Math.min(width, height) < t.image.minHeight) {
    return fail("image_ok", "image_too_small", {
      width,
      height,
      minWidth: t.image.minWidth,
      minHeight: t.image.minHeight,
    });
  }
  if (variance < t.image.minVariance) {
    return fail("image_ok", "image_blank", { variance: round(variance), min: t.image.minVariance });
  }
  return pass("image_ok", { width, height });
}

// ---------------------------------------------------------------- G2
export function gateCodeMatch(
  expectedCode: string,
  code: { text: string | null; confidence: number },
  t: Thresholds,
): GateResult {
  const seen = normalizeCode(code.text);
  const expected = normalizeCode(expectedCode);
  const detail = { expected: expectedCode, seen: code.text, confidence: code.confidence };
  if (seen === "") return fail("code_match", "code_missing", detail);
  const distance = editDistance(seen, expected);
  if (distance > t.code.maxEditDistance) {
    return fail("code_match", "code_mismatch", { ...detail, distance });
  }
  if (code.confidence < t.code.minConfidence) {
    return fail("code_match", "code_low_confidence", detail);
  }
  return pass("code_match", { distance, confidence: code.confidence });
}

/**
 * G2 in gesture mode (ADR-19): the model reports the hand it sees; code compares it with the issued
 * gesture. Exact finger count and side, confidence at least `minGestureConfidence`.
 */
export function gateGestureMatch(
  expected: GestureChallenge,
  seen: { handVisible: boolean | null; fingers: number | null; side: string | null; confidence: number } | null | undefined,
  t: Thresholds,
): GateResult {
  // no `expected` in the detail: gate results reach the worker's submission view (ADR-19)
  const detail = {
    seen: seen ? { fingers: seen.fingers, side: seen.side } : null,
    confidence: seen?.confidence ?? 0,
  };
  if (!seen || seen.handVisible === false || seen.fingers === null || seen.side === null) {
    return fail("code_match", "gesture_missing", detail);
  }
  if (seen.fingers !== expected.fingers || seen.side !== expected.side) {
    return fail("code_match", "gesture_mismatch", detail);
  }
  if (seen.confidence < t.code.minGestureConfidence) {
    return fail("code_match", "gesture_low_confidence", detail);
  }
  return pass("code_match", { mode: "gesture", confidence: seen.confidence });
}

/** G2 dispatcher: gesture when the task carries one, else the written/printed code. */
export function gateChallenge(
  task: Pick<VerifyTask, "expectedCode" | "expectedGesture">,
  extraction: Pick<ObservedExtraction, "code" | "gesture">,
  t: Thresholds,
): GateResult {
  return task.expectedGesture
    ? gateGestureMatch(task.expectedGesture, extraction.gesture, t)
    : gateCodeMatch(task.expectedCode, extraction.code, t);
}

// ---------------------------------------------------------------- G8
/**
 * G8 not_screen: fails only on an explicit `looksLikeScreenPhoto === true` (null or missing pass,
 * so a model that omits the flag never blocks a payout). Disabled by pack param `enabled: false`.
 */
export function gateNotScreen(
  advisory: { looksLikeScreenPhoto?: boolean | null | undefined } | undefined,
  t: Thresholds,
): GateResult {
  if (!t.screen.enabled) return pass("not_screen", { enabled: false });
  if (advisory?.looksLikeScreenPhoto === true) return fail("not_screen", "screen_recapture");
  return pass("not_screen");
}

// ---------------------------------------------------------------- G3
export interface G3Result {
  gate: GateResult;
  parsed: ParsedPrice;
  /** Set when the model's numeric value differs from our parse (ours wins). */
  parseDisagreement: { model: number; ours: number } | null;
}

const isEuro = (c: string | null | undefined): boolean =>
  c === null || c === undefined || c.trim() === "" || /^(€|eur|euro|euros)$/i.test(c.trim());

export function gateReadable(x: ObservedExtraction, t: Thresholds): G3Result {
  const parsed = parsePriceEur(x.price.text);
  const reasons: ReasonCode[] = [];
  // Price: our parser must find a shelf price. A text with more than two decimals is still
  // "readable"; G5 reports it as price_format.
  if (t.readable.requirePrice && !parsed.ok && parsed.issue !== "too_many_decimals") {
    reasons.push("price_unreadable");
  }
  if (!isEuro(x.price.currency) || !isEuro(parsed.currency)) reasons.push("price_unreadable");
  if (!x.product.text || x.product.text.trim() === "") reasons.push("product_unreadable");
  if (x.overallConfidence < t.readable.minConfidence) reasons.push("low_confidence");

  const disagreement =
    parsed.ok &&
    parsed.value !== null &&
    x.price.value !== null &&
    Math.abs(x.price.value - parsed.value) > 0.005
      ? { model: x.price.value, ours: parsed.value }
      : null;
  const detail = {
    priceText: x.price.text,
    ourValue: parsed.value,
    overallConfidence: x.overallConfidence,
    ...(reasons.length > 1 ? { allReasons: [...new Set(reasons)] } : {}),
    ...(disagreement ? { parseDisagreement: disagreement } : {}),
  };
  const first = reasons[0];
  return {
    gate: first ? fail("readable", first, detail) : pass("readable", detail),
    parsed,
    parseDisagreement: disagreement,
  };
}

// ---------------------------------------------------------------- G4 / O4 shared matching
type MatchProduct = { name: string; ean: string; aliases: readonly string[] };

interface MatchOutcome {
  ok: boolean;
  reason: "mismatch" | "ean_mismatch" | null;
  via: "ean" | "name";
  score: number;
}

function matchProduct(
  text: string | null,
  barcode: { digits: string | null; confidence: number } | null | undefined,
  product: MatchProduct,
  minScore: number,
  eanOverrides: boolean,
  minBarcodeConfidence: number,
): MatchOutcome {
  const digits = barcode?.digits ?? null;
  // GS1 restricted-circulation prefixes (020-029, 040-049, 200-299) are store-internal numbers
  // printed on shelf labels, not product GTINs: they say nothing about the product.
  const restricted = digits !== null && /^(0[24]|2)/.test(digits);
  const trusted =
    digits !== null &&
    !restricted &&
    isValidEan13(digits) &&
    (barcode?.confidence ?? 0) >= minBarcodeConfidence;
  if (trusted) {
    if (sameGtin(digits, product.ean)) {
      if (eanOverrides) return { ok: true, reason: null, via: "ean", score: 1 };
    } else {
      // A readable, checksum-valid barcode of another product beats any name similarity.
      return { ok: false, reason: "ean_mismatch", via: "ean", score: 0 };
    }
  }
  const score = bestNameSimilarity(text, product);
  return score >= minScore
    ? { ok: true, reason: null, via: "name", score }
    : { ok: false, reason: "mismatch", via: "name", score };
}

export function gateProductMatch(
  x: ObservedExtraction,
  product: VerifyTask["product"],
  t: Thresholds,
): GateResult {
  const r = matchProduct(
    x.product.text,
    x.barcode ?? null,
    product,
    t.product.minTokenScore,
    t.product.eanOverrides,
    t.product.minBarcodeConfidence,
  );
  const detail = { via: r.via, score: round(r.score), seen: x.product.text };
  if (r.ok) return pass("product_match", detail);
  return fail("product_match", r.reason === "ean_mismatch" ? "ean_mismatch" : "product_mismatch", detail);
}

// ---------------------------------------------------------------- G5
export function gatePriceSanity(
  value: number | null,
  product: VerifyTask["product"],
  t: Thresholds,
): GateResult {
  if (value === null || !Number.isFinite(value)) {
    return fail("price_sanity", "price_format", { skipped: "no_price_value" });
  }
  const cents = value * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) {
    return fail("price_sanity", "price_format", { value });
  }
  const min = product.priceMinEur ?? t.price.minEur;
  const max = product.priceMaxEur ?? t.price.maxEur;
  if (value < min || value > max) {
    return fail("price_sanity", "price_out_of_range", { value, minEur: min, maxEur: max });
  }
  const ref = product.referencePriceEur;
  if (ref !== undefined && ref > 0) {
    const deviation = Math.abs(value - ref) / ref;
    if (deviation > t.price.maxDeviationFromRef) {
      return fail("price_sanity", "price_deviates_from_reference", {
        value,
        referencePriceEur: ref,
        deviation: round(deviation),
        max: t.price.maxDeviationFromRef,
      });
    }
  }
  return pass("price_sanity", { value });
}

// ---------------------------------------------------------------- G6
export function gateTiming(task: VerifyTask, t: Thresholds): GateResult {
  const received = Date.parse(task.receivedAt);
  const claimed = Date.parse(task.claimIssuedAt);
  const windowEnd = Date.parse(task.taskWindowEndsAt);
  const claimEnd = task.claimExpiresAt ? Date.parse(task.claimExpiresAt) : Number.POSITIVE_INFINITY;
  const secondsAfterClaim = (received - claimed) / 1000;
  if (secondsAfterClaim < t.timing.minSecondsAfterClaim) {
    return fail("timing", "submitted_too_early", {
      secondsAfterClaim,
      min: t.timing.minSecondsAfterClaim,
    });
  }
  if (received > claimEnd) return fail("timing", "claim_expired", { claimExpiresAt: task.claimExpiresAt });
  if (received > windowEnd) {
    return fail("timing", "window_closed", { taskWindowEndsAt: task.taskWindowEndsAt });
  }
  if (task.challengeRevealedAt) {
    // Gesture mode: the photo must follow the reveal closely (server clocks only, ADR-19).
    const secondsAfterReveal = (received - Date.parse(task.challengeRevealedAt)) / 1000;
    if (secondsAfterReveal > t.timing.maxSecondsAfterReveal) {
      return fail("timing", "challenge_stale", {
        secondsAfterReveal,
        max: t.timing.maxSecondsAfterReveal,
      });
    }
    return pass("timing", { secondsAfterClaim, secondsAfterReveal });
  }
  return pass("timing", { secondsAfterClaim });
}

// ---------------------------------------------------------------- G7
export interface G7Input {
  sha256: string;
  ahash: string | null;
  previousImageSha256: readonly string[];
  /** Known perceptual hashes of previous photos, keyed by sha256 (lower case). */
  previousAhash: ReadonlyMap<string, string>;
}
export function gateNotDuplicate(input: G7Input, t: Thresholds): GateResult {
  const sha = input.sha256.toLowerCase();
  const previous = input.previousImageSha256.map((s) => s.toLowerCase());
  if (previous.includes(sha)) return fail("not_duplicate", "duplicate_image");
  if (input.ahash !== null) {
    for (const p of previous) {
      const other = input.previousAhash.get(p);
      if (other === undefined) continue;
      const distance = hammingDistance(input.ahash, other);
      if (distance <= t.duplicate.maxHashDistance) {
        return fail("not_duplicate", "near_duplicate_image", { distance });
      }
    }
  }
  return pass("not_duplicate");
}

// ---------------------------------------------------------------- O3
export function gateLabelVisible(x: OosExtraction, t: Thresholds): GateResult {
  const { label } = x;
  if (!label.visible) return fail("label_visible", "label_not_visible");
  const readText = (label.productText ?? "").trim() !== "";
  const readEan = (label.barcodeDigits ?? "").replace(/\D/g, "").length >= 8;
  if ((!readText && !readEan) || label.confidence < t.label.minConfidence) {
    return fail("label_visible", "label_unreadable", { confidence: label.confidence });
  }
  return pass("label_visible", { confidence: label.confidence });
}

// ---------------------------------------------------------------- O4
export function gateLabelMatch(
  x: OosExtraction,
  product: VerifyTask["product"],
  t: Thresholds,
): GateResult {
  const r = matchProduct(
    x.label.productText,
    { digits: x.label.barcodeDigits, confidence: x.label.confidence },
    product,
    t.label.minTokenScore,
    t.label.eanOverrides,
    t.product.minBarcodeConfidence,
  );
  const detail = { via: r.via, score: round(r.score), seen: x.label.productText };
  if (r.ok) return pass("label_match", detail);
  return fail(
    "label_match",
    r.reason === "ean_mismatch" ? "label_ean_mismatch" : "label_product_mismatch",
    detail,
  );
}

// ---------------------------------------------------------------- O5
export function gateSlotEmpty(x: OosExtraction, t: Thresholds): GateResult {
  const f = x.facing;
  const detail = {
    empty: f.empty,
    productAboveLabel: f.productAboveLabel,
    inFrame: f.inFrame,
    confidence: f.confidence,
  };
  // Conservative by design: a different product in the slot is also a rejection.
  if (f.productAboveLabel === true) return fail("slot_empty", "product_present", detail);
  if (f.inFrame !== true) return fail("slot_empty", "facing_not_in_frame", detail);
  if (f.empty !== true || f.productAboveLabel !== false || f.confidence < t.slot.minConfidence) {
    return fail("slot_empty", "slot_not_empty", detail);
  }
  return pass("slot_empty", detail);
}

const round = (n: number): number => Math.round(n * 1000) / 1000;
