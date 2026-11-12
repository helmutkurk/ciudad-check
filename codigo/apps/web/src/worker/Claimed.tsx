import { useState } from "react";
import type { ClaimResponse } from "@shelfie/core/browser";
import { S } from "../lib/messages.js";
import { Button, Countdown, Icon, NavBar, TextButton } from "../ui/index.js";

/**
 * W3: the claim screen. Handwritten mode shows the code; gesture mode (ADR-19) shows no sign
 * until the camera opens, so the server instruction (which could name a count) is not rendered.
 */
export function Claimed(props: {
  claim: ClaimResponse;
  onOpenCamera: () => void;
  onOutOfStock: () => void;
  onGiveBack: () => void;
  onExpire: () => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const { claim, challenge, task } = props.claim;
  return (
    <main className="screen">
      <NavBar title={`${task.product}, ${task.store}`} />
      <div className="claim-timer">
        <span className="timer-label">Time to take the photo</span>
        <span className="timer-pill">
          <Icon name="clock" size={18} />
          <Countdown expiresAt={claim.expiresAt} onExpire={props.onExpire} />
        </span>
      </div>
      {challenge.mode === "gesture" ? (
        <section className="code-card" aria-label="Your hand sign">
          <p className="code-label">Hand sign</p>
          <p className="code-instruction" data-testid="gesture-intro">
            {S.handSignNote}
          </p>
        </section>
      ) : (
        <section className="code-card" aria-label="Your code">
          <p className="code-label">Your code</p>
          <p className="code-display" translate="no" data-testid="challenge-code">
            {challenge.code}
          </p>
          <p className="code-instruction">{challenge.instruction}</p>
        </section>
      )}
      <div className="action-bar">
        <Button onClick={props.onOpenCamera}>Open camera</Button>
        <TextButton onClick={props.onOutOfStock}>Product not on the shelf</TextButton>
        {confirming ? (
          <div className="confirm-row" role="group" aria-label="Give the task back?">
            <TextButton destructive disabled={props.busy} onClick={props.onGiveBack}>
              Give back
            </TextButton>
            <TextButton onClick={() => setConfirming(false)}>Keep task</TextButton>
          </div>
        ) : (
          <TextButton onClick={() => setConfirming(true)}>Give task back</TextButton>
        )}
      </div>
    </main>
  );
}
