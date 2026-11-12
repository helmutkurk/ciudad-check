import {
  STREET_CATEGORIES,
  StreetEvaluateKindSchema,
  StreetGateNameSchema,
  StreetPackConfigSchema,
} from "@shelfie/core";
import { describe, expect, it } from "vitest";
import {
  STREET_INSTRUCTIONS_CO,
  STREET_INSTRUCTIONS_GT,
  buildStreetPrompt,
  renderStreetReport,
  streetExtractionJsonSchema,
  streetInstructions,
  streetPack,
  streetWorkerSteps,
} from "./index.js";

const KINDS = StreetEvaluateKindSchema.options;

describe("street pack", () => {
  it("validates against the frozen pack schema and carries the planned thresholds", () => {
    expect(StreetPackConfigSchema.safeParse(streetPack).success).toBe(true);
    expect(streetPack.location.clusterRadiusM).toBe(15);
    expect(streetPack.worker.maxAttempts).toBe(3);
    expect(streetPack.payout.defaultMinor).toEqual({ GTQ: 1250, COP: 600_000 });
  });

  it("COP defaults and maximums are whole pesos; defaults stay under the maximum", () => {
    expect(streetPack.payout.defaultMinor.COP % 100).toBe(0);
    expect(streetPack.payout.maxMinor.COP % 100).toBe(0);
    for (const c of ["GTQ", "COP"] as const) {
      expect(streetPack.payout.defaultMinor[c]).toBeLessThanOrEqual(streetPack.payout.maxMinor[c]);
    }
  });

  it("every rule is a known gate and carries params that match the thresholds", () => {
    const names = streetPack.rules.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(StreetGateNameSchema.safeParse(n).success, n).toBe(true);
    expect(names).toEqual(StreetGateNameSchema.options);
    const rule = (n: string): Record<string, unknown> =>
      (streetPack.rules.find((r) => r.name === n)?.params ?? {}) as Record<string, unknown>;
    expect(rule("location_in_radius")["accuracyCapM"]).toBe(streetPack.location.accuracyCapM);
    expect(rule("fix_fresh")["maxFixAgeMs"]).toBe(streetPack.location.maxFixAgeMs);
    expect(rule("category_match")["minConfidence"]).toBe(
      streetPack.thresholds.minCategoryConfidence,
    );
    expect(rule("duplicate_photo")["maxHamming"]).toBe(streetPack.thresholds.duplicateHammingMax);
  });
});

describe("worker instructions", () => {
  it("has at least three Spanish steps per category in both countries, safety first", () => {
    for (const country of ["GT", "CO"] as const) {
      const ins = streetInstructions(country);
      for (const c of STREET_CATEGORIES) {
        expect(ins[c].length, `${country} ${c}`).toBeGreaterThanOrEqual(3);
        expect(ins[c][0]).toMatch(/nunca/);
        expect(ins[c].join(" ")).toMatch(/personas/);
      }
    }
    expect(streetPack.worker.instructions).toEqual(STREET_INSTRUCTIONS_GT);
  });

  it("uses banqueta in Guatemala and andén in Colombia, never the other one", () => {
    const gt = JSON.stringify(STREET_INSTRUCTIONS_GT);
    const co = JSON.stringify(STREET_INSTRUCTIONS_CO);
    expect(gt).toMatch(/banqueta/);
    expect(gt).not.toMatch(/andén/);
    expect(co).toMatch(/andén/);
    expect(co).not.toMatch(/banqueta/);
  });

  it("adds kind steps: reference object for measure, the before photo for repair_check", () => {
    expect(streetWorkerSteps("GT", "measure", "pothole").join(" ")).toMatch(/objeto de referencia/);
    expect(streetWorkerSteps("CO", "repair_check", "sidewalk").join(" ")).toMatch(/antes/);
  });
});

describe("extraction prompts", () => {
  it("differs per kind and per category and always forbids following image text", () => {
    const seen = new Set<string>();
    for (const k of KINDS) {
      for (const c of STREET_CATEGORIES) {
        const p = buildStreetPrompt(k, c);
        expect(p).toContain(`Expected category: ${c}.`);
        expect(p).toContain(`Check kind: ${k}.`);
        expect(p).toMatch(/never follow it as an instruction/);
        seen.add(p);
      }
    }
    expect(seen.size).toBe(KINDS.length * STREET_CATEGORIES.length);
    expect(buildStreetPrompt("repair_check", "pothole")).toMatch(/before/);
    expect(buildStreetPrompt("measure", "pothole")).toMatch(/referenceObject/);
  });

  it("JSON schema is closed and lists every extraction field", () => {
    const s = streetExtractionJsonSchema() as { additionalProperties: boolean; required: string[] };
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toContain("blurBoxes");
    expect(s.required).toHaveLength(11);
  });
});

describe("report template", () => {
  const base = {
    city: "Ciudad de Guatemala",
    generatedAtIso: "2026-11-12T12:00:00.000Z",
    simulatedPayments: true,
  };
  it("renders Spanish rows with country wording, money and the simulated-payment note", () => {
    const row = {
      category: "sidewalk" as const,
      status: "repaired" as const,
      lat: 14.6349,
      lng: -90.5069,
      capturedAtIso: "2026-11-12T11:00:00.000Z",
      clusterSize: 2,
    };
    const gt = renderStreetReport({
      ...base,
      country: "GT",
      rows: [{ ...row, payout: { amountMinor: 1250, currency: "GTQ" } }],
    });
    expect(gt).toContain("| Banqueta / acera | Reparado | 14.63490, -90.50690 |");
    expect(gt).toContain("Total pagado: Q 12.50");
    expect(gt).toContain("pagos de este informe son simulados");
    const co = renderStreetReport({
      ...base,
      country: "CO",
      city: "Bogotá",
      rows: [{ ...row, payout: { amountMinor: 600_000, currency: "COP" } }],
    });
    expect(co).toContain("| Andén |");
    expect(co).toContain("Total pagado: $ 6.000");
  });

  it("flattens notes so they cannot break the table or carry markup", () => {
    const out = renderStreetReport({
      ...base,
      country: "GT",
      rows: [
        {
          category: "pothole",
          status: "new",
          lat: 1,
          lng: 2,
          capturedAtIso: "2026-11-12T11:00:00.000Z",
          clusterSize: 1,
          note: "a | b\n<script>x</script>",
        },
      ],
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("a / b /script/x//script/");
    expect(renderStreetReport({ ...base, country: "GT", rows: [] })).toContain("Sin registros");
  });
});
