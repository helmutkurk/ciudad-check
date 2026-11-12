import type { CatalogResponse, OrderView } from "@shelfie/core/browser";
import { Pill } from "../ui/index.js";
import { jobStatus, taskStatus } from "./model.js";

export function statusLabel(status: OrderView["jobs"][number]["status"]) {
  switch (status) {
    case "SUBMITTING":
      return { label: "Placing order", tone: "neutral" as const };
    case "AWAITING_SHELL":
      return { label: "Locking payment in escrow (2-3 min)", tone: "neutral" as const };
    case "SOKOSUMI_UNAVAILABLE":
      return { label: "Needs reconciliation", tone: "warning" as const };
    case "SETTLED":
      return { label: "Settled", tone: "success" as const };
    case "REFUNDED":
      return { label: "Refunded", tone: "neutral" as const };
    case "OPEN":
    case "CLAIMED":
    case "SUBMITTED":
    case "VERIFYING":
    case "ACCEPTED":
    case "PAID":
    case "FAILED":
    case "EXPIRED":
      return taskStatus(status);
    default:
      return jobStatus(status);
  }
}

export function OrderStatus(props: {
  order: OrderView;
  catalog: CatalogResponse | undefined;
  onOpenJob: (id: string) => void;
}) {
  const stores = props.catalog?.cities.flatMap((c) => c.stores) ?? [];
  const product = props.catalog?.cities
    .flatMap((c) => c.products)
    .find((p) => p.ean === props.order.productEan);
  return (
    <section className="dcard" aria-label={`Order ${props.order.orderId}`}>
      <h2 className="dh2">{product?.name ?? props.order.productEan}</h2>
      <p className="dsub">Order {props.order.orderId}</p>
      {props.order.fake ? (
        <p className="footnote">Fake order. No real purchase or escrow.</p>
      ) : null}
      <ul className="order-stores" aria-live="polite">
        {props.order.jobs.map((row) => {
          const store = stores.find((s) => s.id === row.storeId);
          const status = statusLabel(row.status);
          return (
            <li key={row.storeId}>
              <div>
                <strong>{store?.name ?? row.storeId}</strong>
                <p className="dsub">{store?.address}</p>
              </div>
              <Pill tone={status.tone}>{status.label}</Pill>
              {row.jobId ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => props.onOpenJob(row.jobId!)}
                >
                  Timeline and report · {store?.name ?? row.storeId}
                </button>
              ) : null}
              {row.status === "SOKOSUMI_UNAVAILABLE" ? (
                <p className="footnote">
                  The purchase outcome is uncertain. Contact the operator before ordering again.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
