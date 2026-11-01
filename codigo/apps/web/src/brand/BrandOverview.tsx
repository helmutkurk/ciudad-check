import type { BrandProfile, BrandSummary, CatalogResponse, OrderView } from "@shelfie/core/browser";
import { Pill } from "../ui/index.js";
import { Tile } from "../dashboard/Overview.js";
import { statusLabel } from "../dashboard/OrderStatus.js";
import { relativeTime, useNow } from "../dashboard/time.js";
import { brandCounts, recentRows } from "./model.js";
import { SpendCard } from "./SpendCard.js";

const RECENT = 5;

/**
 * Brand overview. Only the brand's own orders: with none, the page is a single round "+" button and
 * nothing else (no tiles, no containers), also while the first read is pending. With orders: four counts and the newest store rows.
 */
export function BrandOverview(props: {
  orders: OrderView[] | undefined;
  catalog: CatalogResponse | undefined;
  profile: BrandProfile;
  summary: BrandSummary | undefined;
  onNew: () => void;
  onOpenJob: (jobId: string) => void;
}) {
  const now = useNow();
  const { orders } = props;
  // Still loading or the first read failed: the "+" stays usable (the error shows above).
  if (orders === undefined || orders.length === 0) {
    return (
      <div className="dpage brand-empty">
        <button
          type="button"
          className="brand-plus"
          aria-label="New shelf request"
          onClick={props.onNew}
        ></button>
      </div>
    );
  }

  const counts = brandCounts(orders);
  const recent = recentRows(orders, RECENT);
  const products = props.catalog?.cities.flatMap((c) => c.products) ?? [];
  const stores = props.catalog?.cities.flatMap((c) => c.stores) ?? [];

  return (
    <div className="dpage">
      <header className="dpage-head">
        <div>
          <h1 className="dh1">Overview</h1>
          <p className="dsub">Your shelf requests and their results.</p>
        </div>
        <button type="button" className="button button-primary dpage-action" onClick={props.onNew}>
          New shelf request
        </button>
      </header>

      <section className="dcard" aria-label="Counts">
        <h2 className="dh2">Totals</h2>
        <div className="tiles tiles-big" aria-label="Request counts">
          <Tile label="Shelf requests" value={counts.requests} />
          <Tile label="Stores requested" value={counts.stores} />
          <Tile label="Delivered or settled" value={counts.delivered} />
          <Tile label="Refunded or withheld" value={counts.refunded} />
        </div>
        <p className="dsub">Counts cover all your shelf requests.</p>
      </section>

      <SpendCard profile={props.profile} summary={props.summary} />

      <section className="dcard" aria-label="Recent shelf requests">
        <h2 className="dh2">Recent</h2>
        <ul className="jlist">
          {recent.map((row) => {
            const productName =
              products.find((p) => p.ean === row.productEan)?.name ?? row.productEan;
            const store = stores.find((s) => s.id === row.storeId);
            const status = statusLabel(row.status);
            const jobId = row.jobId;
            const inner = (
              <>
                <span className="jrow-main">
                  <span className="jrow-title">{productName}</span>
                  <span className="jrow-sub">{store?.name ?? row.storeId}</span>
                </span>
                <span className="jrow-side">
                  <Pill tone={status.tone}>{status.label}</Pill>
                  <time className="jrow-time" dateTime={row.createdAt}>
                    {relativeTime(row.createdAt, now)}
                  </time>
                </span>
              </>
            );
            return (
              <li key={`${row.orderId}:${row.storeId}`}>
                {jobId ? (
                  <button type="button" className="jrow" onClick={() => props.onOpenJob(jobId)}>
                    {inner}
                  </button>
                ) : (
                  <div className="jrow">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
