import { shelfPack, loadCatalog, renderReport as renderShelfReport } from "@shelfie/domain-shelf";
import type { Verdict } from "@shelfie/core";
import { makeCatalog } from "./catalog.js";
import type { Catalog } from "./catalog.js";
import type { EnginePack, ReportContext } from "./pack.js";

// Adapter from @shelfie/domain-shelf (owner C) to the engine's pack and catalog seams.
// Used by main.ts. Tests use the local `defaultShelfPack` so they do not depend on pack edits.

function priceOf(verdict: Verdict): number | null {
  const price = (verdict.extraction)["price"];
  if (price !== null && typeof price === "object") {
    const v = (price as Record<string, unknown>)["value"];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

export function domainShelfPack(): EnginePack {
  return {
    config: shelfPack,
    renderReport(ctx: ReportContext): string {
      return renderShelfReport({
        jobId: ctx.job.id,
        productName: ctx.product.name,
        productEan: ctx.product.ean,
        generatedAtIso: ctx.decidedAt,
        explorerTxBase: ctx.explorerTxBase,
        rows: [
          {
            storeName: ctx.store.name,
            storeAddress: ctx.store.address,
            outcome: ctx.outcome,
            priceEur: priceOf(ctx.verdict),
            observedAtIso: ctx.verdict.createdAt,
            evidenceTx: ctx.verifyTx,
            payoutTx: ctx.payoutTx,
            payoutLovelace: ctx.payoutLovelace,
            flags: { fakePayments: ctx.fakePayments, demoOverride: ctx.overridden },
          },
        ],
      });
    },
  };
}

/** Catalog via `loadCatalog()` of @shelfie/domain-shelf; `issues` lists dropped or defaulted records. */
export function domainShelfCatalog(dir?: string): { catalog: Catalog; issues: number } {
  const c = loadCatalog(dir !== undefined ? { dir } : {});
  return { catalog: makeCatalog(c.stores, c.products), issues: c.issues.length };
}
