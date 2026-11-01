import type { HealthResponse, LedgerEvent } from "@shelfie/core/browser";
import type { StreamStatus } from "../lib/sse.js";
import { formatTime, formatWalletBalance } from "../lib/format.js";
import { Pill } from "../ui/index.js";
import type { Tone } from "../ui/index.js";
import { TxChip } from "./TxChip.js";

function kindTone(kind: LedgerEvent["kind"]): Tone {
  switch (kind) {
    case "SETTLED":
    case "PAYOUT_CONFIRMED":
    case "PAYOUT_RECONCILED":
    case "PAYOUT_MARKED_PAID":
    case "VERDICT":
      return "success";
    case "INTAKE_REJECTED":
      return "error";
    case "OVERRIDE":
    case "ADMIN_ACTION":
    case "WITHHELD":
    case "REFUND_OBSERVED":
      return "warning";
    default:
      return "neutral";
  }
}

/** Sequence check: seq numbers must be contiguous. The engine owns the hash chain itself. */
export function sequenceGap(entries: readonly LedgerEvent[]): number | null {
  const seqs = entries.map((e) => e.seq).sort((a, b) => a - b);
  for (let i = 1; i < seqs.length; i++) {
    const prev = seqs[i - 1];
    const cur = seqs[i];
    if (prev !== undefined && cur !== undefined && cur !== prev + 1) return prev + 1;
  }
  return null;
}

/** B5 / C4: the ledger as a real table, wallet balances and chain status above it. */
export function LedgerView(props: {
  entries: readonly LedgerEvent[];
  status: StreamStatus;
  health: HealthResponse | undefined;
}) {
  const rows = [...props.entries].reverse();
  const gap = sequenceGap(props.entries);
  return (
    <section className="dcard" aria-label="Ledger">
      <div className="dcard-head">
        <h2 className="dh2">Ledger</h2>
        <span className={`dstatus ${gap === null ? "dstatus-ok" : "dstatus-down"}`}>
          <span className="dot" aria-hidden="true" />
          {gap === null ? `Sequence intact · ${rows.length} entries` : `Gap after seq ${gap - 1}`}
        </span>
      </div>
      {props.status === "reconnecting" ? (
        <p className="dnote" role="status">
          Reconnecting. The ledger refreshes every few seconds meanwhile.
        </p>
      ) : null}
      {props.health ? (
        <div className="tiles" aria-label="Wallets">
          <div className="tile">
            <span className="tile-label">Verification wallet</span>
            <span className="tile-value">{formatWalletBalance(props.health.wallets.vbuy)}</span>
          </div>
          <div className="tile">
            <span className="tile-label">Payout wallet</span>
            <span className="tile-value">{formatWalletBalance(props.health.wallets.pay)}</span>
            <span className="dsub">Queue {props.health.wallets.pay.queueDepth ?? 0}</span>
          </div>
        </div>
      ) : null}
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Seq</th>
              <th scope="col">Time</th>
              <th scope="col">Event</th>
              <th scope="col">Detail</th>
              <th scope="col">Transaction</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>No entries yet.</td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.seq}>
                  <td className="num">{e.seq}</td>
                  <td className="num">{formatTime(e.ts)}</td>
                  <td>
                    <Pill tone={kindTone(e.kind)}>{e.kind}</Pill>{" "}
                    {e.flags["demoOverride"] ? <Pill tone="warning">Override</Pill> : null}
                  </td>
                  <td className="ledger-detail">{e.note || Object.values(e.refs).join(" · ")}</td>
                  <td>
                    {e.txHash ? <TxChip hash={e.txHash} explorerUrl={e.explorerUrl} /> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
