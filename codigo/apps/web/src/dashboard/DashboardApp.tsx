import { useCallback, useState } from "react";
import { useDeps } from "../deps.js";
import { usePolling, useLedger } from "../lib/hooks.js";
import { ExplorerProvider, Button, Field, Logo, Toast } from "../ui/index.js";
import { DEFAULT_EXPLORER_TX_BASE } from "../lib/format.js";
import "../styles/dashboard.css";
import { Banners } from "./Banners.js";
import { DASHBOARD_ITEMS, DashboardNav } from "./Nav.js";
import type { NavSection } from "./Nav.js";
import { Header } from "./Header.js";
import { JOB_WINDOW } from "./model.js";
import { Overview, OverviewTiles } from "./Overview.js";
import { TxBaseContext } from "./TxChip.js";
import { JobDetail } from "./JobDetail.js";
import { JobList } from "./JobList.js";
import { LedgerView } from "./LedgerView.js";
import type { JobView } from "@shelfie/core/browser";
import { OperatorTools } from "./OperatorTools.js";
import { describeError } from "../lib/messages.js";
import { LocationsPanel } from "./Locations.js";

/** In-app view state (not in the URL). `job` belongs to the Orders section. */
type View =
  | { name: "overview" }
  | { name: "orders" }
  | { name: "job"; id: string }
  | { name: "locations" }
  | { name: "ledger" }
  | { name: "operator" };

function sectionOf(view: View): NavSection {
  return view.name === "job" ? "orders" : view.name;
}

/**
 * Operator dashboard (`/dashboard`, ADR-21). Nothing is shown until the operator token passes
 * `GET /api/admin/ping`; brand ordering lives in the brand app (`/b`).
 */
export function DashboardApp() {
  // Memory only (security.md: no localStorage). Set only after the engine accepted the token.
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const stage =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("stage");
  if (adminToken === null) return <OperatorGate onUnlock={setAdminToken} />;
  return <OperatorConsole adminToken={adminToken} stage={stage} />;
}

/** First screen: the operator token, checked with the admin ping before any operator view loads. */
function OperatorGate(props: { onUnlock: (token: string) => void }) {
  const { api } = useDeps();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (token === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminPing(token);
      props.onUnlock(token);
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
            <h1 className="dh1">Operator</h1>
            <p className="dsub">Operator views for Shelfie. Brand customers use /b.</p>
          </div>
        </header>
        <section className="dcard dform" aria-label="Operator sign in">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field
              label="Operator token"
              type="password"
              value={token}
              onChange={setToken}
              autoComplete="off"
              help="Stays in this tab's memory only."
            />
            <Button type="submit" disabled={token === "" || busy}>
              {busy ? "Checking…" : "Unlock"}
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

/** The operator sections. Mounted only after the gate, so no operator data loads before it. */
function OperatorConsole(props: { adminToken: string; stage: boolean }) {
  const { api, env } = useDeps();
  const [view, setView] = useState<View>({ name: "orders" });
  const [toast, setToast] = useState<string | null>(null);
  const { adminToken, stage } = props;

  const { data: config } = usePolling((s) => api.config(s), 30_000);
  const { data: health, error: healthError } = usePolling((s) => api.health(s), 3000);
  const { data: catalog } = usePolling((s) => api.catalog(s), 60_000);
  const { data: jobs } = usePolling(async (signal) => {
    const list = await api.jobs(signal);
    // verify Friday: GET /api/jobs carries no counts, so each recent job is read once more.
    return Promise.all(list.jobs.slice(0, JOB_WINDOW).map((j) => api.job(j.id, signal)));
  }, 3000);
  const ledger = useLedger();

  const section = sectionOf(view);
  const onCreated = useCallback((id: string) => {
    setToast("Request sent");
    setView({ name: "job", id });
  }, []);
  const onSelect = useCallback((next: NavSection) => {
    // Orders keeps the open request when you return to it.
    setView((cur) => (next === "orders" && sectionOf(cur) === "orders" ? cur : { name: next }));
  }, []);
  const explorerBase = config?.explorerTxBase ?? DEFAULT_EXPLORER_TX_BASE;
  // Stage mode is for the room: no operator tools there.
  const items = stage ? DASHBOARD_ITEMS.filter((i) => i.value !== "operator") : DASHBOARD_ITEMS;

  return (
    <ExplorerProvider value={explorerBase}>
      <TxBaseContext.Provider value={explorerBase}>
        <div className={`app app-dashboard dsh ${stage ? "stage" : ""}`}>
          <div className="dshell">
            <aside className="dside">
              <Logo />
              <DashboardNav
                items={items}
                current={section}
                label="Operator sections"
                onSelect={onSelect}
              />
            </aside>
            <main className="dmain">
              <Header health={health} healthError={healthError} stream={ledger.status} />
              <Banners
                health={health}
                healthError={healthError}
                config={config}
                demoBadges={env.VITE_DEMO_BADGES}
              />

              {section === "overview" ? (
                <Overview
                  jobs={jobs}
                  catalog={catalog}
                  health={health}
                  ledger={ledger.entries}
                  onOpenJob={(id) => setView({ name: "job", id })}
                />
              ) : null}

              {section === "orders" ? (
                <div className="dpage">
                  <header className="dpage-head">
                    <div>
                      <h1 className="dh1">Orders</h1>
                      <p className="dsub">
                        Every request, newest first. Open one for its timeline and report.
                      </p>
                    </div>
                  </header>
                  <div
                    className="dgrid dgrid-two"
                    data-view={view.name === "job" ? "job" : "orders"}
                  >
                    <div className="dcol dcol-list">
                      <JobList
                        jobs={jobs}
                        catalog={catalog}
                        selectedId={view.name === "job" ? view.id : null}
                        onOpen={(id) => setView({ name: "job", id })}
                      />
                    </div>
                    <div className="dcol dcol-detail">
                      {view.name === "job" ? (
                        <JobDetail
                          jobId={view.id}
                          catalog={catalog}
                          ledger={ledger.entries}
                          onBack={() => setView({ name: "orders" })}
                        />
                      ) : (
                        <NoRequestSelected jobs={jobs} />
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {section === "locations" ? (
                <div className="dpage">
                  <header className="dpage-head">
                    <div>
                      <h1 className="dh1">Locations</h1>
                      <p className="dsub">Stores in the public catalog. Read only.</p>
                    </div>
                  </header>
                  <LocationsPanel catalog={catalog} jobs={jobs} />
                </div>
              ) : null}

              {section === "ledger" ? (
                <div className="dpage">
                  <LedgerView entries={ledger.entries} status={ledger.status} health={health} />
                </div>
              ) : null}

              {section === "operator" && !stage ? (
                <div className="dpage">
                  <header className="dpage-head">
                    <div>
                      <h1 className="dh1">Operator tools</h1>
                      <p className="dsub">Uses the operator token you unlocked this tab with.</p>
                    </div>
                  </header>
                  <OperatorTools
                    catalog={catalog}
                    packId={config?.packId ?? "shelf-check"}
                    enabledOverride={config?.demoOverrideEnabled ?? false}
                    ledger={ledger.entries}
                    adminToken={adminToken}
                    onCreated={onCreated}
                  />
                </div>
              ) : null}
            </main>
          </div>
        </div>
      </TxBaseContext.Provider>
      <Toast message={toast} onDone={() => setToast(null)} />
    </ExplorerProvider>
  );
}

/** Detail column while no request is open: the same real counts the overview shows. */
function NoRequestSelected(props: { jobs: JobView[] | undefined }) {
  return (
    <section className="dcard dhint" aria-label="Request detail">
      <h2 className="dh2">Request detail</h2>
      <p className="dsub">Select a request to see its timeline, transactions and report.</p>
      <OverviewTiles jobs={props.jobs} />
    </section>
  );
}
