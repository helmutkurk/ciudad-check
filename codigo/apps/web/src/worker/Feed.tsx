import { isAppError } from "@shelfie/core/browser";
import type { ClaimLocation, TaskListItem } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { formatAda, minutesLeft } from "../lib/format.js";
import { useTaskFeed } from "../lib/hooks.js";
import { describeError, S } from "../lib/messages.js";
import { Banner, Button, EmptyState, Icon, Skeleton } from "../ui/index.js";

export type LocationState = "idle" | "reading" | "ok" | "denied" | "unavailable";

/** Shown instead of the city list until coarse location is allowed. Shared by Home and Tasks. */
export function LocationPrompt(props: { state: LocationState; onRequest: () => void }) {
  return (
    <EmptyState
      text={
        props.state === "denied"
          ? "Location is blocked. Allow it in the browser settings, then try again."
          : S.locationOff
      }
      help="It is only used to check the city (about 1 km)."
      action={
        <Button onClick={props.onRequest} disabled={props.state === "reading"}>
          {props.state === "reading" ? "Getting location…" : "Allow location"}
        </Button>
      }
    />
  );
}

/** W1: live task feed (the Tasks tab). A task leaves the list on `task_closed`; first claim wins. */
export function Feed(props: {
  location: ClaimLocation | undefined;
  locationState: LocationState;
  onRequestLocation: () => void;
  onOpen: (task: TaskListItem) => void;
  notice?: string | undefined;
}) {
  const feed = useTaskFeed(props.location);
  const locationMissing = props.locationState !== "ok";

  const count = feed.rows.filter((r) => !r.leaving).length;
  const showSkeleton = !locationMissing && feed.loading && feed.rows.length === 0;

  return (
    <section className="tab-section" aria-labelledby="tasks-title">
      <div className="feed-title">
        <h1 id="tasks-title">{S.feedTitle}</h1>
        {!locationMissing && !showSkeleton ? (
          <p className="subhead">{count === 1 ? "1 open task" : `${count} open tasks`}</p>
        ) : null}
      </div>
      {props.notice ? (
        <p className="notice" role="status">
          {props.notice}
        </p>
      ) : null}

      {locationMissing ? (
        <LocationPrompt state={props.locationState} onRequest={props.onRequestLocation} />
      ) : (
        <>
          {feed.status === "reconnecting" ? (
            <Banner tone="warning" title="Reconnecting.">
              The list refreshes every few seconds meanwhile.
            </Banner>
          ) : null}
          {feed.error && isAppError(feed.error) ? (
            <p className="error-text" role="alert">
              {describeError(feed.error)}
            </p>
          ) : null}
          {feed.pendingCount > 0 ? (
            <button type="button" className="new-pill" onClick={feed.flush}>
              {feed.pendingCount === 1 ? "1 new task" : `${feed.pendingCount} new tasks`}
            </button>
          ) : null}
          {showSkeleton ? (
            <div className="task-list" aria-busy="true" aria-label="Loading tasks">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          ) : feed.rows.length === 0 ? (
            <EmptyState text={S.feedEmpty} help={S.feedHint} />
          ) : (
            <>
              <ul className="task-list" aria-label="Open tasks">
                {feed.rows.map(({ task, leaving }) => (
                  <li key={task.id} className={`task-item ${leaving ? "leaving" : ""}`}>
                    <TaskCard task={task} disabled={leaving} onOpen={() => props.onOpen(task)} />
                  </li>
                ))}
              </ul>
              <p className="footnote feed-hint">{S.feedHint}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** One open task as a card: product, store, address, time left, reward in tADA. */
export function TaskCard(props: { task: TaskListItem; disabled?: boolean; onOpen: () => void }) {
  const { now } = useDeps();
  const { task } = props;
  return (
    <button type="button" className="task-card" disabled={props.disabled} onClick={props.onOpen}>
      <span className="task-main">
        <span className="task-product">{task.productName}</span>
        <span className="task-store">
          {task.storeName}, {task.storeAddress}
        </span>
        <span className="task-meta">
          <Icon name="clock" size={16} />
          {minutesLeft(task.windowEndsAt, now())} min left
        </span>
      </span>
      <span className="task-reward">
        <span className="task-reward-amount">{formatAda(task.payoutAmount)}</span>
        <Icon name="chevron" size={18} />
      </span>
    </button>
  );
}
