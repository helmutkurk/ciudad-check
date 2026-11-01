import { useMemo } from "react";
import type { ReactNode } from "react";
import type { CatalogResponse, JobView, LedgerEvent } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { formatAda, formatTime } from "../lib/format.js";
import { usePolling } from "../lib/hooks.js";
import { describeError } from "../lib/messages.js";
import { Pill } from "../ui/index.js";
import {
  describeJob,
  entriesForJob,
  jobSentence,
  jobViewStatus,
  receiptLabel,
  taskStatus,
} from "./model.js";
import { Progress } from "./Progress.js";
import { TxChip } from "./TxChip.js";

interface Receipt {
  label: string;
  hash: string;
  explorerUrl?: string | undefined;
}

const TERMINAL = new Set([
  "DELIVERED",
  "SETTLED",
  "WITHHELD",
  "REFUNDED",
  "REJECTED_INPUT",
  "CANCELLED",
]);

interface Step {
  key: string;
  title: string;
  done: boolean;
  time?: string | undefined;
  body?: ReactNode;
  receipts: Receipt[];
}

function verdictTone(e: LedgerEvent): { label: string; tone: "success" | "error" | "neutral" } {
  const n = e.note.trim().toUpperCase();
  if (n.startsWith("PASS")) return { label: "Pass", tone: "success" };
  if (n.startsWith("FAIL")) return { label: "Fail", tone: "error" };
  return { label: e.kind === "OVERRIDE" ? "Override" : "Verdict", tone: "neutral" };
}

/** B3 / B4: job detail as a timeline with verdicts, receipts (tx chips) and the report. */
export function JobDetail(props: {
  jobId: string;
  catalog: CatalogResponse | undefined;
  ledger: readonly LedgerEvent[];
  onBack: () => void;
}) {
  const { api } = useDeps();
  const { data: view, error } = usePolling((s) => api.job(props.jobId, s), 3000);
  const { data: payouts } = usePolling((s) => api.payouts(props.jobId, s), 3000);

  const entries = useMemo(
    () => (view ? entriesForJob(props.ledger, view) : []),
    [view, props.ledger],
  );

  const steps = useMemo(
    () => (view ? buildSteps(view, entries, payouts?.payouts ?? []) : []),
    [view, entries, payouts],
  );

  const back = (
    <button type="button" className="dback" onClick={props.onBack}>
      ‹ Requests
    </button>
  );

  if (!view) {
    return (
      <section className="dcard" aria-label="Request detail">
        {back}
        {error ? (
          <p className="error-text" role="alert">
            {describeError(error)}
          </p>
        ) : (
          <p className="body">Loading…</p>
        )}
      </section>
    );
  }

  const { title, subtitle } = describeJob(view, props.catalog);
  const status = jobViewStatus(view);
  const report = view.job.reportMd;
  const oos = view.tasks.some((t) => t.acceptedOutcome === "OUT_OF_STOCK");
  const showOos = oos && status.tone === "success";
  const terminal = TERMINAL.has(view.job.state);
  const currentIdx = terminal ? -1 : steps.findIndex((s) => !s.done);

  return (
    <section className="dcard ddetail" aria-label="Request detail">
      {back}
      <div className="dd-head">
        <div>
          <h2 className="dh1">{title}</h2>
          <p className="dsub">{`${subtitle}. Window ends ${formatTime(view.job.windowEndsAt)}.`}</p>
        </div>
        <Pill tone={status.tone}>{showOos ? "Not on the shelf" : status.label}</Pill>
      </div>
      <p className="dsentence">{jobSentence(view)}</p>

      <div className="tiles" aria-label="Progress">
        <div className="tile">
          <span className="tile-label">Passed</span>
          <span className="tile-value">
            {view.counts.passed}
            <small> of {view.job.k}</small>
          </span>
          <Progress passed={view.counts.passed} needed={view.job.k} />
        </div>
        <div className="tile">
          <span className="tile-label">Open</span>
          <span className="tile-value">{view.counts.open}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Failed attempts</span>
          <span className="tile-value">{view.counts.failed}</span>
        </div>
      </div>

      <h3 className="dh3">Timeline</h3>
      <ol className="tline">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={`tstep ${s.done ? "done" : i === currentIdx ? "current" : "todo"}`}
            aria-current={i === currentIdx ? "step" : undefined}
          >
            <span className="tmark" aria-hidden="true" />
            <div className="tbody">
              <div className="tline-head">
                <span className="ttitle">{s.title}</span>
                {s.time ? <span className="ttime">{s.time}</span> : null}
                <span className="sr-only">
                  {s.done ? " (done)" : i === currentIdx ? " (in progress)" : " (not yet)"}
                </span>
              </div>
              {s.body}
              {s.receipts.map((r) => (
                <div className="treceipt" key={`${r.label}:${r.hash}`}>
                  <span className="treceipt-label">{r.label}</span>
                  <TxChip hash={r.hash} explorerUrl={r.explorerUrl} />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <h3 className="dh3">Tasks</h3>
      <div className="table-wrap">
        <table className="dtable">
          <caption className="sr-only">Tasks in this request</caption>
          <thead>
            <tr>
              <th scope="col">Check</th>
              <th scope="col">Attempts</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {view.tasks.length === 0 ? (
              <tr>
                <td colSpan={3}>No tasks yet.</td>
              </tr>
            ) : (
              view.tasks.map((t) => {
                const s = taskStatus(t.state);
                return (
                  <tr key={t.id}>
                    <td>
                      {t.acceptedOutcome === "OUT_OF_STOCK" ? "Not on the shelf" : "Price photo"}
                    </td>
                    <td className="num">{t.attempts}</td>
                    <td>
                      <Pill tone={s.tone}>{s.label}</Pill>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <h3 className="dh3">Report</h3>
      {view.decision === "WITHHOLD" ? (
        <p className="body">Result withheld. Your fee is refunded.</p>
      ) : report ? (
        <div>
          <pre className="report" translate="no">
            {report}
          </pre>
          <a
            className="text-button"
            href={`data:text/markdown;charset=utf-8,${encodeURIComponent(report)}`}
            download={`${view.job.id}-report.md`}
          >
            Download report
          </a>
        </div>
      ) : (
        <p className="dsub">The report appears when the job is decided.</p>
      )}
      <p className="dsub">A photo viewer is not built yet; verdicts come from the ledger.</p>
    </section>
  );
}

function buildSteps(
  view: JobView,
  entries: readonly LedgerEvent[],
  payouts: readonly {
    id: string;
    state: string;
    amount: string;
    txHash?: string | null | undefined;
    explorerUrl?: string | null | undefined;
  }[],
): Step[] {
  const has = (...kinds: LedgerEvent["kind"][]) => entries.filter((e) => kinds.includes(e.kind));
  const firstTs = (...kinds: LedgerEvent["kind"][]) => {
    const e = has(...kinds)[0];
    return e ? formatTime(e.ts) : undefined;
  };
  const taskIn = (...states: string[]) => view.tasks.some((t) => states.includes(t.state));

  const seen = new Set<string>();
  const rcpt = (kinds: LedgerEvent["kind"][]): Receipt[] => {
    const out: Receipt[] = [];
    for (const e of has(...kinds)) {
      const label = receiptLabel(e.kind);
      if (!label || !e.txHash) continue;
      const key = `${label}:${e.txHash}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, hash: e.txHash, explorerUrl: e.explorerUrl });
    }
    return out;
  };

  const verdicts = has("VERDICT", "OVERRIDE");
  const payoutReceipts = rcpt(["PAYOUT_SUBMITTED", "PAYOUT_CONFIRMED", "PAYOUT_MARKED_PAID"]);
  for (const p of payouts) {
    if (!p.txHash) continue;
    const key = `Worker payout:${p.txHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    payoutReceipts.push({
      label: "Worker payout",
      hash: p.txHash,
      explorerUrl: p.explorerUrl ?? undefined,
    });
  }
  const settleReceipts = rcpt(["RESULT_SUBMITTED", "SETTLED", "REFUND_OBSERVED"]);
  for (const [name, hash] of Object.entries(view.settlement?.txHashes ?? {})) {
    if (!hash) continue;
    const key = `${name}:${hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    settleReceipts.push({ label: name, hash });
  }
  const refund = ["WITHHELD", "REFUNDED"].includes(view.job.state) || view.decision === "WITHHOLD";

  return [
    {
      key: "created",
      title: "Request created",
      done: true,
      time: formatTime(view.job.createdAt),
      receipts: rcpt(["ESCROW_LOCKED"]),
    },
    {
      key: "claimed",
      title: "Claimed by a worker",
      done: has("TASK_CLAIMED").length > 0 || !taskIn("OPEN"),
      time: firstTs("TASK_CLAIMED"),
      receipts: [],
    },
    {
      key: "photo",
      title: "Photo submitted",
      done:
        has("SUBMISSION_RECEIVED", "VERIFY_PAID").length > 0 ||
        taskIn("SUBMITTED", "VERIFYING", "ACCEPTED", "PAID", "FAILED"),
      time: firstTs("SUBMISSION_RECEIVED"),
      receipts: rcpt(["VERIFY_PAID"]),
    },
    {
      key: "verdict",
      title: "Verdict",
      done: verdicts.length > 0 || taskIn("ACCEPTED", "PAID", "FAILED"),
      body:
        verdicts.length > 0 ? (
          <ul className="verdicts">
            {verdicts.map((e) => {
              const v = verdictTone(e);
              return (
                <li key={e.seq}>
                  <Pill tone={v.tone}>{v.label}</Pill>
                  <p className="reason">
                    {e.note.length > 0
                      ? e.note
                      : e.kind === "OVERRIDE"
                        ? "Verdict overridden"
                        : "Verdict"}
                  </p>
                  <span className="ttime">{formatTime(e.ts)}</span>
                  {e.flags["demoOverride"] || e.kind === "OVERRIDE" ? (
                    <Pill tone="warning">Override</Pill>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : undefined,
      receipts: [],
    },
    {
      key: "payout",
      title: "Worker payout",
      done: payouts.length > 0 || payoutReceipts.length > 0 || taskIn("PAID"),
      body:
        payouts.length > 0 ? (
          <ul className="payouts">
            {payouts.map((p) => (
              <li key={p.id}>
                <span>{formatAda(p.amount)}</span>
                <span className="dsub">{p.state}</span>
              </li>
            ))}
          </ul>
        ) : undefined,
      receipts: payoutReceipts,
    },
    {
      key: "settle",
      title: refund ? "Refund" : "Settlement",
      done:
        ["SETTLED", "REFUNDED", "WITHHELD"].includes(view.job.state) ||
        has("SETTLED", "REFUND_OBSERVED").length > 0 ||
        settleReceipts.length > 0,
      time: firstTs("SETTLED", "REFUND_OBSERVED"),
      receipts: settleReceipts,
    },
  ];
}
