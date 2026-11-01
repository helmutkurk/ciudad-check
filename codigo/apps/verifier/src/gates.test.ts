import { describe, expect, it } from "vitest";
import { GATE_REASON_CODES, ReasonCodeSchema } from "@shelfie/core";
import type { ReasonCode } from "@shelfie/core";
import { isValidEan13 } from "@shelfie/domain-shelf";
import {
  gateChallenge,
  gateCodeMatch,
  gateGestureMatch,
  gateNotScreen,
  gateImageOk,
  gateLabelMatch,
  gateLabelVisible,
  gateNotDuplicate,
  gatePriceSanity,
  gateProductMatch,
  gateReadable,
  gateSlotEmpty,
  gateTiming,
} from "./gates.js";
import { OTHER_EAN, T, VALID_EAN, observed, okInfo, oos, task } from "./fixtures.js";

// One test per reason code, with a fixture extraction. `seen` collects the codes asserted so the
// last test can prove that every reason code in core has a test.
const seen = new Set<ReasonCode>();
const expectFail = (gate: { pass: boolean; reasonCode?: ReasonCode }, code: ReasonCode): void => {
  expect(gate.pass).toBe(false);
  expect(gate.reasonCode).toBe(code);
  seen.add(code);
};

describe("fixtures", () => {
  it("use valid EANs", () => {
    expect(isValidEan13(VALID_EAN)).toBe(true);
    expect(isValidEan13(OTHER_EAN)).toBe(true);
  });
});

describe("G1 image_ok", () => {
  it("passes a decodable, large, textured image", () => {
    expect(gateImageOk({ byteLength: 500_000, info: okInfo() }, T).pass).toBe(true);
  });
  it("image_undecodable", () => {
    expectFail(gateImageOk({ byteLength: 10, info: { ok: false, reason: "undecodable" } }, T), "image_undecodable");
  });
  it("image_too_small", () => {
    expectFail(gateImageOk({ byteLength: 10, info: okInfo({ width: 640, height: 480 }) }, T), "image_too_small");
    expectFail(gateImageOk({ byteLength: 10, info: okInfo({ width: 1600, height: 599 }) }, T), "image_too_small");
    // portrait photos are fine: same short and long side as landscape
    expect(gateImageOk({ byteLength: 10, info: okInfo({ width: 720, height: 1280 }) }, T).pass).toBe(true);
    expectFail(gateImageOk({ byteLength: 10, info: okInfo({ width: 599, height: 1600 }) }, T), "image_too_small");
  });
  it("image_too_large", () => {
    expectFail(gateImageOk({ byteLength: 2_000_001, info: okInfo() }, T), "image_too_large");
  });
  it("image_blank", () => {
    expectFail(gateImageOk({ byteLength: 10, info: okInfo({ variance: 3 }) }, T), "image_blank");
  });
});

describe("G2 code_match", () => {
  it("passes with spaces, hyphen and case differences", () => {
    expect(gateCodeMatch("K7Q-4XM", { text: "k7q 4xm", confidence: 0.9 }, T).pass).toBe(true);
  });
  it("code_missing", () => {
    expectFail(gateCodeMatch("K7Q-4XM", { text: null, confidence: 0 }, T), "code_missing");
    expectFail(gateCodeMatch("K7Q-4XM", { text: "  ", confidence: 0.9 }, T), "code_missing");
  });
  it("code_mismatch (also off by one character)", () => {
    const g = gateCodeMatch("K7Q-4XM", { text: "K7Q-4XN", confidence: 0.95 }, T);
    expectFail(g, "code_mismatch");
    expect(g.detail).toMatchObject({ expected: "K7Q-4XM", seen: "K7Q-4XN", distance: 1 });
  });
  it("code_low_confidence", () => {
    expectFail(gateCodeMatch("K7Q-4XM", { text: "K7Q-4XM", confidence: 0.69 }, T), "code_low_confidence");
  });
  it("edit distance is a pack threshold", () => {
    const loose = { ...T, code: { ...T.code, maxEditDistance: 1 } };
    expect(gateCodeMatch("K7Q-4XM", { text: "K7Q-4XN", confidence: 0.9 }, loose).pass).toBe(true);
  });
});

describe("G2 gesture mode (ADR-19)", () => {
  const expected = { fingers: 3, side: "left" as const };
  const seen = { handVisible: true, fingers: 3, side: "left" as const, confidence: 0.9 };
  it("passes the exact count and side", () => {
    expect(gateGestureMatch(expected, seen, T).pass).toBe(true);
  });
  it("gesture_missing", () => {
    expectFail(gateGestureMatch(expected, null, T), "gesture_missing");
    expectFail(gateGestureMatch(expected, undefined, T), "gesture_missing");
    expectFail(gateGestureMatch(expected, { ...seen, handVisible: false }, T), "gesture_missing");
    expectFail(gateGestureMatch(expected, { ...seen, fingers: null }, T), "gesture_missing");
    expectFail(gateGestureMatch(expected, { ...seen, side: null }, T), "gesture_missing");
  });
  it("gesture_mismatch (count or side)", () => {
    expectFail(gateGestureMatch(expected, { ...seen, fingers: 4 }, T), "gesture_mismatch");
    expectFail(gateGestureMatch(expected, { ...seen, side: "right" }, T), "gesture_mismatch");
  });
  it("gesture_low_confidence", () => {
    expectFail(gateGestureMatch(expected, { ...seen, confidence: 0.69 }, T), "gesture_low_confidence");
  });
  it("dispatches on the task: gesture when issued, else the code", () => {
    const x = observed({ gesture: seen });
    expect(gateChallenge(task({ expectedGesture: expected }), x, T).detail).toMatchObject({ mode: "gesture" });
    expect(gateChallenge(task(), x, T).pass).toBe(true); // code K7Q-4XM read
    expect(gateChallenge(task({ expectedGesture: expected }), observed(), T).reasonCode).toBe("gesture_missing");
  });
});

describe("G8 not_screen", () => {
  it("fails only on an explicit true", () => {
    expect(gateNotScreen({ looksLikeScreenPhoto: false }, T).pass).toBe(true);
    expect(gateNotScreen({ looksLikeScreenPhoto: null }, T).pass).toBe(true);
    expect(gateNotScreen(undefined, T).pass).toBe(true);
    expectFail(gateNotScreen({ looksLikeScreenPhoto: true }, T), "screen_recapture");
  });
  it("kill switch: enabled false always passes", () => {
    const off = { ...T, screen: { enabled: false } };
    expect(gateNotScreen({ looksLikeScreenPhoto: true }, off).pass).toBe(true);
  });
});

describe("G3 readable", () => {
  it("passes a clean read and takes our parse, not the model value", () => {
    const r = gateReadable(observed({ price: { text: "1,99 €", value: 19.9, currency: "EUR", confidence: 0.9 } }), T);
    expect(r.gate.pass).toBe(true);
    expect(r.parsed.value).toBe(1.99);
    expect(r.parseDisagreement).toEqual({ model: 19.9, ours: 1.99 });
  });
  it("price_unreadable: no price, only a unit price, or a foreign currency", () => {
    expectFail(
      gateReadable(observed({ price: { text: null, value: null, currency: null, confidence: 0 } }), T).gate,
      "price_unreadable",
    );
    expectFail(
      gateReadable(observed({ price: { text: "3,98 € / kg", value: 3.98, currency: "EUR", confidence: 0.9 } }), T).gate,
      "price_unreadable",
    );
    expectFail(
      gateReadable(observed({ price: { text: "$2.49", value: 2.49, currency: "USD", confidence: 0.9 } }), T).gate,
      "price_unreadable",
    );
  });
  it("product_unreadable", () => {
    expectFail(gateReadable(observed({ product: { text: null, confidence: 0 } }), T).gate, "product_unreadable");
    expectFail(gateReadable(observed({ product: { text: "  ", confidence: 0.9 } }), T).gate, "product_unreadable");
  });
  it("low_confidence", () => {
    expectFail(gateReadable(observed({ overallConfidence: 0.59 }), T).gate, "low_confidence");
  });
  it("lists every reason when several apply", () => {
    const r = gateReadable(
      observed({ product: { text: null, confidence: 0 }, overallConfidence: 0.1 }),
      T,
    );
    expect(r.gate.reasonCode).toBe("product_unreadable");
    expect(r.gate.detail?.["allReasons"]).toEqual(["product_unreadable", "low_confidence"]);
  });
});

describe("G4 product_match", () => {
  const p = task().product;
  it("passes on name, alias and on a matching valid barcode", () => {
    expect(gateProductMatch(observed(), p, T).pass).toBe(true);
    expect(gateProductMatch(observed({ product: { text: "EXAMPLE PALE ALE", confidence: 0.8 } }), p, T).pass).toBe(true);
    const viaEan = gateProductMatch(
      observed({ product: { text: "unreadable", confidence: 0.2 }, barcode: { digits: VALID_EAN, confidence: 0.9 } }),
      p,
      T,
    );
    expect(viaEan.pass).toBe(true);
    expect(viaEan.detail?.["via"]).toBe("ean");
  });
  it("product_mismatch", () => {
    expectFail(gateProductMatch(observed({ product: { text: "Totally Other Dark Lager", confidence: 0.9 } }), p, T), "product_mismatch");
  });
  it("ean_mismatch: a trusted valid barcode of another product wins over the name", () => {
    expectFail(
      gateProductMatch(observed({ barcode: { digits: OTHER_EAN, confidence: 0.9 } }), p, T),
      "ean_mismatch",
    );
  });
  it("ignores store-internal (GS1 restricted-circulation) barcodes and falls back to the name", () => {
    // 2001490250003: checksum-valid in-store number from a shelf tag, not a product GTIN.
    const r = gateProductMatch(observed({ barcode: { digits: "2001490250003", confidence: 0.95 } }), p, T);
    expect(r.pass).toBe(true);
    expect(r.detail?.["via"]).toBe("name");
  });
  it("ignores low-confidence or checksum-invalid barcodes", () => {
    expect(gateProductMatch(observed({ barcode: { digits: OTHER_EAN, confidence: 0.2 } }), p, T).pass).toBe(true);
    expect(gateProductMatch(observed({ barcode: { digits: "4008400402223", confidence: 0.9 } }), p, T).pass).toBe(true);
  });
});

describe("G5 price_sanity", () => {
  const p = task().product;
  it("passes inside the catalog range", () => {
    expect(gatePriceSanity(2.49, p, T).pass).toBe(true);
  });
  it("falls back to pack bounds when the catalog has no range", () => {
    const noRange = { name: "x", ean: VALID_EAN, aliases: [] };
    expect(gatePriceSanity(59.99, noRange, T).pass).toBe(true);
    expectFail(gatePriceSanity(0.1, noRange, T), "price_out_of_range");
  });
  it("price_out_of_range", () => {
    expectFail(gatePriceSanity(249, p, T), "price_out_of_range");
    expectFail(gatePriceSanity(0.5, p, T), "price_out_of_range");
  });
  it("price_deviates_from_reference", () => {
    const withRef = { ...p, referencePriceEur: 1.5 };
    expectFail(gatePriceSanity(3.99, { ...withRef, priceMaxEur: 10 }, T), "price_deviates_from_reference");
    expect(gatePriceSanity(1.8, withRef, T).pass).toBe(true);
  });
  it("price_format: more than two decimals or no value", () => {
    expectFail(gatePriceSanity(2.499, p, T), "price_format");
    expectFail(gatePriceSanity(null, p, T), "price_format");
  });
});

describe("G6 timing", () => {
  it("passes inside [claim + 5 s, min(claim expiry, window end)]", () => {
    expect(gateTiming(task(), T).pass).toBe(true);
    expect(gateTiming(task({ receivedAt: "2026-10-30T10:00:05.000Z" }), T).pass).toBe(true);
    expect(gateTiming(task({ receivedAt: "2026-10-30T10:05:00.000Z" }), T).pass).toBe(true);
  });
  it("submitted_too_early", () => {
    expectFail(gateTiming(task({ receivedAt: "2026-10-30T10:00:04.000Z" }), T), "submitted_too_early");
  });
  it("claim_expired", () => {
    expectFail(gateTiming(task({ receivedAt: "2026-10-30T10:05:01.000Z" }), T), "claim_expired");
  });
  it("challenge_stale: gesture photo more than 90 s after the reveal (engine clock)", () => {
    const at = (revealed: string) => task({ challengeRevealedAt: revealed });
    // received 10:01:00; revealed 10:00:30 -> 30 s, ok; 09:59:29 -> 91 s, stale
    expect(gateTiming(at("2026-10-30T10:00:30.000Z"), T).detail).toMatchObject({ secondsAfterReveal: 30 });
    expect(gateTiming(at("2026-10-30T09:59:30.000Z"), T).pass).toBe(true);
    expectFail(gateTiming(at("2026-10-30T09:59:29.000Z"), T), "challenge_stale");
  });
  it("window_closed", () => {
    expectFail(
      gateTiming(task({ claimExpiresAt: undefined, receivedAt: "2026-10-30T10:15:01.000Z" }), T),
      "window_closed",
    );
  });
});

describe("G7 not_duplicate", () => {
  const sha = "a".repeat(64);
  const base = { sha256: sha, ahash: "ff00ff00ff00ff00", previousImageSha256: [] as string[], previousAhash: new Map<string, string>() };
  it("passes a new image", () => {
    expect(gateNotDuplicate(base, T).pass).toBe(true);
  });
  it("duplicate_image", () => {
    expectFail(gateNotDuplicate({ ...base, previousImageSha256: [sha.toUpperCase()] }, T), "duplicate_image");
  });
  it("near_duplicate_image at Hamming distance <= 6, not above", () => {
    const other = "b".repeat(64);
    const near = new Map([[other, "ff00ff00ff00ff03"]]); // distance 2
    expectFail(gateNotDuplicate({ ...base, previousImageSha256: [other], previousAhash: near }, T), "near_duplicate_image");
    const far = new Map([[other, "00ff00ff00ff00ff"]]); // distance 64
    expect(gateNotDuplicate({ ...base, previousImageSha256: [other], previousAhash: far }, T).pass).toBe(true);
    const edge = new Map([[other, "ff00ff00ff00ff7f"]]); // distance 7
    expect(gateNotDuplicate({ ...base, previousImageSha256: [other], previousAhash: edge }, T).pass).toBe(true);
  });
});

describe("O3 label_visible", () => {
  it("passes a readable label", () => {
    expect(gateLabelVisible(oos(), T).pass).toBe(true);
  });
  it("label_not_visible", () => {
    expectFail(gateLabelVisible(oos({ label: { ...oos().label, visible: false } }), T), "label_not_visible");
  });
  it("label_unreadable: no text or EAN, or low confidence", () => {
    expectFail(
      gateLabelVisible(oos({ label: { ...oos().label, productText: null, barcodeDigits: null } }), T),
      "label_unreadable",
    );
    expectFail(gateLabelVisible(oos({ label: { ...oos().label, confidence: 0.59 } }), T), "label_unreadable");
  });
});

describe("O4 label_match", () => {
  const p = task().product;
  it("passes by name and by EAN", () => {
    expect(gateLabelMatch(oos(), p, T).pass).toBe(true);
    expect(
      gateLabelMatch(oos({ label: { ...oos().label, productText: "?", barcodeDigits: VALID_EAN } }), p, T).pass,
    ).toBe(true);
  });
  it("label_product_mismatch", () => {
    expectFail(
      gateLabelMatch(oos({ label: { ...oos().label, productText: "Other Cola Zero 1,5 l" } }), p, T),
      "label_product_mismatch",
    );
  });
  it("label_ean_mismatch", () => {
    expectFail(
      gateLabelMatch(oos({ label: { ...oos().label, barcodeDigits: OTHER_EAN } }), p, T),
      "label_ean_mismatch",
    );
  });
});

describe("O5 slot_empty", () => {
  it("passes an empty facing seen in frame", () => {
    expect(gateSlotEmpty(oos(), T).pass).toBe(true);
  });
  it("product_present", () => {
    expectFail(
      gateSlotEmpty(oos({ facing: { ...oos().facing, empty: false, productAboveLabel: true } }), T),
      "product_present",
    );
  });
  it("facing_not_in_frame", () => {
    expectFail(gateSlotEmpty(oos({ facing: { ...oos().facing, inFrame: false } }), T), "facing_not_in_frame");
    expectFail(gateSlotEmpty(oos({ facing: { ...oos().facing, inFrame: null } }), T), "facing_not_in_frame");
  });
  it("slot_not_empty: not seen empty, or low confidence", () => {
    expectFail(gateSlotEmpty(oos({ facing: { ...oos().facing, empty: false } }), T), "slot_not_empty");
    expectFail(gateSlotEmpty(oos({ facing: { ...oos().facing, empty: null } }), T), "slot_not_empty");
    expectFail(gateSlotEmpty(oos({ facing: { ...oos().facing, confidence: 0.69 } }), T), "slot_not_empty");
  });
});

describe("coverage", () => {
  it("has a fixture test for every reason code defined in core", () => {
    const all = ReasonCodeSchema.options;
    expect(Object.values(GATE_REASON_CODES).flat().sort()).toEqual([...all].sort());
    expect([...seen].sort()).toEqual([...all].sort());
  });
});
