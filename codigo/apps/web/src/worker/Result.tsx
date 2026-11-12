import { useEffect, useState } from "react";
import type { SubmissionView } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { formatAda } from "../lib/format.js";
import { usePolling } from "../lib/hooks.js";
import { describeError } from "../lib/messages.js";
import { Button, Group, Icon, Pill, Row, TextButton, TxLink } from "../ui/index.js";

const TERMINAL_PAYOUT = new Set(["CONFIRMED", "FAILED_FINAL", "UNKNOWN"]);

export function isFinished(view: SubmissionView): boolean {
  if (view.state === "REJECTED" || view.state === "ERROR_FINAL") return true;
  if (view.state === "PASSED")
    return view.payout !== null && TERMINAL_PAYOUT.has(view.payout.state);
  return false;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** What the vision model read. Accepts the nested extraction (verifier-rules 3) or flat fields. */
export function readExtraction(view: SubmissionView): { price?: string; label?: string } {
  const ex = asRecord(view.verdict?.extraction);
  if (!ex) return {};
  const price = asRecord(ex["price"]);
  const label = asRecord(ex["label"]);
  const priceText = str(price?.["text"]) ?? str(ex["priceText"]);
  const currency = str(price?.["currency"]) ?? "EUR";
  const labelText = str(label?.["productText"]) ?? str(label?.["text"]) ?? str(ex["productText"]);
  const out: { price?: string; label?: string } = {};
  if (priceText) out.price = /[A-Za-z€$]/.test(priceText) ? priceText : `${priceText} ${currency}`;
  if (labelText) out.label = labelText;
  return out;
}

const PAYOUT_WORDS: Record<string, string> = {
  QUEUED: "Payment pending",
  SENDING: "Payment pending",
  SUBMITTED: "Payment pending",
  CONFIRMED: "Payment confirmed",
  UNKNOWN: "Payment pending",
  FAILED_FINAL: "Payment delayed. The operator will fix it.",
};

/** Plain words for a payout state. Missing or unknown states read as pending, never as paid. */
export function payoutStatusWords(state: string | null | undefined): string {
  if (!state) return "Payment pending";
  return PAYOUT_WORDS[state] ?? state;
}

/** Pure rendering of a submission (W5, W6, W6b). Fixtures drive the tests. */
export function VerdictView(props: {
  view: SubmissionView;
  payoutAmount?: string | undefined;
  queuePosition?: number | undefined;
  onNext: () => void;
  onRetry?: (() => void) | undefined;
}) {
  const { view } = props;
  const read = readExtraction(view);

  if (view.state === "RECEIVED" || view.state === "VERIFYING" || view.state === "VERIFY_RETRY") {
    return (
      <section className="result result-wait" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <h1 className="title">Checking your photo</h1>
        <p className="body">
          {props.queuePosition && props.queuePosition > 1
            ? `Queued for verification, position ${props.queuePosition}.`
            : "Verifying your photo…"}
        </p>
        <p className="footnote">This can take up to a minute. Keep this page open.</p>
      </section>
    );
  }

  if (view.state === "PASSED") {
    const oos = view.verdict?.outcome === "OUT_OF_STOCK";
    const payout = view.payout;
    return (
      <section className={`result ${oos ? "result-oos" : "result-pass"}`} aria-live="polite">
        <span className="result-badge result-badge-success" aria-hidden="true">
          <Icon name={oos ? "shelf" : "check"} size={36} />
        </span>
        <Pill tone="success">{oos ? "Not on the shelf" : "Verified"}</Pill>
        <h1 className="title">{oos ? "Verified: not on the shelf" : "Verified"}</h1>
        <Group>
          {oos ? (
            <Row title="Label read" trailing={read.label ?? "-"} />
          ) : (
            <Row title="Price read" trailing={read.price ?? "-"} />
          )}
          {props.payoutAmount ? (
            <Row
              title="Reward"
              trailing={formatAda(props.payoutAmount)}
              {...(oos ? { secondary: "Same as a price photo" } : {})}
            />
          ) : null}
          <Row title="Status" trailing={payoutStatusWords(payout?.state)} />
          {payout?.txHash ? (
            <div className="row tx-row">
              <TxLink hash={payout.txHash} explorerUrl={payout.explorerUrl} label="Tx" />
            </div>
          ) : null}
        </Group>
        <div className="action-bar">
          <Button onClick={props.onNext}>Next task</Button>
        </div>
      </section>
    );
  }

  // REJECTED or ERROR_FINAL
  const attemptsLeft = view.task.attemptsLeft;
  return (
    <section className="result result-fail" aria-live="polite">
      <span className="result-badge result-badge-error" aria-hidden="true">
        <Icon name="close" size={36} />
      </span>
      <Pill tone="error">Rejected</Pill>
      <h1 className="title">Not accepted</h1>
      <p className="reason-card">
        {view.verdict?.workerMessage ?? "We could not verify this photo."}
      </p>
      <Group>
        <Row title="Attempts left" trailing={String(attemptsLeft)} />
      </Group>
      <div className="action-bar">
        {attemptsLeft > 0 && props.onRetry ? (
          <Button onClick={props.onRetry}>Try again</Button>
        ) : null}
        <TextButton onClick={props.onNext}>Back to tasks</TextButton>
      </div>
    </section>
  );
}

/** Polls GET /api/submissions/{id} every 2 s until the verdict and payout settle. */
export function Result(props: {
  submissionId: string;
  payoutAmount: string | undefined;
  queuePosition: number | undefined;
  onNext: () => void;
  onRetry: () => void;
  /** Reports each polled view so the Wallet tab can show this session's latest payout. */
  onView?: ((view: SubmissionView) => void) | undefined;
}) {
  const { api } = useDeps();
  const [finished, setFinished] = useState(false);
  const { data, error } = usePolling(
    async (signal) => {
      const view = await api.submission(props.submissionId, signal);
      if (isFinished(view)) setFinished(true);
      return view;
    },
    2000,
    !finished,
  );
  const { onView } = props;
  useEffect(() => {
    if (data) onView?.(data);
  }, [data, onView]);

  if (!data) {
    return (
      <main className="screen">
        <section className="result result-wait" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <h1 className="title">Checking your photo</h1>
          {error ? (
            <p className="error-text" role="alert">
              {describeError(error)}
            </p>
          ) : (
            <p className="body">Loading…</p>
          )}
        </section>
      </main>
    );
  }
  return (
    <main className="screen">
      <VerdictView
        view={data}
        payoutAmount={props.payoutAmount}
        queuePosition={props.queuePosition}
        onNext={props.onNext}
        onRetry={props.onRetry}
      />
    </main>
  );
}
