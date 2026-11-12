import { isAppError } from "@shelfie/core/browser";
import type { ClaimLocation, TaskListItem } from "@shelfie/core/browser";
import { useTaskFeed } from "../lib/hooks.js";
import { describeError, S } from "../lib/messages.js";
import { ConnectionStatus, EmptyState, Skeleton } from "../ui/index.js";
import { ActiveClaimCard } from "./ActiveClaim.js";
import type { ActiveClaim } from "./ActiveClaim.js";
import { LocationPrompt, TaskCard } from "./Feed.js";
import type { LocationState } from "./Feed.js";
import type { Tab } from "./TabBar.js";

/**
 * Home tab: greeting with the local name, live feed status, the current claim (if any) and the
 * next open task from the real feed. Nothing here is invented: no earnings, levels or ratings.
 */
export function Home(props: {
  name: string;
  location: ClaimLocation | undefined;
  locationState: LocationState;
  onRequestLocation: () => void;
  active: ActiveClaim | null;
  onResume: () => void;
  onClaimEnded: () => void;
  onOpen: (task: TaskListItem) => void;
  onGo: (tab: Tab) => void;
}) {
  const feed = useTaskFeed(props.location);
  const locationMissing = props.locationState !== "ok";
  const activeId = props.active?.task.id;
  const openTasks = feed.rows
    .filter((r) => !r.leaving && r.task.id !== activeId)
    .map((r) => r.task);
  const next = openTasks[0];
  const count = openTasks.length;
  const trimmed = props.name.trim();

  return (
    <section className="tab-section home" aria-labelledby="home-title">
      <div className="page-head">
        <h1 id="home-title">{trimmed ? `Hello, ${trimmed}` : "Hello"}</h1>
        {locationMissing ? null : (
          <p className="subhead">
            {count === 1 ? "1 open task in Munich" : `${count} open tasks in Munich`}
          </p>
        )}
      </div>

      {locationMissing ? (
        <LocationPrompt state={props.locationState} onRequest={props.onRequestLocation} />
      ) : (
        <>
          <div className="feed-status">
            <ConnectionStatus status={feed.status} />
          </div>

          {props.active ? (
            <ActiveClaimCard
              active={props.active}
              onResume={props.onResume}
              onExpire={props.onClaimEnded}
            />
          ) : null}

          <h2 className="section-title">Next task</h2>
          {feed.error && isAppError(feed.error) ? (
            <p className="error-text" role="alert">
              {describeError(feed.error)}
            </p>
          ) : null}
          {next ? (
            <TaskCard task={next} onOpen={() => props.onOpen(next)} />
          ) : feed.loading ? (
            <Skeleton />
          ) : (
            <EmptyState text={S.feedEmpty} help={S.feedHint} />
          )}
        </>
      )}

      <div className="quick-links">
        <button type="button" className="quick-link" onClick={() => props.onGo("tasks")}>
          All tasks
        </button>
        <button type="button" className="quick-link" onClick={() => props.onGo("profile")}>
          Profile
        </button>
      </div>
    </section>
  );
}
