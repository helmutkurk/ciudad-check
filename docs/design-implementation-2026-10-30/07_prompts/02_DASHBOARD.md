# CLAUDE CODE — Customer/operator `/dashboard`: selective UI redesign

Apply after master prompt and accepted repo rules. A clean, confident forest-green/cream business UI is the goal. Use `03_primary_dashboard/` as aesthetic references. **Do not interpret all dashboard pages or invented sample totals as requests to implement a new B2B SaaS.** Existing product's central purpose is ordering and verifying ONE product in ONE store per job (even if a brand picks many stores, engine creates several jobs), obtaining a verifiable report and tracking preprod payment evidence.

## Preserve what exists (source components)

`DashboardApp.tsx`: current screen states `jobs`, `new`, `job`, `ledger`; real config/health/catalog/jobs/ledger polling and SSE; `/dashboard?stage`. Keep all; improve navigation and hierarchy without necessarily creating new routes. `Header.tsx` system status and Cardano preprod badge. `Banners.tsx` informative fake/stub/override/empty-wallet/offline warnings (never hide). `RequestForm.tsx` catalog-only native selects, chain filter and multi-select, brand access code stored **in memory**, order enabled/realReady/fake/caps, error states, idempotency key retained across transient request ambiguity. `OrderStatus.tsx`: per-store order statuses. `JobList.tsx`, `JobDetail.tsx`: request progress, verifications, OOS, real report/export, timeline and tx chips. `LedgerView.tsx`: append-only sequence, event filtering, real separate verification/payout wallets and explorer links. `OperatorTools.tsx`: admin token and demo operations under collapsed disclosure, not a public brand action. Keep `Overview.tsx` honest state and avoid fabricated deltas.

## Recommended minimal desktop navigation

- **Overview**: real KPIs from existing JobView / HealthResponse, latest request/activity, small real task-location map only after approved map source exists. If data insufficient, use list and concise metrics instead. Avoid arbitrary "active workers", "rating 4.7", "€ total spent", time-series charts when backend can't justify them.
- **Requests**: strongest page. Search/filter by actual status/id/store/product from current orders/jobs; open existing job timeline/report and order card; **Create order** button opens same `RequestForm`, not a duplicate endpoint. A simple responsive details drawer can be used if preserving state. Keep statuses verbatim and accessible.
- **Ledger / Payments**: can remain two panels or one Payments & Ledger section, but preserve both real wallet states, sequence and explorer receipts. Avoid repeated financial data on every screen. Label test ADA, refund, escrow/fee vs worker payout clearly.
- **Locations**: *optional derived view* after map work. Display real catalog stores and number of tasks from actual jobs; public catalog currently exposes names/addresses/chain but NOT coordinates, so coordinate publication requires explicit contract review. Do not invent a store CRUD admin feature just because mockup shows an "Add Location" button.
- **Analytics / History**: useful summaries derived from genuine job/verdict/ledger history only; respect pagination/incomplete datasets. No imaginary growth percentages, revenue, active-worker stats, conversion funnels, store traffic, or verification time trends. Show scope/coverage of dataset and "No history yet" when empty. Prefer one or two credible small panels over multiple decorative charts.
- **Workers**: NOT required as a full management module. There's no real worker-directory/rating/online-presence API. Show a lightweight job-level anonymized worker reference where already present and authorized; otherwise omit. No "Invite worker", "Assign", "Online" or worker contact information without designed contracts and approvals.
- **Settings**: theme and maybe existing operational links. DO NOT expose credentials in settings, write test tokens to localStorage, or add a fake workspace/account management area.

Responsive strategy: sidebar on desktop that reduces to a drawer on tablet/mobile, real tables with sorting/filtering/pagination only when source supports it, correct overflow, sticky headings/controls, accessible controls and focused dialogs. The smaller `?stage` mode must still display live monitoring legibly at projection size. Preserve error banners despite a cleaner style.

## New features that may be planned separately

- Rating both customers and workers after a verified task; requires explicit identity and trusted transaction-linked reviews and new storage. Don't generate fake five-star badges.
- An in-app notifications panel built from real event stream; without durable notification records, it may be session-only, clearly scoped; no phantom notification counts.
- Authentic historic analytics (job result, outcome, time, paid tx) derived from append-only events or new read-only API with access controls and retention considerations.
- Store map: read-only store positions keyed by existing catalog ID, only if team approves public map endpoint/security and tile provider attribution. Can be shared with worker map data source but may require customer-specific filtered views.

## Key review test

Place a catalog-backed request with brand token (fake mode only when configured), multiple stores -> multiple distinct jobs, observe update status, open real report with OOS/verdict, see separate payouts/refunds on ledger, operator tools still function behind admin token and state survives view switches. Confirm disabled real buying remains disabled, unknown prices remain unknown, wallet insufficiency is honest and no sample merchant/person/price data is displayed in production.
