import type { ReactNode } from "react";
import type { ConfigResponse, HealthResponse } from "@shelfie/core/browser";
import { isAppError } from "@shelfie/core/browser";

function Chip(props: { tone: "warning" | "error"; title: string; children: ReactNode }) {
  return (
    <div className={`dbanner dbanner-${props.tone}`} role="status">
      <strong>{props.title}</strong> <span>{props.children}</span>
    </div>
  );
}

/** Mandatory system-state banners (.claude/rules/web.md), compact and in one row. */
export function Banners(props: {
  health: HealthResponse | undefined;
  healthError: unknown;
  config: ConfigResponse | undefined;
  demoBadges: boolean;
}) {
  const { health, config } = props;
  const lowBalance =
    health !== undefined &&
    // verify Friday: /api/health has no MIN_WALLET_LOVELACE; only an empty wallet is flagged here.
    (health.wallets.pay.balanceLovelace === "0" ||
      // an unknown W-VBUY balance (no address configured) is not an empty wallet
      (health.wallets.vbuy.unknown !== true && health.wallets.vbuy.balanceLovelace === "0"));
  const any =
    (props.healthError !== undefined && !health) ||
    health?.fakes.payments ||
    health?.fakes.verifier ||
    config?.demoOverrideEnabled ||
    props.demoBadges ||
    lowBalance;
  if (!any) return null;
  return (
    <div className="dbanners">
      {props.healthError !== undefined && !health ? (
        <Chip tone="error" title="Engine not reachable.">
          {isAppError(props.healthError)
            ? props.healthError.message
            : "Check that the engine is running."}
        </Chip>
      ) : null}
      {health?.fakes.payments ? (
        <Chip tone="warning" title="Fake payments.">
          No real transactions. Not evidence.
        </Chip>
      ) : null}
      {health?.fakes.verifier ? (
        <Chip tone="warning" title="Verifier stub.">
          Verdicts do not come from the real vision model.
        </Chip>
      ) : null}
      {config?.demoOverrideEnabled || props.demoBadges ? (
        <Chip tone="warning" title="Operator override enabled.">
          A verdict can be changed by hand; overrides are marked in the ledger.
        </Chip>
      ) : null}
      {lowBalance ? (
        <Chip tone="error" title="A wallet is empty.">
          Payouts stay queued until it is funded.
        </Chip>
      ) : null}
    </div>
  );
}
