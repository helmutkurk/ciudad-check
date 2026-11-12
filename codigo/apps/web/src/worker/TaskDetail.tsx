import { useState } from "react";
import type { ClaimResponse, ConfigResponse, TaskListItem } from "@shelfie/core/browser";
import { AppError, WorkerIdSchema, isAppError } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { formatAda, minutesLeft } from "../lib/format.js";
import { GeoError, readCoarseLocation } from "../lib/geo.js";
import { describeError, S } from "../lib/messages.js";
import { loadWorkerId } from "../lib/storage.js";
import type { Profile } from "../lib/storage.js";
import { Button, Icon, NavBar } from "../ui/index.js";

type ChallengeMode = ConfigResponse["challengeMode"];

/**
 * Steps shown to the worker. Handwritten copy only in handwritten mode; gesture mode says the
 * hand sign appears when the camera opens, without a count or a side (ADR-19).
 */
export function stepsFor(mode: ChallengeMode | null | undefined): readonly string[] {
  if (mode === "handwritten") return S.stepsHandwritten;
  if (mode === "gesture") return S.stepsGesture;
  return S.stepsNeutral;
}

/** W2: task detail and "Take this task" (claim). */
export function TaskDetail(props: {
  task: TaskListItem;
  profile: Profile | null;
  canClaim: boolean; // consent given
  challengeMode?: ChallengeMode | null;
  backLabel?: string;
  onBack: () => void;
  onClaimed: (claim: ClaimResponse) => void;
  onTooSlow: () => void;
  onNeedProfile: () => void;
}) {
  const deps = useDeps();
  const left = minutesLeft(props.task.windowEndsAt, deps.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claim = async () => {
    if (!props.profile) {
      props.onNeedProfile();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const location = await readCoarseLocation(deps.geolocation);
      const workerId = loadWorkerId(deps.storage, deps.newId);
      const res = await deps.api.claim(props.task.id, {
        workerId: WorkerIdSchema.parse(workerId),
        displayName: props.profile.name || undefined,
        payoutAddress: props.profile.address,
        location,
      });
      props.onClaimed(res);
    } catch (err) {
      if (err instanceof GeoError) {
        setError(describeError(new AppError("location_required", "")));
      } else if (isAppError(err) && err.code === "task_not_open") {
        props.onTooSlow();
      } else {
        setError(describeError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <NavBar back={{ label: props.backLabel ?? "Tasks", onClick: props.onBack }} />
      <section className="hero-card">
        <h1 className="hero-title">{props.task.productName}</h1>
        <p className="hero-sub">
          <Icon name="pin" size={18} />
          <span>
            {props.task.storeName}, {props.task.storeAddress}
          </span>
        </p>
        <dl className="stat-row">
          <div className="stat">
            <dt>Reward</dt>
            <dd className="stat-value stat-accent">{formatAda(props.task.payoutAmount)}</dd>
          </div>
          <div className="stat">
            <dt>Time left</dt>
            <dd className="stat-value">{left} min</dd>
          </div>
        </dl>
      </section>
      <section className="steps-card" aria-label="Steps">
        <h2 className="section-title">How it works</h2>
        <ol className="step-list">
          {stepsFor(props.challengeMode).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="footnote">No product there? You can report the empty shelf spot.</p>
      </section>
      {error ? (
        <p className="inline-error" role="alert">
          <Icon name="alert" size={18} /> <span>{error}</span>
        </p>
      ) : null}
      {!props.canClaim ? (
        <p className="footnote" role="status">
          You are looking around only. Accept the privacy text to take tasks.
        </p>
      ) : null}
      <div className="action-bar">
        <Button disabled={busy || !props.canClaim} onClick={() => void claim()}>
          {busy ? "Taking…" : "Take this task"}
        </Button>
      </div>
    </main>
  );
}
