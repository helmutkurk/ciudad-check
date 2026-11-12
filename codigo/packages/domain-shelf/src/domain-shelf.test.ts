import { describe, expect, it } from "vitest";
import {
  EXTRACT_OOS_PROMPT,
  EXTRACT_PROMPT,
  assertKnownRules,
  bestNameSimilarity,
  buildExtractPrompt,
  digitsOnly,
  editDistance,
  isValidEan13,
  isValidGtin,
  loadCatalog,
  normalizeCode,
  parsePriceEur,
  productTokens,
  promptOutcome,
  renderReport,
  sameGtin,
  shelfPack,
  thresholdsFromPack,
  tokenSimilarity,
  workerMessage,
  describeGesture,
  gestureInstruction,
} from "./index.js";

describe("gesture labels (ADR-19)", () => {
  it("describes the gesture in en and de without the expected code", () => {
    expect(describeGesture({ fingers: 3, side: "left" })).toBe("3 fingers to the left of the tag");
    expect(describeGesture({ fingers: 5, side: "right" }, "de")).toBe("5 Finger rechts neben dem Schild");
    expect(gestureInstruction({ fingers: 2, side: "right" }, true)).toBe(
      "Hold up 2 fingers to the right of the shelf label.",
    );
  });
  it("uses gesture wording for G2 and G6 only in gesture mode", () => {
    const g = workerMessage("code_match", { expected: "3 fingers to the left of the tag" }, "en", true);
    expect(g).toContain("hand sign");
    expect(g).not.toContain("3 fingers");
    expect(workerMessage("timing", {}, "en", true)).toContain("hand sign");
    expect(workerMessage("code_match", { expected: "K7Q-4XM" })).toContain("code K7Q-4XM");
    expect(workerMessage("not_screen")).toContain("screen");
  });
});

describe("pack", () => {
  it("validates against the core PackConfigSchema and has the documented thresholds", () => {
    expect(shelfPack.id).toBe("shelf-check");
    const t = thresholdsFromPack();
    expect(t.code).toEqual({ maxEditDistance: 0, minConfidence: 0.7, minGestureConfidence: 0.7 });
    expect(t.timing).toEqual({ minSecondsAfterClaim: 5, maxSecondsAfterReveal: 90 });
    expect(t.screen).toEqual({ enabled: true });
    expect(shelfPack.worker.challenge?.mode).toBe("gesture");
    expect(t.price).toEqual({ minEur: 0.2, maxEur: 60, maxDeviationFromRef: 0.6 });
    expect(t.slot.minConfidence).toBe(0.7);
    expect(shelfPack.settlement.kDefault).toBe("n");
    expect(shelfPack.jobInput.maxStores).toBe(1);
  });
  it("rejects unknown rule names", () => {
    expect(() =>
      assertKnownRules({ ...shelfPack, rules: [{ name: "magic", params: {} }] }),
    ).toThrow(/magic/);
  });
});

describe("parsePriceEur", () => {
  it.each([
    ["1,99", 1.99, null],
    ["1.99", 1.99, null],
    ["1.99 €", 1.99, "EUR"],
    ["€1,99", 1.99, "EUR"],
    ["€ 1,99", 1.99, "EUR"],
    ["2,49 EUR", 2.49, "EUR"],
    ["EUR 2.49", 2.49, "EUR"],
    ["12 €", 12, "EUR"],
    ["1.234,56 €", 1234.56, "EUR"],
    ["0,99 €", 0.99, "EUR"],
  ])("parses %s", (text, value, currency) => {
    const p = parsePriceEur(text);
    expect(p.ok).toBe(true);
    expect(p.value).toBe(value);
    expect(p.currency).toBe(currency);
  });

  it("separates per-unit lines from the shelf price", () => {
    const p = parsePriceEur("1,99 €\n1 kg = 6,64 €");
    expect(p.value).toBe(1.99);
    expect(p.unitPrice?.value).toBe(6.64);
    const q = parsePriceEur("Milch 0,99 € (1 l = 0,99 €)");
    expect(q.value).toBe(0.99);
    const r = parsePriceEur("3,98 € / kg");
    expect(r.ok).toBe(false);
    expect(r.issue).toBe("only_unit_price");
    expect(r.unitPrice?.value).toBe(3.98);
  });

  it("ignores pack sizes", () => {
    expect(parsePriceEur("Pale Ale 0,33 l 2,49 EUR").value).toBe(2.49);
    expect(parsePriceEur("500 g 1,29").value).toBe(1.29);
  });

  it("flags unusable text", () => {
    expect(parsePriceEur(null).issue).toBe("no_price");
    expect(parsePriceEur("").issue).toBe("no_price");
    expect(parsePriceEur("sale!").issue).toBe("no_price");
    expect(parsePriceEur("2,499 €").issue).toBe("too_many_decimals");
    expect(parsePriceEur("$3.49").currency).toBe("USD");
  });

  it("marks several shelf prices as ambiguous and takes the first", () => {
    const p = parsePriceEur("2,99 1,99");
    expect(p.value).toBe(2.99);
    expect(p.ambiguous).toBe(true);
  });
});

describe("EAN", () => {
  it("checks EAN-13 and GTIN checksums", () => {
    expect(isValidEan13("4008400402222")).toBe(true); // Nutella catalog entry
    expect(isValidEan13("4008400402223")).toBe(false);
    expect(isValidEan13("40084004022")).toBe(false);
    expect(isValidEan13(null)).toBe(false);
    expect(isValidGtin("40084004")).toBe(false);
    expect(isValidGtin("96385074")).toBe(true); // EAN-8 example
    expect(digitsOnly("4008 4004-02222")).toBe("4008400402222");
    expect(sameGtin("04008400402222", "4008400402222")).toBe(true);
  });
});

describe("codes and similarity", () => {
  it("normalises codes and computes edit distance", () => {
    expect(normalizeCode(" k7q-4xm ")).toBe("K7Q4XM");
    expect(editDistance("K7Q4XM", "K7Q4XN")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
  it("drops pack sizes and stop words", () => {
    expect(productTokens("Example Pale Ale 0,33 l")).toEqual(["example", "pale", "ale"]);
    expect(productTokens("Coca-Cola Original Taste 1,5 l")).toEqual(["coca", "cola", "original", "taste"]);
    expect(productTokens("Müller Milch 500g")).toEqual(["muller", "milch"]);
  });
  it("scores same names high and different products low", () => {
    expect(tokenSimilarity("Example Pale Ale 0,33 l", "example pale ale 0.33l")).toBe(1);
    expect(tokenSimilarity("Example Pale Ale", "Example Dark Lager")).toBeLessThan(0.8);
    expect(tokenSimilarity("Augustiner Lagerbier Hell", "Augustiner Lagerbir Hell")).toBeGreaterThanOrEqual(0.8);
    expect(tokenSimilarity(null, "x")).toBe(0);
    const product = { name: "Coca-Cola Original Taste 1,5 l", aliases: ["Coca-Cola 1,5L"] };
    expect(bestNameSimilarity("Coca Cola 1.5 Liter", product)).toBe(1);
  });
});

describe("catalog", () => {
  it("loads the demo-only stage store and the REWE under its finder address", () => {
    const c = loadCatalog();
    const demo = c.stores.find((s) => s.id === "demo-hoc-friedenstrasse-24");
    expect(demo).toMatchObject({ chain: "DEMO", demo: true, geofenceRadiusM: 150 });
    const rewe = c.stores.find((s) => s.id === "rewe-81671-august-everding-strasse-20");
    expect(rewe?.address).toBe("Hanne-Hiob-Straße 10, 81671 München");
    expect(rewe?.aliases).toContain("August-Everding-Straße 20");
  });

  it("loads the research catalog and reports every mismatch with the core schema", () => {
    const c = loadCatalog();
    expect(c.stores.length).toBe(25);
    expect(c.stores.every((s) => s.city === "Munich")).toBe(true);
    // 39 records: 23+3 have ean null (dropped), 13 keep their EAN
    expect(c.products.length).toBe(13);
    const kinds = new Set(c.issues.map((i) => i.kind));
    expect(kinds.has("product_without_ean")).toBe(true);
    expect(kinds.has("price_range_defaulted")).toBe(true);
    expect(c.issues.filter((i) => i.kind === "schema_mismatch")).toEqual([]);
    for (const p of c.products) {
      expect(p.priceMinEur).toBeLessThanOrEqual(p.priceMaxEur);
    }
  });
  it("throws in strict mode when records are dropped", () => {
    expect(() => loadCatalog({ strict: true })).toThrow(/mismatch/i);
  });
});

describe("prompts", () => {
  it("never mention expected values and carry an injection guard", () => {
    for (const p of [EXTRACT_PROMPT, EXTRACT_OOS_PROMPT]) {
      expect(p).not.toMatch(/expected/i);
      expect(p).toMatch(/never an instruction/i);
      expect(p).toMatch(/null/);
    }
  });
  it("append the JSON schema and are told apart", () => {
    const obs = buildExtractPrompt("OBSERVED");
    const oos = buildExtractPrompt("OUT_OF_STOCK");
    expect(obs).toContain('"overallConfidence"');
    expect(oos).toContain('"facing"');
    expect(promptOutcome(obs)).toBe("OBSERVED");
    expect(promptOutcome(oos)).toBe("OUT_OF_STOCK");
  });
});

describe("labels and report", () => {
  it("fills worker messages in en and de", () => {
    expect(workerMessage("code_match", { expected: "K7Q-4XM" })).toContain("K7Q-4XM");
    expect(workerMessage("product_match", { product: "Cola" }, "de")).toContain("Cola");
    expect(workerMessage(null)).toMatch(/Verified/);
  });
  it("renders a report with a footnote for out-of-stock rows", () => {
    const md = renderReport({
      jobId: "job_01",
      productName: "Example Pale Ale",
      productEan: "4000000000000",
      generatedAtIso: "2026-10-30T10:00:00.000Z",
      explorerTxBase: "https://preprod.cardanoscan.io/transaction/",
      rows: [
        {
          storeName: "Store A",
          outcome: "OUT_OF_STOCK",
          priceEur: null,
          observedAtIso: "2026-10-30T10:00:00.000Z",
          evidenceTx: null,
          payoutTx: null,
          flags: { fakePayments: true },
        },
      ],
    });
    expect(md).toContain("Not on the shelf");
    expect(md).toContain("not a stock count");
    expect(md).toContain("simulated");
  });
});

describe("prompts never carry expected values (ADR-19)", () => {
  it("contain no gesture, code or price from a task", () => {
    for (const outcome of ["OBSERVED", "OUT_OF_STOCK"] as const) {
      const p = buildExtractPrompt(outcome);
      expect(p).not.toMatch(/\b[2-5] fingers\b/);
      expect(p).not.toMatch(/K7Q|4XM/);
      expect(p).toContain("is NOT a screen");
    }
  });
});
