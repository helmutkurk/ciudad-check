import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FakeClock } from "@shelfie/core";
import { LabelsFileSchema, computeMetrics, execute, loadLabels } from "./index.js";

const tmp = (): string => mkdtempSync(join(tmpdir(), "shelfie-eval-"));

describe("labels", () => {
  it("the committed labels.json is valid and has placeholder entries only", () => {
    const f = loadLabels(fileURLToPath(new URL("../labels.json", import.meta.url)));
    expect(f.labels.length).toBeGreaterThanOrEqual(2);
    expect(f.labels.length).toBeLessThanOrEqual(3);
    expect(f.labels.every((l) => l.file.startsWith("placeholder-"))).toBe(true);
    expect(f.labels.some((l) => l.outcome === "OUT_OF_STOCK")).toBe(true);
  });

  it("rejects unknown cases, extra gate names and duplicate files", () => {
    const bad = LabelsFileSchema.safeParse({ version: 1, labels: [{ file: "a.jpg", case: "nope" }] });
    expect(bad.success).toBe(false);
    const dir = tmp();
    const p = join(dir, "l.json");
    const one = {
      file: "a.jpg",
      case: "valid",
      expectedCode: "K7Q-4XM",
      product: { name: "x", ean: "4000000000000" },
      expect: { pass: true },
    };
    writeFileSync(p, JSON.stringify({ version: 1, labels: [one, one] }));
    expect(() => loadLabels(p)).toThrow(/duplicate/);
  });
});

describe("runner in stub mode (no keys, no photos)", () => {
  it("runs every label on synthetic photos, matches the labels and writes json plus markdown", async () => {
    const out = tmp();
    const clock = new FakeClock("2026-10-30T12:00:00.000Z");
    const r = await execute({ mode: "stub", outDir: out, clock, write: true });
    expect(r.metrics.ran).toBe(3);
    expect(r.metrics.matched).toBe(3);
    expect(r.metrics.confusion).toEqual({ tp: 2, fp: 0, fn: 0, tn: 1 });
    expect(r.metrics.reasonHistogram).toEqual({ code_mismatch: 1 });
    expect(r.results.meta.synthetic).toBe(true);
    expect(r.markdown).toMatch(/NOT evidence/);
    expect(r.jsonPath).toContain("2026-10-30T12-00-00-000Z.json");
  });

  it("replays stored extractions offline with the same verdicts (threshold tuning without model calls)", async () => {
    const out = tmp();
    const first = await execute({ mode: "stub", outDir: out, write: true });
    const again = await execute({ mode: "replay", replayFrom: first.jsonPath ?? "", synthetic: true, write: false });
    expect(again.results.entries.map((e) => e.actual?.pass)).toEqual(first.results.entries.map((e) => e.actual?.pass));
    expect(again.metrics.matched).toBe(first.metrics.matched);
    expect(again.results.meta.mode).toBe("replay");
  });

  it("reports missing photos instead of failing when synthetic is off", async () => {
    const r = await execute({ mode: "stub", synthetic: false, photosDir: tmp(), write: false });
    expect(r.metrics.missingPhoto).toBe(3);
    expect(r.metrics.ran).toBe(0);
    expect(r.markdown).toMatch(/Missing photos/);
  });
});

describe("metrics", () => {
  it("counts false accepts and false rejects per the acceptance table", () => {
    const mk = (c: string, outcome: "OBSERVED" | "OUT_OF_STOCK", expectPass: boolean, actualPass: boolean) => ({
      file: `${c}.jpg`,
      outcome,
      case: c,
      status: "ran" as const,
      expect: { pass: expectPass, failedGates: [], reasonCodes: [], reasonCodesAnyOf: [] },
      actual: {
        pass: actualPass,
        failedGates: actualPass ? [] : ["code_match"],
        reasonCodes: actualPass ? [] : ["code_mismatch"],
        extraction: {},
        workerMessage: "",
        model: { provider: "x", id: "y", latencyMs: 100 },
        wallLatencyMs: 100,
      },
      matched: expectPass === actualPass,
      decisionCorrect: expectPass === actualPass,
      codeReadExact: true,
      priceExact: true,
    });
    const m = computeMetrics([
      mk("valid", "OBSERVED", true, false),
      mk("wrong_code", "OBSERVED", false, true),
      mk("oos_product_present", "OUT_OF_STOCK", false, true),
    ] as never);
    expect(m.falseRejectValid).toEqual({ n: 1, of: 1 });
    expect(m.falseAcceptPrice).toEqual({ n: 1, of: 1 });
    expect(m.falseAcceptOos).toEqual({ n: 1, of: 1 });
    expect(m.productPresentAccepted).toEqual({ n: 1, of: 1 });
    expect(m.latencyMs.p95).toBe(100);
  });
});
