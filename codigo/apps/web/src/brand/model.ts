import type { BrandTransaction, OrderView } from "@shelfie/core/browser";

// Pure helpers for the brand app (/b). Everything here works on the brand's own orders only:
// the engine already scopes GET /api/orders to the signed-in brand (ADR-21).

export type OrderRow = OrderView["jobs"][number];

/** Order job statuses that mean a result was delivered (escrow settled or settling). */
const DELIVERED: readonly string[] = ["DELIVERED", "SETTLED"];
/** Order job statuses that mean no result will be delivered (escrow refunded or withheld). */
const REFUNDED: readonly string[] = ["WITHHELD", "REFUNDED"];

export interface BrandCounts {
  /** Shelf requests (orders). */
  requests: number;
  /** Store rows across all requests: one shelf check per store. */
  stores: number;
  delivered: number;
  refunded: number;
}

/** Four counts over the brand's orders, derived from the order job statuses. */
export function brandCounts(orders: readonly OrderView[]): BrandCounts {
  const rows = orders.flatMap((o) => o.jobs);
  return {
    requests: orders.length,
    stores: rows.length,
    delivered: rows.filter((r) => DELIVERED.includes(r.status)).length,
    refunded: rows.filter((r) => REFUNDED.includes(r.status)).length,
  };
}

export interface RecentRow {
  orderId: string;
  productEan: string;
  storeId: string;
  jobId: string | null;
  status: OrderRow["status"];
  createdAt: string;
}

/** Newest store rows first (orders arrive newest first; rows keep their order). */
export function recentRows(orders: readonly OrderView[], limit: number): RecentRow[] {
  const out: RecentRow[] = [];
  for (const order of orders) {
    for (const row of order.jobs) {
      out.push({
        orderId: order.orderId,
        productEan: order.productEan,
        storeId: row.storeId,
        jobId: row.jobId,
        status: row.status,
        createdAt: order.createdAt,
      });
    }
  }
  return out.slice(0, limit);
}

/** A job may be opened from the brand app only when one of the brand's orders owns it. */
export function jobBelongsTo(orders: readonly OrderView[], jobId: string): boolean {
  return orders.some((o) => o.jobs.some((r) => r.jobId === jobId));
}

/** Latest Sokosumi price (credits) recorded on one of the brand's store checks, if any. */
export function lastPriceCredits(orders: readonly OrderView[] | undefined): number | undefined {
  for (const order of orders ?? []) {
    for (const row of order.jobs) if (row.credits !== undefined) return row.credits;
  }
  return undefined;
}

const TX_LABELS: Record<BrandTransaction["kind"], string> = {
  escrow_lock: "Escrow lock",
  result_submitted: "Result submitted",
  settlement: "Settlement",
  refund: "Refund",
  verifier_fee: "Verifier fee (x402)",
  worker_payout: "Worker payout",
};

export function txKindLabel(kind: BrandTransaction["kind"]): string {
  return TX_LABELS[kind];
}

/** Store check result as a status pill, in the dashboard's terms (Verified, Rejected, Expired...). */
export function resultPill(row: OrderRow): {
  label: string;
  tone: "success" | "error" | "warning" | "neutral";
} | null {
  switch (row.result?.outcome) {
    case "passed":
      return { label: "Passed", tone: "success" };
    case "out_of_stock":
      return { label: "Not on the shelf", tone: "success" };
    case "failed":
      return { label: "Failed, refunded", tone: "error" };
    case "timed_out":
      return { label: "Timed out, refunded", tone: "warning" };
    default:
      return null;
  }
}
