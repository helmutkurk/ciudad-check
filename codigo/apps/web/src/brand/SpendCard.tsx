import type { BrandProfile, BrandSummary } from "@shelfie/core/browser";
import { Tile } from "../dashboard/Overview.js";

/**
 * Balance and spend over the brand's own orders. Credits are Sokosumi preprod test credits.
 * Spent and refunded count only checks whose Sokosumi price was recorded; the rest are named, not
 * estimated. The brand wallet is informational (ADR-21), so no wallet balance is shown.
 */
export function SpendCard(props: { profile: BrandProfile; summary: BrandSummary | undefined }) {
  const { profile, summary } = props;
  const available = Math.max(0, profile.dailyCreditCap - profile.creditsReservedToday);
  return (
    <section className="dcard" aria-label="Spend and checks">
      <h2 className="dh2">Spend and checks</h2>
      <div className="tiles" aria-label="Balance">
        <Tile label="Available today" value={available} />
        <Tile label="Max per store" value={profile.maxCreditsPerTask} />
      </div>
      <p className="dsub">
        Credits reserved today: {profile.creditsReservedToday} of {profile.dailyCreditCap} daily
        cap. Sokosumi preprod test credits, not money.
      </p>
      {summary === undefined ? (
        <p className="dsub">Spend is not available right now.</p>
      ) : (
        <>
          <div className="tiles" aria-label="Credits">
            <Tile label="Credits paid" value={summary.credits.spent} />
            <Tile label="Credits refunded" value={summary.credits.refunded} />
          </div>
          <div className="tiles" aria-label="Checks">
            <Tile label="Checks passed" value={summary.checks.passed} />
            <Tile label="Checks failed" value={summary.checks.failed} />
            <Tile label="Checks timed out" value={summary.checks.timedOut} />
          </div>
          <p className="dsub">
            Paid is a settled check, refunded is a failed or withheld one (escrow refund).
            {summary.credits.unpricedChecks > 0
              ? ` ${summary.credits.unpricedChecks} finished ${summary.credits.unpricedChecks === 1 ? "check has" : "checks have"} no recorded price and ${summary.credits.unpricedChecks === 1 ? "is" : "are"} not counted in credits.`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
