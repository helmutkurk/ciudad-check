import type { ClaimResponse, TaskListItem } from "@shelfie/core/browser";
import { Button, Countdown, Icon } from "../ui/index.js";

/** The claim the worker holds right now. Kept in WorkerApp so tab switches do not drop it. */
export interface ActiveClaim {
  task: TaskListItem;
  claim: ClaimResponse;
}

/** Current claim with its real expiry. Home and Tasks show it; "Continue" reopens the claim screen. */
export function ActiveClaimCard(props: {
  active: ActiveClaim;
  onResume: () => void;
  onExpire: () => void;
}) {
  return (
    <section className="active-card" aria-label="Your current task">
      <p className="card-label">Your current task</p>
      <p className="active-product">{props.active.task.productName}</p>
      <p className="active-store">
        {props.active.task.storeName}, {props.active.task.storeAddress}
      </p>
      <div className="active-meta">
        <span className="timer-pill">
          <Icon name="clock" size={18} />
          <Countdown expiresAt={props.active.claim.claim.expiresAt} onExpire={props.onExpire} />
        </span>
      </div>
      <Button onClick={props.onResume}>Continue</Button>
    </section>
  );
}
