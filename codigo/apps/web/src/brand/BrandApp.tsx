import { useState } from "react";
import type { BrandProfile } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { usePolling, useLedger } from "../lib/hooks.js";
import { describeError } from "../lib/messages.js";
import { DEFAULT_EXPLORER_TX_BASE } from "../lib/format.js";
import { ExplorerProvider, Button, Field, Logo, Toast } from "../ui/index.js";
import "../styles/dashboard.css";
import { Banners } from "../dashboard/Banners.js";
import { DashboardNav } from "../dashboard/Nav.js";
import type { NavItem } from "../dashboard/Nav.js";
import { Header } from "../dashboard/Header.js";
import { TxBaseContext } from "../dashboard/TxChip.js";
import { BrandOrders } from "./BrandOrders.js";
import type { OrdersView } from "./BrandOrders.js";
import { BrandOverview } from "./BrandOverview.js";
import { ProfilePanel } from "./ProfilePanel.js";

type BrandSection = "overview" | "orders";

/** Sidebar tabs: exactly Overview and Orders. The profile is opened from the header instead. */
const BRAND_ITEMS: readonly NavItem<BrandSection>[] = [
  { value: "overview", label: "Overview" },
  { value: "orders", label: "Orders" },
];

interface Session {
  /** The brand access code: React state only, never storage or the URL (ADR-21). */
  token: string;
  profile: BrandProfile;
}

/** Brand app (`/b`, ADR-21): sign in with a brand access code, then the brand's own orders. */
export function BrandApp() {
  const [session, setSession] = useState<Session | null>(null);
  if (session === null) {
    return <SignIn onSignedIn={(token, profile) => setSession({ token, profile })} />;
  }
  return <BrandConsole session={session} onSignOut={() => setSession(null)} />;
}

/** First screen: one field. The code is checked with GET /api/brand/me before anything loads. */
function SignIn(props: { onSignedIn: (token: string, profile: BrandProfile) => void }) {
  const { api } = useDeps();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (code === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await api.brandMe(code);
      props.onSignedIn(code, profile);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  };
  return (
    <div className="app app-dashboard dsh">
      <main className="dpage">
        <header className="dpage-head">
          <div>
            <h1 className="dh1">Brand sign in</h1>
            <p className="dsub">Shelf checks for your brand. Enter the brand access code.</p>
          </div>
        </header>
        <section className="dcard dform" aria-label="Brand sign in">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field
              label="Brand access code"
              type="password"
              value={code}
              onChange={setCode}
              autoComplete="off"
              help="Stays in this tab's memory only."
            />
            <Button type="submit" disabled={code === "" || busy}>
              {busy ? "Checking…" : "Sign in"}
            </Button>
          </form>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}

/** The signed-in brand console. Polls only brand-scoped data plus the public config and health. */
function BrandConsole(props: { session: Session; onSignOut: () => void }) {
  const { api, env } = useDeps();
  const { token, profile: signedInProfile } = props.session;
  const [section, setSection] = useState<BrandSection>("overview");
  const [ordersView, setOrdersView] = useState<OrdersView>({ jobId: null, composing: false });
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const me = usePolling((s) => api.brandMe(token, s), 30_000);
  const profile = me.data ?? signedInProfile;
  const orders = usePolling((s) => api.orders(token, s), 3000);
  // Spend and transactions are secondary: if they fail the rest of the console keeps working.
  const summary = usePolling((s) => api.brandSummary(token, s), 10_000);
  const transactions = usePolling((s) => api.brandTransactions(token, s), 6000);
  const { data: config } = usePolling((s) => api.config(s), 30_000);
  const { data: health, error: healthError } = usePolling((s) => api.health(s), 3000);
  const { data: catalog } = usePolling((s) => api.catalog(s), 60_000);
  // Job receipts come from the ledger; the brand app never lists the global ledger.
  const ledger = useLedger();
  const explorerBase = config?.explorerTxBase ?? DEFAULT_EXPLORER_TX_BASE;

  const onSelect = (next: BrandSection) => {
    setProfileOpen(false);
    setSection(next);
  };
  const openJob = (jobId: string) => {
    setProfileOpen(false);
    setSection("orders");
    setOrdersView({ jobId, composing: false });
  };
  const newRequest = () => {
    setProfileOpen(false);
    setSection("orders");
    setOrdersView({ jobId: null, composing: true });
  };

  return (
    <ExplorerProvider value={explorerBase}>
      <TxBaseContext.Provider value={explorerBase}>
        <div className="app app-dashboard dsh">
          <div className="dshell">
            <aside className="dside">
              <Logo />
              <DashboardNav
                items={BRAND_ITEMS}
                current={section}
                label="Brand sections"
                onSelect={onSelect}
              />
            </aside>
            <main className="dmain">
              <Header
                health={health}
                healthError={healthError}
                stream={ledger.status}
                actions={
                  <>
                    <button
                      type="button"
                      className="text-button"
                      aria-pressed={profileOpen}
                      onClick={() => setProfileOpen((open) => !open)}
                    >
                      {profile.name}
                    </button>
                    <button type="button" className="text-button" onClick={props.onSignOut}>
                      Sign out
                    </button>
                  </>
                }
              />
              <Banners
                health={health}
                healthError={healthError}
                config={config}
                demoBadges={env.VITE_DEMO_BADGES}
              />
              {orders.error !== undefined ? (
                <p className="form-error" role="alert">
                  {describeError(orders.error)}
                </p>
              ) : null}

              {profileOpen ? (
                <ProfilePanel
                  profile={profile}
                  summary={summary.data}
                  transactions={transactions.data?.transactions}
                  catalog={catalog}
                  onBack={() => setProfileOpen(false)}
                />
              ) : null}
              {!profileOpen && section === "overview" ? (
                <BrandOverview
                  orders={orders.data?.orders}
                  catalog={catalog}
                  profile={profile}
                  summary={summary.data}
                  onNew={newRequest}
                  onOpenJob={openJob}
                />
              ) : null}
              {!profileOpen && section === "orders" ? (
                <BrandOrders
                  token={token}
                  profile={profile}
                  enabled={config?.orders?.enabled ?? false}
                  orders={orders.data?.orders}
                  catalog={catalog}
                  ledger={ledger.entries}
                  transactions={transactions.data?.transactions}
                  view={ordersView}
                  onView={setOrdersView}
                  onCreated={() => {
                    setToast("Request sent");
                    setOrdersView({ jobId: null, composing: false });
                    orders.reload();
                    summary.reload();
                    transactions.reload();
                  }}
                />
              ) : null}
            </main>
          </div>
        </div>
      </TxBaseContext.Provider>
      <Toast message={toast} onDone={() => setToast(null)} />
    </ExplorerProvider>
  );
}
