import { useState } from "react";
import type { CatalogResponse, JobView } from "@shelfie/core/browser";
import { formatTime } from "../lib/format.js";
import { EmptyState, Pill, Segmented, TextButton } from "../ui/index.js";
import { describeJob, jobViewStatus, matchesFilter } from "./model.js";
import type { JobFilter } from "./model.js";
import { Progress } from "./Progress.js";
import { relativeTime, useNow } from "./time.js";

/** B2: live job list as compact rows. */
export function JobList(props: {
  jobs: JobView[] | undefined;
  catalog: CatalogResponse | undefined;
  selectedId: string | null;
  onOpen: (id: string) => void;
  /** Absent on the operator dashboard, where requests are not placed from this list. */
  onNew?: (() => void) | undefined;
}) {
  const [filter, setFilter] = useState<JobFilter>("all");
  const now = useNow();
  const jobs = (props.jobs ?? []).filter((j) => matchesFilter(j, filter));
  return (
    <section className="dcard dlist" aria-label="Requests">
      <div className="dcard-head">
        <h2 className="dh2">Requests</h2>
        <Segmented<JobFilter>
          label="Filter requests"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "delivered", label: "Delivered" },
            { value: "failed", label: "Failed" },
            { value: "timeout", label: "Timed out" },
          ]}
        />
      </div>
      {jobs.length === 0 ? (
        <EmptyState
          text={
            filter === "all"
              ? "No requests yet. Create one to see it here."
              : "No requests match this filter."
          }
          action={
            props.onNew ? <TextButton onClick={props.onNew}>New order</TextButton> : undefined
          }
        />
      ) : (
        <ul className="jlist">
          {jobs.map((view) => {
            const { title, subtitle } = describeJob(view, props.catalog);
            const status = jobViewStatus(view);
            const selected = props.selectedId === view.job.id;
            return (
              <li key={view.job.id}>
                <button
                  type="button"
                  className={`jrow ${selected ? "selected" : ""}`}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => props.onOpen(view.job.id)}
                >
                  <span className="jrow-main">
                    <span className="jrow-title">{title}</span>
                    <span className="jrow-sub">{subtitle}</span>
                  </span>
                  <span className="jrow-side">
                    <Pill tone={status.tone}>{status.label}</Pill>
                    <Progress passed={view.counts.passed} needed={view.job.k} />
                    <time
                      className="jrow-time"
                      dateTime={view.job.createdAt}
                      title={formatTime(view.job.createdAt)}
                    >
                      {relativeTime(view.job.createdAt, now)}
                    </time>
                  </span>
                  <span className="sr-only">
                    {`Passed ${view.counts.passed} of ${view.job.k}, open ${view.counts.open}, failed ${view.counts.failed}.`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
