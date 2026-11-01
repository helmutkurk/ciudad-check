import type { BrandTransaction, CatalogResponse } from "@shelfie/core/browser";
import { TxChip } from "../dashboard/TxChip.js";
import { formatTime } from "../lib/format.js";
import { txKindLabel } from "./model.js";

/**
 * On-chain transactions of the brand's own store checks. The engine already scopes them to the
 * signed-in brand; `jobId` narrows the list to one check. Every hash links to the preprod explorer.
 */
export function TransactionList(props: {
  transactions: BrandTransaction[] | undefined;
  catalog: CatalogResponse | undefined;
  jobId?: string | undefined;
  title?: string | undefined;
  limit?: number | undefined;
}) {
  const stores = props.catalog?.cities.flatMap((c) => c.stores) ?? [];
  const all = (props.transactions ?? []).filter(
    (t) => props.jobId === undefined || t.jobId === props.jobId,
  );
  const rows = props.limit === undefined ? all : all.slice(0, props.limit);
  const title = props.title ?? "Transactions";
  return (
    <section className="dcard" aria-label={title}>
      <h2 className="dh2">{title}</h2>
      {props.transactions === undefined ? (
        <p className="dsub">Transactions are not available right now.</p>
      ) : rows.length === 0 ? (
        <p className="dsub">No transactions yet. They appear as the escrow and payments happen.</p>
      ) : (
        <ul className="jlist">
          {rows.map((t) => (
            <li key={`${t.jobId}:${t.kind}:${t.txHash}`} className="jrow">
              <span className="jrow-main">
                <span className="jrow-title">{txKindLabel(t.kind)}</span>
                <span className="jrow-sub">
                  {stores.find((s) => s.id === t.storeId)?.name ?? t.storeId}
                  {t.ts ? `, ${formatTime(t.ts)}` : ""}
                </span>
              </span>
              <span className="jrow-side">
                <TxChip hash={t.txHash} explorerUrl={t.explorerUrl} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {all.length > rows.length ? (
        <p className="dsub">{all.length - rows.length} more in Orders.</p>
      ) : null}
      <p className="footnote">Cardano preprod test transactions.</p>
    </section>
  );
}
