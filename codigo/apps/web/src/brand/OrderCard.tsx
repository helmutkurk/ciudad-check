import type { CatalogResponse, OrderView } from "@shelfie/core/browser";
import { Pill } from "../ui/index.js";
import { statusLabel } from "../dashboard/OrderStatus.js";
import { resultPill } from "./model.js";

const eur = (value: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value);

/** One shelf request with the outcome of each store check, in the dashboard's terms. */
export function OrderCard(props: {
  order: OrderView;
  catalog: CatalogResponse | undefined;
  onOpenJob: (id: string) => void;
}) {
  const { order } = props;
  const stores = props.catalog?.cities.flatMap((c) => c.stores) ?? [];
  const product = props.catalog?.cities
    .flatMap((c) => c.products)
    .find((p) => p.ean === order.productEan);
  return (
    <section className="dcard" aria-label={`Order ${order.orderId}`}>
      <h2 className="dh2">{product?.name ?? order.productEan}</h2>
      <p className="dsub">Order {order.orderId}</p>
      {order.fake ? <p className="footnote">Fake order. No real purchase or escrow.</p> : null}
      <ul className="order-stores" aria-live="polite">
        {order.jobs.map((row) => {
          const store = stores.find((s) => s.id === row.storeId);
          const status = resultPill(row) ?? statusLabel(row.status);
          const result = row.result;
          return (
            <li key={row.storeId}>
              <div>
                <strong>{store?.name ?? row.storeId}</strong>
                <p className="dsub">{store?.address}</p>
              </div>
              <Pill tone={status.tone}>{status.label}</Pill>
              {result?.outcome === "passed" ? (
                <p className="dsub">
                  {result.priceEur !== undefined
                    ? `Price on the shelf: ${eur(result.priceEur)}.`
                    : "Price photo verified."}
                </p>
              ) : null}
              {result?.outcome === "out_of_stock" ? (
                <p className="dsub">Photo shows the product is not on the shelf.</p>
              ) : null}
              {result?.outcome === "failed" ? (
                <p className="dsub">
                  {result.reason ?? "The photo did not pass the checks."} Result withheld; your
                  credits are refunded through the escrow.
                </p>
              ) : null}
              {result?.outcome === "timed_out" ? (
                <p className="dsub">
                  No photo passed before the window ended. Result withheld; your credits are
                  refunded through the escrow.
                </p>
              ) : null}
              {row.credits !== undefined ? (
                <p className="footnote">{row.credits} credits (Sokosumi preprod).</p>
              ) : null}
              {row.jobId ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => props.onOpenJob(row.jobId!)}
                >
                  {result?.reportReady ? "Photo report and timeline" : "Timeline"} ·{" "}
                  {store?.name ?? row.storeId}
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
