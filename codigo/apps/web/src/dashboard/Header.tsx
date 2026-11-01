import type { ReactNode } from "react";
import type { HealthResponse } from "@shelfie/core/browser";
import type { StreamStatus } from "../lib/sse.js";
/** Top strip: engine status and network, with optional actions (the brand app's account). */
export function Header(props: {
  health: HealthResponse | undefined;
  healthError: unknown;
  stream: StreamStatus;
  actions?: ReactNode;
}) {
  const { health } = props;
  const state: "ok" | "warn" | "down" = health
    ? health.ok && health.verifier === "up"
      ? "ok"
      : "warn"
    : props.healthError !== undefined
      ? "down"
      : "warn";
  const label = health
    ? health.ok
      ? health.verifier === "up"
        ? "Engine connected"
        : "Verifier down"
      : "Engine degraded"
    : props.healthError !== undefined
      ? "Engine offline"
      : "Connecting";
  return (
    <header className="dhead">
      <div className="dhead-status">
        <span className={`dstatus dstatus-${state}`} role="status">
          <span className="dot" aria-hidden="true" />
          {label}
          {props.stream === "reconnecting" ? " · ledger reconnecting" : ""}
        </span>
        <span className="dnet">Cardano preprod</span>
      </div>
      {props.actions ? <div className="dhead-actions">{props.actions}</div> : null}
    </header>
  );
}
