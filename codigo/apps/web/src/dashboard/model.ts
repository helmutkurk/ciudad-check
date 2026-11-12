import { TaskSpecSchema } from "@shelfie/core/browser";
import type {
  CatalogResponse,
  JobState,
  JobView,
  LedgerEvent,
  TaskState,
} from "@shelfie/core/browser";
import type { Tone } from "../ui/index.js";

export const ACTIVE_JOB_STATES: readonly JobState[] = [
  "RECEIVED",
  "COLLECTING",
  "DECIDING",
  "DELIVERABLE",
];

/** Counts on the overview cover only this many of the newest requests (GET /api/jobs has no totals). */
export const JOB_WINDOW = 10;

export type JobFilter = "all" | "active" | "delivered" | "failed" | "timeout";

/**
 * Active means a decision or settlement is still pending. A test job (`source: "demo"`) has no
 * escrow, so nobody reports RESULT_SUBMITTED: once DELIVERABLE it is finished, not active.
 */
export function isActiveJob(view: Pick<JobView, "job">): boolean {
  if (view.job.state === "DELIVERABLE" && view.job.source === "demo") return false;
  return ACTIVE_JOB_STATES.includes(view.job.state);
}

export type JobOutcome = "active" | "delivered" | "failed" | "timeout";

/**
 * Finished outcome for the Done filters: delivered (result delivered), failed (photos rejected,
 * input rejected or cancelled) or timeout (withheld with no rejected photo: nobody delivered one).
 */
export function jobOutcome(view: Pick<JobView, "job" | "counts">): JobOutcome {
  if (isActiveJob(view)) return "active";
  switch (view.job.state) {
    case "DELIVERABLE":
    case "DELIVERED":
    case "SETTLED":
      return "delivered";
    case "WITHHELD":
    case "REFUNDED":
      return view.counts.failed > 0 ? "failed" : "timeout";
    default:
      return "failed";
  }
}

export function matchesFilter(view: Pick<JobView, "job" | "counts">, filter: JobFilter): boolean {
  return filter === "all" || jobOutcome(view) === filter;
}

/** Status pill for a job row: a finished test job reads "Delivered (test)". */
export function jobViewStatus(view: Pick<JobView, "job">): { label: string; tone: Tone } {
  if (view.job.state === "DELIVERABLE" && view.job.source === "demo") {
    return { label: "Delivered (test)", tone: "success" };
  }
  return jobStatus(view.job.state);
}

export function jobStatus(state: JobState): { label: string; tone: Tone } {
  switch (state) {
    case "RECEIVED":
    case "COLLECTING":
      return { label: "Open", tone: "neutral" };
    case "DECIDING":
    case "DELIVERABLE":
      return { label: "Verifying", tone: "warning" };
    case "DELIVERED":
    case "SETTLED":
      return { label: "Delivered", tone: "success" };
    case "WITHHELD":
      return { label: "Withheld", tone: "warning" };
    case "REFUNDED":
      return { label: "Refunded", tone: "warning" };
    case "REJECTED_INPUT":
      return { label: "Rejected", tone: "error" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
  }
}

export function taskStatus(state: TaskState): { label: string; tone: Tone } {
  switch (state) {
    case "OPEN":
      return { label: "Open", tone: "neutral" };
    case "CLAIMED":
      return { label: "Claimed", tone: "neutral" };
    case "SUBMITTED":
    case "VERIFYING":
      return { label: "Verifying", tone: "warning" };
    case "ACCEPTED":
      return { label: "Verified", tone: "success" };
    case "PAID":
      return { label: "Paid", tone: "success" };
    case "FAILED":
      return { label: "Rejected", tone: "error" };
    case "EXPIRED":
      return { label: "Expired", tone: "warning" };
  }
}

/** One plain sentence for the job detail (ui-design.md B3). */
export function jobSentence(view: JobView): string {
  switch (view.job.state) {
    case "DELIVERED":
    case "SETTLED":
      return view.decision === "DELIVER" &&
        view.tasks.some((t) => t.acceptedOutcome === "OUT_OF_STOCK")
        ? "Delivered: not on the shelf."
        : "Delivered.";
    case "WITHHELD":
    case "REFUNDED":
      return "Result withheld. Your fee is refunded.";
    case "REJECTED_INPUT":
      return "This request was not accepted.";
    case "CANCELLED":
      return "Cancelled.";
    case "DELIVERABLE":
      return view.job.source === "demo" ? "Delivered (test job, no escrow)." : "Deciding.";
    case "DECIDING":
      return "Deciding.";
    default:
      if (view.tasks.some((t) => t.state === "SUBMITTED" || t.state === "VERIFYING")) {
        return "Photo is being verified.";
      }
      if (view.tasks.some((t) => t.state === "CLAIMED")) return "A worker is on it.";
      return "Waiting for a worker.";
  }
}

/** Product and store names resolved from the public catalog (the job view carries ids only). */
export function describeJob(
  view: JobView,
  catalog: CatalogResponse | undefined,
): { title: string; subtitle: string } {
  const spec = TaskSpecSchema.safeParse(view.tasks[0]?.spec);
  if (!spec.success) return { title: view.job.externalRef, subtitle: view.job.id };
  const stores = catalog?.cities.flatMap((c) => c.stores) ?? [];
  const products = catalog?.cities.flatMap((c) => c.products) ?? [];
  const store = stores.find((s) => s.id === spec.data.storeId);
  const product = products.find((p) => p.ean === spec.data.productEan);
  return {
    title: product?.name ?? spec.data.productEan,
    subtitle: store ? `${store.name}, ${store.address}` : spec.data.storeId,
  };
}

/** Ledger entries that belong to a job (by `refs.jobId` or one of its task ids). */
export function entriesForJob(entries: readonly LedgerEvent[], view: JobView): LedgerEvent[] {
  const taskIds = new Set(view.tasks.map((t) => t.id as string));
  return entries.filter((e) => {
    const refs = e.refs;
    return (
      refs["jobId"] === view.job.id || (refs["taskId"] !== undefined && taskIds.has(refs["taskId"]))
    );
  });
}

export function receiptLabel(kind: LedgerEvent["kind"]): string | undefined {
  switch (kind) {
    case "ESCROW_LOCKED":
      return "Escrow lock";
    case "VERIFY_PAID":
      return "Verification payment";
    case "PAYOUT_SUBMITTED":
    case "PAYOUT_CONFIRMED":
    case "PAYOUT_MARKED_PAID":
      return "Worker payout";
    case "RESULT_SUBMITTED":
      return "Result submitted";
    case "SETTLED":
      return "Settlement";
    case "REFUND_OBSERVED":
      return "Refund";
    default:
      return undefined;
  }
}
