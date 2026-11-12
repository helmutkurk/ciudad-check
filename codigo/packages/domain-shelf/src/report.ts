import { lovelaceToAdaString } from "@shelfie/core";
import type { Outcome } from "@shelfie/core";

// Report template for the brand (delivered through the shell to Sokosumi). Columns follow
// pack.report.columns: store, price, verdict, evidenceTx, payoutTx. A passing OUT_OF_STOCK
// verdict is worded as an observation, not a stock count (verifier-rules.md section 2a).

export interface ReportRow {
  storeName: string;
  storeAddress?: string;
  outcome: Outcome;
  /** EUR, for OBSERVED. */
  priceEur: number | null;
  observedAtIso: string;
  /** Verifier x402 settlement tx hash (evidence of the check), if real. */
  evidenceTx: string | null;
  payoutTx: string | null;
  payoutLovelace?: string;
  /** The row came from fakes or a demo override: footnoted in the report. */
  flags?: { fakePayments?: boolean; demoOverride?: boolean };
}

export interface ReportInput {
  jobId: string;
  productName: string;
  productEan: string;
  generatedAtIso: string;
  rows: readonly ReportRow[];
  explorerTxBase: string;
}

const eur = (v: number): string => `${v.toFixed(2).replace(".", ",")} EUR`;
const cell = (s: string): string => s.replace(/\|/g, "/").replace(/\r?\n/g, " ");

export function renderReport(input: ReportInput): string {
  const link = (tx: string | null): string =>
    tx === null ? "-" : `[${tx.slice(0, 10)}...](${input.explorerTxBase}${tx})`;
  const lines: string[] = [
    `# Shelf check report`,
    ``,
    `Job ${cell(input.jobId)} | Product: ${cell(input.productName)} (EAN ${cell(input.productEan)}) | Generated ${input.generatedAtIso}`,
    ``,
    `| Store | Result | Price | Verdict | Evidence tx | Payout tx |`,
    `|---|---|---|---|---|---|`,
  ];
  const notes = new Set<string>();
  for (const row of input.rows) {
    const result =
      row.outcome === "OUT_OF_STOCK" ? "Not on the shelf at photo time" : "Price observed";
    const price = row.outcome === "OBSERVED" && row.priceEur !== null ? eur(row.priceEur) : "-";
    lines.push(
      `| ${cell(row.storeName)} | ${result} | ${price} | verified | ${link(row.evidenceTx)} | ${link(row.payoutTx)} |`,
    );
    if (row.outcome === "OUT_OF_STOCK") {
      notes.add(
        "Out of stock means: at the time of the photo the shelf label of the product was read at the shelf spot and no product was visible in the facing. It does not say why (sold out, delisted, misplaced, stored in the back) and is not a stock count.",
      );
    }
    if (row.flags?.fakePayments) notes.add("Payments in this row were simulated (fake mode).");
    if (row.flags?.demoOverride) notes.add("This row was accepted through the demo override.");
    if (row.payoutLovelace) {
      notes.add(`Worker payout per accepted photo: ${lovelaceToAdaString(row.payoutLovelace)} tADA (preprod).`);
    }
  }
  if (notes.size > 0) {
    lines.push(``, `Notes:`);
    for (const n of notes) lines.push(`- ${n}`);
  }
  lines.push(
    ``,
    `Method: one photo per store with a one-time challenge code; the price was read by a vision model and accepted by deterministic rules. Location checks are soft (browser geolocation).`,
  );
  return lines.join("\n");
}
