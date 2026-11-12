import { addressUrl } from "@shelfie/evidence/explorer";
import type { SubmissionView, TaskListItem } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { usePolling } from "../lib/hooks.js";
import type { HistoryEntry } from "../lib/storage.js";
import { formatAda } from "../lib/format.js";
import { S } from "../lib/messages.js";
import { Button, EmptyState, Group, Row, TxLink } from "../ui/index.js";
import { AddressCopy } from "./AddressCopy.js";
import { payoutStatusWords } from "./Result.js";

/** The latest photo of this page session, with the verdict once Result has polled it. */
export interface SessionResult {
  task: TaskListItem;
  submissionId: string;
  view: SubmissionView | null;
}

/**
 * Wallet tab: the stored payout address, what payouts are, and the latest result of this session.
 * No fiat amounts. The earnings sum the payouts of the photos this phone keeps (lib/storage); the
 * address balance itself is on the preprod explorer (the browser has no chain API, CSP 'self').
 */
export function Wallet(props: {
  payoutAddress: string | null;
  result: SessionResult | null;
  history: readonly HistoryEntry[];
  onGoProfile: () => void;
}) {
  const views = useHistoryViews(props.history);
  const earnings = historyEarnings(props.history, views);
  const explorer = props.payoutAddress ? addressUrl(props.payoutAddress) : undefined;
  return (
    <section className="tab-section" aria-labelledby="wallet-title">
      <div className="page-head">
        <h1 id="wallet-title">Wallet</h1>
      </div>

      <div className="address-card">
        <p className="card-label">Payout address</p>
        {props.payoutAddress ? (
          <AddressCopy address={props.payoutAddress} />
        ) : (
          <>
            <p className="body">No payout address yet.</p>
            <Button variant="plain" onClick={props.onGoProfile}>
              Add a payout address
            </Button>
          </>
        )}
        <p className="footnote">{S.walletNote}</p>
      </div>

      <h2 className="section-title">Earnings</h2>
      <Group>
        <Row
          title="Paid to you"
          secondary="Confirmed payouts"
          trailing={formatAda(earnings.paid)}
        />
        {earnings.pending !== "0" ? (
          <Row
            title="On its way"
            secondary="Accepted, payment pending"
            trailing={formatAda(earnings.pending)}
          />
        ) : null}
      </Group>
      {explorer ? (
        <p className="footnote">
          <a href={explorer} target="_blank" rel="noopener noreferrer">
            See the full balance of this address on the explorer
          </a>
        </p>
      ) : null}
      <p className="footnote">{S.walletEarningsNote}</p>

      <h2 className="section-title">Latest result in this session</h2>
      {props.result ? (
        <SessionPayout result={props.result} />
      ) : (
        <EmptyState
          text="No verified photo in this session yet."
          help="When a photo is checked, its payout status and explorer link show here."
        />
      )}
      <h2 className="section-title">Your tasks</h2>
      <PhotoHistory history={props.history} views={views} />
      <p className="footnote wallet-history">{S.walletHistoryNote}</p>
    </section>
  );
}

function SessionPayout(props: { result: SessionResult }) {
  const { task, view } = props.result;
  let status: string;
  if (view === null) {
    status = "Checking your photo";
  } else if (view.state === "PASSED") {
    status = payoutStatusWords(view.payout?.state);
  } else if (view.state === "REJECTED" || view.state === "ERROR_FINAL") {
    status = "Not accepted. No payout for this photo.";
  } else {
    status = "Checking your photo";
  }
  const txHash = view?.payout?.txHash ?? null;
  return (
    <Group>
      <Row
        title={task.productName}
        secondary={`${task.storeName} · reward`}
        trailing={formatAda(task.payoutAmount)}
      />
      <Row title="Status" trailing={status} />
      {txHash ? (
        <div className="row tx-row">
          <TxLink hash={txHash} explorerUrl={view?.payout?.explorerUrl} label="Tx" />
        </div>
      ) : null}
    </Group>
  );
}

/** Status words for a past submission, in the same terms as the latest-result card. */
function historyStatus(view: SubmissionView | undefined): string {
  if (view === undefined) return "Checking";
  if (view.state === "PASSED") return payoutStatusWords(view.payout?.state);
  if (view.state === "REJECTED" || view.state === "ERROR_FINAL") return "Not accepted";
  return "Checking";
}

/** Verdict and payout of the newest photos on this phone, read from the engine every 10 s. */
function useHistoryViews(
  history: readonly HistoryEntry[],
): ReadonlyMap<string, SubmissionView | undefined> | undefined {
  const { api } = useDeps();
  const ids = history.slice(0, 10).map((e) => e.submissionId);
  const { data } = usePolling(
    async (signal) => {
      const views = await Promise.all(
        ids.map((id) => api.submission(id, signal).catch(() => undefined)),
      );
      return new Map(ids.map((id, i) => [id, views[i]] as const));
    },
    10_000,
    ids.length > 0,
  );
  return data;
}

/**
 * Lovelace earned by the photos this phone keeps: paid = payout CONFIRMED on-chain, pending =
 * accepted and not yet confirmed. Integer sums; the reward is the one recorded at submit time.
 */
export function historyEarnings(
  history: readonly HistoryEntry[],
  views: ReadonlyMap<string, SubmissionView | undefined> | undefined,
): { paid: string; pending: string } {
  let paid = 0n;
  let pending = 0n;
  for (const entry of history) {
    const view = views?.get(entry.submissionId);
    if (view?.state !== "PASSED") continue;
    if (view.payout?.state === "CONFIRMED") paid += BigInt(entry.payoutAmount);
    else pending += BigInt(entry.payoutAmount);
  }
  return { paid: paid.toString(), pending: pending.toString() };
}

/** Photos this phone submitted, newest first, with verdict and payout read from the engine. */
function PhotoHistory(props: {
  history: readonly HistoryEntry[];
  views: ReadonlyMap<string, SubmissionView | undefined> | undefined;
}) {
  const data = props.views;
  if (props.history.length === 0) {
    return (
      <EmptyState
        text="No photos from this phone yet."
        help="Every photo you submit shows here with its result and payout."
      />
    );
  }
  const passed = props.history.filter((e) => data?.get(e.submissionId)?.state === "PASSED");
  return (
    <>
      <p className="footnote">
        {passed.length} of {props.history.length} accepted
      </p>
      <Group>
        {props.history.slice(0, 10).map((entry) => {
          const view = data?.get(entry.submissionId);
          const txHash = view?.payout?.txHash ?? null;
          return (
            <div key={entry.submissionId}>
              <Row
                title={entry.productName}
                secondary={`${entry.storeName} · ${new Date(entry.at).toLocaleString()}`}
                trailing={
                  view?.state === "PASSED" ? formatAda(entry.payoutAmount) : historyStatus(view)
                }
              />
              {view?.state === "PASSED" ? (
                <Row title="Status" trailing={historyStatus(view)} />
              ) : null}
              {txHash ? (
                <div className="row tx-row">
                  <TxLink hash={txHash} explorerUrl={view?.payout?.explorerUrl} label="Payout tx" />
                </div>
              ) : null}
            </div>
          );
        })}
      </Group>
    </>
  );
}
