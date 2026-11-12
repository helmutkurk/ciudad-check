import type {
  BrandProfile,
  BrandTransaction,
  CatalogResponse,
  LedgerEvent,
  OrderView,
} from "@shelfie/core/browser";
import { JobDetail } from "../dashboard/JobDetail.js";
import { RequestForm } from "../dashboard/RequestForm.js";
import { OrderCard } from "./OrderCard.js";
import { TransactionList } from "./TransactionList.js";
import { jobBelongsTo, lastPriceCredits } from "./model.js";

/** Orders-section state: an open shelf request, or the new-request form. */
export interface OrdersView {
  jobId: string | null;
  composing: boolean;
}

/**
 * Orders section: the catalog form (token from sign-in), the brand's shelf requests, and the
 * timeline of one request. A job opens only when one of the brand's orders owns it.
 */
export function BrandOrders(props: {
  token: string;
  profile: BrandProfile;
  enabled: boolean;
  orders: OrderView[] | undefined;
  catalog: CatalogResponse | undefined;
  ledger: readonly LedgerEvent[];
  transactions: BrandTransaction[] | undefined;
  view: OrdersView;
  onView: (next: OrdersView) => void;
  onCreated: () => void;
}) {
  const { view } = props;
  const orders = props.orders ?? [];
  const home = () => props.onView({ jobId: null, composing: false });
  const openJob = (jobId: string) => props.onView({ jobId, composing: false });
  const jobOwned = view.jobId !== null && jobBelongsTo(orders, view.jobId);
  const dataView = view.composing ? "new" : view.jobId !== null ? "job" : "orders";

  return (
    <div className="dpage">
      <header className="dpage-head">
        <div>
          <h1 className="dh1">Orders</h1>
          <p className="dsub">One shelf check per store. Follow each store to its report.</p>
        </div>
      </header>
      <div className="dgrid" data-view={dataView}>
        <div className="dcol dcol-form">
          <button type="button" className="dback" onClick={home}>
            ‹ Requests
          </button>
          <RequestForm
            title="New shelf request"
            catalog={props.catalog}
            brandToken={props.token}
            enabled={props.enabled}
            fake={props.profile.fake}
            maxStores={props.profile.maxStores}
            maxCreditsPerTask={props.profile.maxCreditsPerTask}
            lastPriceCredits={lastPriceCredits(props.orders)}
            onCreated={() => props.onCreated()}
          />
        </div>
        <div className="dcol dcol-list">
          <button
            type="button"
            className="button button-primary new-check"
            onClick={() => props.onView({ jobId: view.jobId, composing: true })}
          >
            New shelf request
          </button>
          {props.orders === undefined ? <p className="dsub">Loading shelf requests.</p> : null}
          {props.orders !== undefined && orders.length === 0 ? (
            <p className="dsub">No shelf requests yet.</p>
          ) : null}
          <section aria-label="Shelf requests" className="dstack">
            {orders.map((order) => (
              <OrderCard
                key={order.orderId}
                order={order}
                catalog={props.catalog}
                onOpenJob={openJob}
              />
            ))}
          </section>
          <TransactionList transactions={props.transactions} catalog={props.catalog} limit={10} />
        </div>
        <div className="dcol dcol-detail">
          {view.jobId !== null && jobOwned ? (
            <>
              <JobDetail
                jobId={view.jobId}
                catalog={props.catalog}
                ledger={props.ledger}
                onBack={home}
              />
              <TransactionList
                transactions={props.transactions}
                catalog={props.catalog}
                jobId={view.jobId}
                title="Transactions of this check"
              />
            </>
          ) : (
            <section className="dcard dhint" aria-label="Request detail">
              <h2 className="dh2">Shelf request detail</h2>
              <p className="dsub">Select a shelf request to see its timeline and report.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
