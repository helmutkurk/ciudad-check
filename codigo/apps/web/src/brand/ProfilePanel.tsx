import type {
  BrandProfile,
  BrandSummary,
  BrandTransaction,
  CatalogResponse,
} from "@shelfie/core/browser";
import { AddressCopy } from "../worker/AddressCopy.js";
import { Pill } from "../ui/index.js";
import { SpendCard } from "./SpendCard.js";
import { TransactionList } from "./TransactionList.js";

/** Brand profile: identity, preprod wallet, spending caps. Opened from the sidebar, not a tab. */
export function ProfilePanel(props: {
  profile: BrandProfile;
  summary: BrandSummary | undefined;
  transactions: BrandTransaction[] | undefined;
  catalog: CatalogResponse | undefined;
  onBack: () => void;
}) {
  const p = props.profile;
  return (
    <div className="dpage">
      <header className="dpage-head">
        <div>
          <h1 className="dh1">Profile</h1>
          <p className="dsub">Your brand account in Shelfie.</p>
        </div>
      </header>
      <button type="button" className="dback" onClick={props.onBack}>
        ‹ Back
      </button>
      <section className="dcard" aria-label="Brand profile">
        <h2 className="dh2">{p.name}</h2>
        {p.fake ? <Pill tone="warning">Demo: fake Sokosumi</Pill> : null}
        <dl className="brand-facts">
          <dt>Brand id</dt>
          <dd>
            <code translate="no">{p.brandId}</code>
          </dd>
          <dt>Wallet (preprod)</dt>
          <dd>
            {p.walletAddress ? (
              <AddressCopy address={p.walletAddress} label="wallet address" />
            ) : (
              "No wallet on file"
            )}
          </dd>
          <dt>Credits reserved today</dt>
          <dd>
            {p.creditsReservedToday} of {p.dailyCreditCap} daily cap
          </dd>
          <dt>Max credits per store</dt>
          <dd>{p.maxCreditsPerTask}</dd>
          <dt>Max stores per request</dt>
          <dd>{p.maxStores}</dd>
        </dl>
        <p className="footnote">
          In this demo Shelfie places the Sokosumi Task and pays the Masumi escrow on behalf of your
          brand (ADR-20).
        </p>
      </section>
      <SpendCard profile={p} summary={props.summary} />
      <TransactionList
        transactions={props.transactions}
        catalog={props.catalog}
        title="Your transactions"
      />
    </div>
  );
}
