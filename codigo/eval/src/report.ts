import type { EntryResult, RunResults } from "./run.js";

// Metrics and acceptance table of verifier-rules.md section 7.

export interface Metrics {
  total: number;
  ran: number;
  missingPhoto: number;
  errors: number;
  matched: number;
  /** pass/fail confusion on the decision, over entries that ran. */
  confusion: { tp: number; fp: number; fn: number; tn: number };
  falseAcceptPrice: { n: number; of: number };
  falseAcceptOos: { n: number; of: number };
  falseRejectValid: { n: number; of: number };
  falseRejectHard: { n: number; of: number };
  priceExact: { n: number; of: number };
  codeRead: { n: number; of: number };
  oosValidAccepted: { n: number; of: number };
  productPresentAccepted: { n: number; of: number };
  reasonHistogram: Record<string, number>;
  gateFailHistogram: Record<string, number>;
  latencyMs: { mean: number | null; p95: number | null; max: number | null };
  perCase: Record<string, { n: number; matched: number; decisionCorrect: number }>;
}

const ran = (e: EntryResult): e is EntryResult & { actual: NonNullable<EntryResult["actual"]> } =>
  e.status === "ran" && e.actual !== null;

export function computeMetrics(entries: readonly EntryResult[]): Metrics {
  const r = entries.filter(ran);
  const count = (
    xs: readonly EntryResult[],
    f: (e: EntryResult) => boolean,
  ): { n: number; of: number } => ({
    n: xs.filter(f).length,
    of: xs.length,
  });
  const shouldFailPrice = r.filter((e) => e.outcome === "OBSERVED" && !e.expect.pass);
  const shouldFailOos = r.filter((e) => e.outcome === "OUT_OF_STOCK" && !e.expect.pass);
  const valid = r.filter((e) => e.case === "valid");
  const hard = r.filter((e) => e.case === "valid_hard");
  const oosValid = r.filter((e) => e.case === "oos_valid");
  const present = r.filter((e) => e.case === "oos_product_present");
  const reasons: Record<string, number> = {};
  const gates: Record<string, number> = {};
  for (const e of r) {
    for (const c of e.actual.reasonCodes) reasons[c] = (reasons[c] ?? 0) + 1;
    for (const g of e.actual.failedGates) gates[g] = (gates[g] ?? 0) + 1;
  }
  const lat = r
    .map((e) => e.actual.model.latencyMs)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const p95 =
    lat.length === 0
      ? null
      : (lat[Math.min(lat.length - 1, Math.ceil(lat.length * 0.95) - 1)] as number);
  const perCase: Metrics["perCase"] = {};
  for (const e of r) {
    const c = (perCase[e.case] ??= { n: 0, matched: 0, decisionCorrect: 0 });
    c.n++;
    if (e.matched) c.matched++;
    if (e.decisionCorrect) c.decisionCorrect++;
  }
  return {
    total: entries.length,
    ran: r.length,
    missingPhoto: entries.filter((e) => e.status === "missing_photo").length,
    errors: entries.filter((e) => e.status === "error").length,
    matched: r.filter((e) => e.matched).length,
    confusion: {
      tp: r.filter((e) => e.expect.pass && e.actual.pass).length,
      fp: r.filter((e) => !e.expect.pass && e.actual.pass).length,
      fn: r.filter((e) => e.expect.pass && !e.actual.pass).length,
      tn: r.filter((e) => !e.expect.pass && !e.actual.pass).length,
    },
    falseAcceptPrice: count(shouldFailPrice, (e) => e.actual?.pass === true),
    falseAcceptOos: count(shouldFailOos, (e) => e.actual?.pass === true),
    falseRejectValid: count(valid, (e) => e.actual?.pass === false),
    falseRejectHard: count(hard, (e) => e.actual?.pass === false),
    priceExact: count(
      [...valid, ...hard].filter((e) => e.priceExact !== null),
      (e) => e.priceExact === true,
    ),
    codeRead: count(
      [...valid, ...hard].filter((e) => e.codeReadExact !== null),
      (e) => e.codeReadExact === true,
    ),
    oosValidAccepted: count(oosValid, (e) => e.actual?.pass === true),
    productPresentAccepted: count(present, (e) => e.actual?.pass === true),
    reasonHistogram: reasons,
    gateFailHistogram: gates,
    latencyMs: {
      mean: lat.length === 0 ? null : Math.round(lat.reduce((a, b) => a + b, 0) / lat.length),
      p95,
      max: lat.length === 0 ? null : (lat[lat.length - 1] as number),
    },
    perCase,
  };
}

const frac = (x: { n: number; of: number }): string => `${String(x.n)} of ${String(x.of)}`;

interface Acceptance {
  name: string;
  value: string;
  target: string;
  ok: boolean | null;
}

export function acceptance(m: Metrics): Acceptance[] {
  const na = (x: { of: number }): boolean => x.of === 0;
  return [
    {
      name: "False accepts on should-fail price photos",
      value: frac(m.falseAcceptPrice),
      target: "0 (blocking for payments)",
      ok: na(m.falseAcceptPrice) ? null : m.falseAcceptPrice.n === 0,
    },
    {
      name: "False accepts on should-fail out-of-stock photos",
      value: frac(m.falseAcceptOos),
      target: "0 (blocking for payments)",
      ok: na(m.falseAcceptOos) ? null : m.falseAcceptOos.n === 0,
    },
    {
      name: "False rejects on valid price photos",
      value: frac(m.falseRejectValid),
      target: "at most 1 of 8",
      ok: na(m.falseRejectValid) ? null : m.falseRejectValid.n <= 1,
    },
    {
      name: "Price value exact on valid photos",
      value: frac(m.priceExact),
      target: "at least 7 of 8",
      ok: na(m.priceExact) ? null : m.priceExact.n >= Math.ceil(m.priceExact.of * 0.875),
    },
    {
      name: "Code read exact on valid photos",
      value: frac(m.codeRead),
      target: "at least 7 of 8",
      ok: na(m.codeRead) ? null : m.codeRead.n >= Math.ceil(m.codeRead.of * 0.875),
    },
    {
      name: "Valid out-of-stock photos accepted",
      value: frac(m.oosValidAccepted),
      target: "at least 2 of 3",
      ok: na(m.oosValidAccepted)
        ? null
        : m.oosValidAccepted.n >= Math.ceil(m.oosValidAccepted.of * 0.67),
    },
    {
      name: "Product-present photos accepted as out-of-stock",
      value: frac(m.productPresentAccepted),
      target: "0 (blocking for payments)",
      ok: na(m.productPresentAccepted) ? null : m.productPresentAccepted.n === 0,
    },
    {
      name: "Latency p95 (model call)",
      value: m.latencyMs.p95 === null ? "n/a" : `${String(m.latencyMs.p95)} ms`,
      target: "under 8000 ms",
      ok: m.latencyMs.p95 === null ? null : m.latencyMs.p95 < 8000,
    },
  ];
}

export function renderMarkdown(results: RunResults, m: Metrics): string {
  const { meta } = results;
  const lines: string[] = [];
  lines.push(`# Verifier evaluation`, ``);
  lines.push(
    `- Mode: ${meta.mode}${meta.synthetic ? " (synthetic photos, NOT evidence)" : ""}; provider: ${meta.provider}; models: ${meta.models.join(", ") || "n/a"}`,
    `- Started ${meta.startedAt}, finished ${meta.finishedAt}`,
    `- Labels: ${meta.labelsFile}; entries ${String(m.total)} (ran ${String(m.ran)}, missing photo ${String(m.missingPhoto)}, errors ${String(m.errors)})`,
    `- Cost per check: ${meta.costPerCheckEur === null ? "not recorded" : `${meta.costPerCheckEur.toFixed(4)} EUR`}`,
  );
  if (meta.note) lines.push(`- Note: ${meta.note}`);
  if (meta.mode === "stub" || meta.synthetic) {
    lines.push(
      ``,
      `> Stub or synthetic run: it exercises the pipeline only. It says nothing about model accuracy and is never used as evidence.`,
    );
  }
  lines.push(``, `## Decision confusion (expected vs actual pass)`, ``);
  lines.push(`| | actual PASS | actual FAIL |`, `|---|---|---|`);
  lines.push(
    `| expected PASS | ${String(m.confusion.tp)} | ${String(m.confusion.fn)} (false reject) |`,
  );
  lines.push(
    `| expected FAIL | ${String(m.confusion.fp)} (false accept) | ${String(m.confusion.tn)} |`,
  );
  lines.push(
    ``,
    `Entries matching their label completely (decision, gates, reason codes): ${String(m.matched)} of ${String(m.ran)}.`,
  );

  lines.push(
    ``,
    `## Acceptance (verifier-rules.md section 7)`,
    ``,
    `| Metric | Result | Target | Status |`,
    `|---|---|---|---|`,
  );
  for (const a of acceptance(m)) {
    lines.push(
      `| ${a.name} | ${a.value} | ${a.target} | ${a.ok === null ? "n/a" : a.ok ? "ok" : "MISSED"} |`,
    );
  }
  if (m.falseRejectHard.of > 0) {
    lines.push(
      ``,
      `Hard valid photos (glare, angle) rejected: ${frac(m.falseRejectHard)} (counted separately, not a safety failure).`,
    );
  }

  lines.push(
    ``,
    `## Per case`,
    ``,
    `| Case | Photos | Decision correct | Fully matched |`,
    `|---|---|---|---|`,
  );
  for (const [c, v] of Object.entries(m.perCase).sort()) {
    lines.push(`| ${c} | ${String(v.n)} | ${String(v.decisionCorrect)} | ${String(v.matched)} |`);
  }

  lines.push(``, `## Reasons seen`, ``);
  const reasons = Object.entries(m.reasonHistogram).sort((a, b) => b[1] - a[1]);
  if (reasons.length === 0) lines.push(`No gate failed.`);
  else {
    lines.push(`| Reason code | Count |`, `|---|---|`);
    for (const [k, v] of reasons) lines.push(`| ${k} | ${String(v)} |`);
  }
  lines.push(
    ``,
    `Failed gates: ${
      Object.entries(m.gateFailHistogram)
        .map(([k, v]) => `${k} ${String(v)}`)
        .join(", ") || "none"
    }`,
  );

  lines.push(
    ``,
    `## Latency (model call)`,
    ``,
    `mean ${m.latencyMs.mean ?? "n/a"} ms, p95 ${m.latencyMs.p95 ?? "n/a"} ms, max ${m.latencyMs.max ?? "n/a"} ms`,
  );

  const mismatches = results.entries.filter((e) => e.status === "ran" && e.matched === false);
  lines.push(``, `## Mismatches`, ``);
  if (mismatches.length === 0) lines.push(`None.`);
  else {
    lines.push(`| File | Case | Expected | Actual |`, `|---|---|---|---|`);
    for (const e of mismatches) {
      const exp = e.expect.pass
        ? "PASS"
        : `FAIL ${[...e.expect.reasonCodes, ...e.expect.reasonCodesAnyOf].join("/")}`;
      const act = e.actual?.pass ? "PASS" : `FAIL ${e.actual?.reasonCodes.join("/") ?? ""}`;
      lines.push(`| ${e.file} | ${e.case} | ${exp.trim()} | ${act.trim()} |`);
    }
  }
  const errs = results.entries.filter((e) => e.status === "error");
  if (errs.length > 0) {
    lines.push(``, `## Errors`, ``);
    for (const e of errs)
      lines.push(
        `- ${e.file}: ${e.error?.code ?? "unknown"}${e.error?.reason ? ` (${e.error.reason}${e.error.httpStatus ? ` ${e.error.httpStatus}` : ""})` : ""}${e.error?.providerMessage ? `: ${e.error.providerMessage}` : ""}`,
      );
  }
  const missing = results.entries.filter((e) => e.status === "missing_photo");
  if (missing.length > 0) {
    lines.push(``, `## Missing photos`, ``, missing.map((e) => e.file).join(", "));
  }
  lines.push(``);
  return lines.join("\n");
}
