import type { CatalogResponse, HealthResponse, JobView, LedgerEvent } from "@shelfie/core/browser";
import { formatTime, formatWalletBalance } from "../lib/format.js";
import { Pill } from "../ui/index.js";
import { isActiveJob, JOB_WINDOW, describeJob, jobOutcome, jobViewStatus } from "./model.js";
import { relativeTime, useNow } from "./time.js";

const RECENT = 5;

function coverage(jobs: JobView[] | undefined): string {
  if (jobs === undefined) return "Requests are not loaded yet.";
  if (jobs.length === JOB_WINDOW)
    return `Counts cover the last ${JOB_WINDOW} requests, not the full history.`;
  return `Counts cover all ${jobs.length} loaded ${jobs.length === 1 ? "request" : "requests"}.`;
}

export function Tile(props: { label: string; value: number }) {
  return (
    <div className="tile">
      <span className="tile-label">{props.label}</span>
      <span className="tile-value">{props.value}</span>
    </div>
  );
}

/** Four counts over the loaded requests. Each count names its coverage; nothing is extrapolated. */
export function OverviewTiles(props: { jobs: JobView[] | undefined }) {
  const jobs = props.jobs ?? [];
  const states = jobs.map((j) => j.job.state);
  const countOf = (wanted: readonly string[]) => states.filter((s) => wanted.includes(s)).length;
  const active = jobs.filter(isActiveJob).length;
  const passed = jobs.reduce((n, j) => n + j.counts.passed, 0);
  return (
    <>
      <div className="tiles tiles-big" aria-label="Request counts">
        <Tile label="Active requests" value={active} />
        <Tile label="Delivered" value={jobs.filter((j) => jobOutcome(j) === "delivered").length} />
        <Tile label="Withheld or refunded" value={countOf(["WITHHELD", "REFUNDED"])} />
        <Tile label="Passed checks" value={passed} />
      </div>
      <p className="dsub">{coverage(props.jobs)}</p>
    </>
  );
}

/** Overview section: real counts, wallet balances, the newest requests and ledger events. */
export function Overview(props: {
  jobs: JobView[] | undefined;
  catalog: CatalogResponse | undefined;
  health: HealthResponse | undefined;
  ledger: readonly LedgerEvent[];
  onOpenJob: (id: string) => void;
}) {
  const now = useNow();
  const recentJobs = (props.jobs ?? []).slice(0, RECENT);
  const recentEvents = [...props.ledger].reverse().slice(0, RECENT);
  const health = props.health;
  return (
    <div className="dpage">
      <header className="dpage-head">
        <div>
          <h1 className="dh1">Overview</h1>
          <p className="dsub">Requests, wallets and ledger events loaded on this page.</p>
        </div>
      </header>

      <section className="dcard" aria-label="Counts">
        <h2 className="dh2">Requests</h2>
        <OverviewTiles jobs={props.jobs} />
      </section>

      <section className="dcard" aria-label="Wallets">
        <h2 className="dh2">Wallets</h2>
        {health ? (
          <div className="tiles">
            <div className="tile">
              <span className="tile-label">Verification wallet</span>
              <span className="tile-value">{formatWalletBalance(health.wallets.vbuy)}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Payout wallet</span>
              <span className="tile-value">{formatWalletBalance(health.wallets.pay)}</span>
              <span className="dsub">Queue {health.wallets.pay.queueDepth ?? 0}</span>
            </div>
          </div>
        ) : (
          <p className="dsub">Balances appear when the engine answers.</p>
        )}
      </section>

      <div className="dover-grid">
        <section className="dcard" aria-label="Recent requests">
          <h2 className="dh2">Recent requests</h2>
          {recentJobs.length === 0 ? (
            <p className="dsub">
              {props.jobs === undefined ? "Loading requests." : "No requests yet."}
            </p>
          ) : (
            <ul className="jlist">
              {recentJobs.map((view) => {
                const { title, subtitle } = describeJob(view, props.catalog);
                const status = jobViewStatus(view);
                return (
                  <li key={view.job.id}>
                    <button
                      type="button"
                      className="jrow"
                      onClick={() => props.onOpenJob(view.job.id)}
                    >
                      <span className="jrow-main">
                        <span className="jrow-title">{title}</span>
                        <span className="jrow-sub">{subtitle}</span>
                      </span>
                      <span className="jrow-side">
                        <Pill tone={status.tone}>{status.label}</Pill>
                        <time
                          className="jrow-time"
                          dateTime={view.job.createdAt}
                          title={formatTime(view.job.createdAt)}
                        >
                          {relativeTime(view.job.createdAt, now)}
                        </time>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dcard" aria-label="Recent ledger events">
          <h2 className="dh2">Recent ledger events</h2>
          {recentEvents.length === 0 ? (
            <p className="dsub">No entries yet.</p>
          ) : (
            <>
              <p className="dsub">
                Latest {recentEvents.length} of {props.ledger.length} loaded entries.
              </p>
              <ul className="dfeed">
                {recentEvents.map((e) => (
                  <li key={e.seq}>
                    <span className="dkind">{e.kind}</span>
                    <span className="dsub">{e.note || Object.values(e.refs).join(" · ")}</span>
                    <time className="ttime" dateTime={e.ts}>
                      {formatTime(e.ts)}
                    </time>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
