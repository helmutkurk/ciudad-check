# Screenshot-to-source mapping (not a feature commitment)

| Design image | Real app components | Decision / integrity note |
|---|---|---|
| `02_primary_worker/01_worker_home.png` + standalone home | `WorkerApp`, `Feed`, `AppHeader` | Build a visually richer entry shell over *actual* open tasks. Any greeting can use existing local name; earnings/level shown only if sourced from real history. Avoid leaking a gesture before camera reveal. |
| `02_primary_worker/02_worker_map.png` | No existing map; `Feed`, `useTaskFeed`, catalog | Highest-priority NEW feature; add only after approved safe store coordinate source; no made-up distances/pins, honor consent/CSP/attribution. Do not confuse current coarse city location with accurate distance. |
| `02_primary_worker/03_worker_tasks.png` | `Feed`, `TaskDetail`, `Claimed` | Keep OPEN feed, claimed work and existing claim; completed history not yet backed by personal history API. Remove gesture badge before reveal. |
| `02_primary_worker/04_worker_wallet.png` | `Result`, payout tx chip, local payout address | New personal finance page can show real address/most recent status; actual balance/history needs new trusted API. Never show EUR. |
| `02_primary_worker/05_worker_profile.png` | `Onboarding`, `AppHeader`, local profile | Real name/address/consent; initials/safe illustrated avatar. Ratings/XP/achievements only after approved real persistence. |
| `03_primary_dashboard/01_dashboard_overview.png` | `Overview`, `Header`, `Banners`, `DashboardApp` | Real job counts / health only; existing layout may be simplified. Map only after phase 2. No fake trend %. |
| `03_primary_dashboard/02_dashboard_requests.png` | `RequestForm`, `JobList`, `JobDetail`, `OrderStatus` | Real catalog selectors, token, idempotency, job status/report. No fabricated worker assignments. |
| `03_primary_dashboard/03_dashboard_workers.png` | Partial real job references only | Defer entire workforce-management UI unless rated worker directory and access controls are approved. No invite, online status, fake ratings. |
| `03_primary_dashboard/04_dashboard_analytics.png` | `Overview`, `JobDetail`, `LedgerView` | Only derived, sufficiently complete historical job/ledger data; no fake statistics/charts. Optional small panels. |
| `03_primary_dashboard/05_dashboard_locations.png` | Current catalog names/addresses, jobs and future map endpoint | Show read-only existing stores/tasks. "Add Location" or stores CRUD is outside current scope. |
| `04_secondary_worker/*` | Same as above | Standalone enlarged illustrations. Some display fake currency, rewards or early gestures: ignore those fields. |
| `05_secondary_dashboard/*` | Same as above | Enlarged visual illustrations. Ignore source-less revenues, fake manager avatars and invented management actions. |
| `06_flow_only/worker-detail`, `worker-claim`, `worker-camera`, `worker-verifying`, `worker-result`, `worker-oos` | `TaskDetail`, `Claimed`, `CameraSheet`, `Result` | Useful process visuals only. Superseded by ADR-19 gesture late reveal, actual CameraSheet behavior and logo/theme. |
| `06_flow_only/dashboard/dash-new-order`, `dash-detail`, `dash-ledger` | `RequestForm`, `JobDetail`, `LedgerView` | Helpful layout experiments; replace with chosen green/beige palette; maintain real data, controls and security. |

**Image fidelity note:** The 5+5 primary crops in `02_primary_worker/` and `03_primary_dashboard/` are image-generation design interpretations, not pixel-precise reconstruction of the selected combined image. The primary source of the intended composition remains the `APPROVED_DIRECTION_BOARD.png` in `00_reference/`. The standalone images in folders 04/05 are a more detailed visual interpretation, not a replacement of the functional spec. The brand icon in the image mockups may differ from the approved logo D; use official logo D.
