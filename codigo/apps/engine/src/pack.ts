import { PackConfigSchema } from "@shelfie/core";
import type { Claim, Decision, Job, Outcome, PackConfig, Verdict } from "@shelfie/core";
import type { CatalogProduct, CatalogStore } from "@shelfie/core";

/**
 * Engine-side view of the domain pack: its validated config plus the report renderer.
 * TODO(integration): replace `defaultShelfPack` with `shelfPack` from `@shelfie/domain-shelf` when
 * it exports it (PackConfig + rules). Until then the config below mirrors contracts.md section 6
 * and the report text lives here. The engine itself never mentions shelves outside this file.
 */
export interface ReportContext {
  job: Job;
  store: CatalogStore;
  product: CatalogProduct;
  outcome: Outcome;
  verdict: Verdict;
  decidedAt: string;
  verifyTx: string | null;
  payoutTx: string | null;
  overridden: boolean;
  fakePayments: boolean;
  explorerTxBase: string;
  payoutLovelace: string;
}

export interface EnginePack {
  config: PackConfig;
  renderReport(ctx: ReportContext): string;
}

export function defaultShelfPack(opts: {
  payoutLovelace: string;
  maxAttempts: number;
  claimTtlSec: number;
  challengeMode?: "gesture" | "handwritten" | "card-pool";
}): EnginePack {
  const config = PackConfigSchema.parse({
    id: "shelf-check",
    version: "1",
    jobInputSchemaRef: "./schemas/job-input.schema.json",
    worker: {
      kind: "human",
      capture: "photo",
      challenge: {
        mode: opts.challengeMode ?? "handwritten",
        alphabet: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
        length: 6,
        ttlSec: opts.claimTtlSec,
        cardPool: null,
      },
      maxAttempts: opts.maxAttempts,
      instructions: [
        "Find the product",
        "Write the code on paper",
        "Hold it next to the price tag",
        "Take one photo, tag and code readable",
      ],
    },
    extraction: {
      promptRef: "./prompts/extract.md",
      outputSchemaRef: "./schemas/extraction.schema.json",
      imageRequired: true,
    },
    rules: [],
    outOfStock: {
      enabled: true,
      rules: [],
      payoutLovelace: opts.payoutLovelace,
      reportTemplateRef: "./report/oos.md.hbs",
    },
    location: {
      defaultGeofenceM: 150,
      accuracyCapM: 100,
      maxAccuracyM: 300,
      maxFixAgeMs: 30000,
      maxTries: 3,
    },
    payout: { amountLovelace: opts.payoutLovelace, perTask: true },
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
  });
  return { config, renderReport };
}

function readPriceText(verdict: Verdict): string | null {
  const price = verdict.extraction["price"];
  if (price !== null && typeof price === "object") {
    const text = (price as Record<string, unknown>)["text"];
    if (typeof text === "string" && text.length > 0) return text.slice(0, 40);
  }
  return null;
}

/** Markdown report returned to the shell as the job result. No photos, no coordinates, no names. */
function renderReport(ctx: ReportContext): string {
  const { job, store, product, outcome, verdict } = ctx;
  const lines: string[] = ["# Shelf check report", ""];
  lines.push(`- Job: ${job.id}`);
  lines.push(`- Store: ${store.name} (${store.chain}), ${store.address}`);
  lines.push(`- Product: ${product.name} (EAN ${product.ean})`);
  if (outcome === "OUT_OF_STOCK") {
    lines.push(`- Result: out of stock at ${store.name}, ${ctx.decidedAt}`);
    lines.push(
      "- Observation: the shelf spot for this product was empty and the shelf label was verified.",
    );
  } else {
    const price = readPriceText(verdict);
    lines.push(`- Result: price observed${price !== null ? `: ${price} EUR` : ""}`);
    lines.push(`- Observed at: ${verdict.createdAt}`);
  }
  lines.push(`- Verdict: ${verdict.pass ? "PASS" : "FAIL"} (${verdict.source})`);
  if (ctx.overridden) lines.push("- Note: this verdict was set by an operator override (demo).");
  lines.push(`- Verification payment tx: ${ctx.verifyTx ?? "none"}`);
  lines.push(`- Worker payout tx: ${ctx.payoutTx ?? "pending"}`);
  lines.push(`- Decided: ${ctx.decidedAt}`);
  lines.push("");
  return lines.join("\n");
}

export type { Claim, Decision };
