# CLAUDE CODE — Shelfie UI evolution (master orchestration prompt)

You are implementing a coherent visual and UX evolution **inside the existing Shelfie repository**: https://github.com/helmutkurk/shelfie. The user selected the composite concept in `00_reference/APPROVED_DIRECTION_BOARD.png` and the official logo in `01_branding/logo_D_approved_original.png`. The accompanying images are **creative reference drafts only**, NOT a spec to copy literally, NOT evidence that a feature exists, and NOT legitimate production seed data.

## Mission and priorities

Polish the two already-working website surfaces, keeping the original system functioning end to end:
- `/w` = mobile worker app: may follow the chosen consumer-rewards layout rather closely, with judicious gamification, nearby task map (very important), task lists, honest payouts/history, profile, and clean navigation.
- `/dashboard` = customer/brand + operator in one app: follow the chosen minimalist business look **selectively**. Optimize real brand order placement, request monitoring, verification evidence, actual ledger and payment states; avoid creating a decorative fake administration suite.
- Same logo, palette, design tokens, copy style, status terminology, accessibility, and data interpretation in both surfaces; do not make them separate products.

## Mandatory governance BEFORE TOUCHING A FILE

1. Work in the actual repository, check current branch, changed/uncommitted files, active collaborator work and latest merges. **Do not overwrite teammate changes.** Use the project's existing `dev` integration, peer review and release procedures; never push directly to `main` or bypass hooks.
2. Follow `CLAUDE.md` -> `AGENTS.md` and nested `codigo/CLAUDE.md`, `.claude/rules/web.md` and all other relevant path-specific rules. The project mandates `bash scripts/context-ack.sh --session <session-id> --who helmut`, reading its context card and mandatory files before writes. Do not fake that acknowledgment, weaken guardrails, or perform filesystem writes first.
3. Read, at minimum, `ideas/decision.md`, `investigacion/cardano/official-agent-prompt.md`, `diseno/README.md`, `diseno/contracts.md`, `diseno/webapps.md`, `diseno/ui-design.md`, `diseno/decisions.md` (ADR-16, ADR-17, ADR-19, ADR-20), `diseno/security.md`, `diseno/repo-layout.md`, `equipo/README.md`, `equipo/components.md`, `equipo/helmut.md`, last two entries in `docs/ai-log.md`, current `codigo/docs/verified.md` and `codigo/apps/web/README.md`. Run `bash scripts/peer-review.sh pending` and `bash scripts/task.sh next D` per project policy. Adapt to new instructions if rules changed since this package was prepared.
4. Your first status reply must give Shelfie's purpose in one sentence, identify role D (Helmut; coordinate with C/Lorenz), and name the files you actually read, as required by `AGENTS.md`. This prompt does not supersede the repository instructions or invent authority to modify the team's product scope.
5. After a read-only inventory, present a scoped plan and a before/after component mapping. Request team approval for new dependencies, new public endpoints, server-side personal data, rating mechanics, new features with nontrivial privacy/financial impact, and material changes to canonical design/contracts. If a gate blocks editing, obey it; don't circumvent. Make honest progress in small reviewable increments.

## Confirmed architecture (audit again; code wins if changed)

- Node 24, strict TypeScript/ESM, Vite, React 19, npm workspaces under `codigo/`; `@shelfie/web` is in `codigo/apps/web`. Existing dependencies include `@shelfie/core`, `@shelfie/evidence`; TypeScript schemas are validated with zod. No new UI framework is required by this request.
- **Shared effects** are injectable via `src/deps.tsx`; API client `src/lib/api.ts`, live task/ledger hooks `src/lib/hooks.ts`, helpers for location, capture, format, storage, messages. Do not bypass them or create duplicate API logic.
- Worker UI: `src/worker/WorkerApp.tsx`, `Onboarding.tsx`, `Feed.tsx`, `TaskDetail.tsx`, `Claimed.tsx`, `CameraSheet.tsx`, `Result.tsx`, `AppHeader.tsx` and shared `src/ui/`.
- Dashboard: `src/dashboard/DashboardApp.tsx`, `RequestForm.tsx`, `OrderStatus.tsx`, `JobList.tsx`, `JobDetail.tsx`, `Overview.tsx`, `LedgerView.tsx`, `OperatorTools.tsx`, `Banners.tsx`, `Header.tsx`.
- Current styling: `src/styles/tokens.css`, worker and dashboard styles, CSS variables and system-font policy. Refactor via shared semantic tokens, scoped components; build coherent light/dark/system support, honor reduced motion and accessibility.
- Root documentation currently has legacy blue aesthetic defaults. Updating canonical `diseno/ui-design.md` requires the project's explicit minor impact/ADR procedure. Behavior remains governed by contracts and accepted decisions.

## Functional invariants — DO NOT REGRESS

**Worker:** Payout address (`addr_test1...`), locally held name and `consent-v1`; declining consent allows read-only discovery but must prevent claiming. Current "sign in" is not a password/email session; do not invent an account model. No fake CIP-30 connection. Preserve coarse location city feed and claim, task SSE (`task_opened`/`task_closed` with reconnection/polling), first atomic claim wins, claim expiry/release, errors, live secure-context camera only (NO gallery / uploaded photos for task proof), fresh capture-time location with server geofence checks, out-of-stock capture, preview/retake, retry, verdict and actual payout state/tx explorer link. Do not persist photos. Never call a prize "earned" until the underlying state justifies it.

**Proof freshness:** ADR-19 already implements server-generated gesture challenge, default **2, 3, 4 or 5 fingers** AND hand at `left` or `right` of the tag; hidden until camera opens and `POST /api/claims/{claimId}/challenge` reveals it. Idempotent reveal does not refresh the timer; currently `answerWithinSec` is approximately 90 s, but render the value returned by the API, not a hardcoded number. Enforce server's 409 unrevealed submission, exact count/side/confidence verification,  G6 freshness and G8 screen-recapture checks. Avoid early revelation: **all mockups with gesture on a feed/task preview are wrong as implementation guidance**. Do not draw a fixed gesture, and do not replace it with code or omit side. Legacy `card-pool` / `handwritten` modes may still exist behind server configuration; preserve compatibility via `config.challengeMode` / response type. One finger is user artwork but NOT the current default 2–5 server schema; changing that requires a separate approved contract/ADR.

**Dashboard:** Existing `/dashboard` is both brand/customer and operator, NOT a separate new `/brand` app. Catalog-driven product select, chain filter, store multiselect (NO free-form input for store/product), brand access code held **in React/tab memory only** (`X-Brand-Token`), idempotency keys stable across uncertain order responses, max stores, order status polling, per-store jobs (one store/product/photo per job), real requests, progress, report text/download, ledger event history, actual health banners, separate vbuy and payout wallets, preprod tx hashes with explorer links, admin/operator controls in a collapsed disclosure with in-memory operator token. Preserve `/dashboard?stage`. Respect real buying availability; never make a disabled real purchase look successful. Do not strip warnings about verifier stub, fake payments, operator override, empty wallet, unavailable engine.

**Payment:** Cardano PREPROD, **tADA**, actual lovelace values formatted by existing helpers. Never render a Euro value as the wallet balance or mix test ADA with fiat exchange equivalence. Payment queued, sending, submitted, confirmed, unknown/reconciliation, withheld and refunds are distinct concepts. Buyer escrow via Masumi/Sokosumi and worker payouts via preprod must not be conflated. No invented transfers, counts, balance graphs, fees, "EUR" or discounts.

**Privacy/security:** No worker photos/precise location or secrets in logs or client storage. No extra user tracking, third-party fonts/scripts, `dangerouslySetInnerHTML` or hidden token persistence. Preserve server authorization, gates, strict zod contracts, HTTP-only secure camera rule, fraud controls and existing CSP; do not bypass reviews just to fit a map library. New avatar / ratings / notification collection needs privacy and permission assessment.

## Design adaptation rules

Use the approved board as an **aesthetic north star**: green #0B2E1F / #2E7D32 / #6BAF5B, light sage #CFE7C1, cream #F5EFE3 (illustrative starting tokens; calibrate contrast); friendly 3D/cartoon avatar styling may inform fallback silhouettes but cannot be a fake photo of a real worker. Rounded surfaces, clean hierarchy, useful whitespace, clear type, restrained colored statuses, intuitive mobile bottom navigation and dashboard side navigation. Use existing logo D *as-is* (not the simplified logo in some newly generated screenshots).

No wall of cards, fake dashboard charts, fake team portraits, stars, arbitrary high scores, fake pinned prices, fictional addresses, emoji-heavy components, glitter or casino-like gamification. Status and metrics must be honest. Gamification may be implemented in layers: first real achievements derived from existing verified actions, never show a level or XP if no persistent supported rule exists. Any gamification rules that impact trust or payout must be agreed separately.

Use stable view state / navigation that is compatible with current routing and browser history, especially while a task is claimed. Working back/cancel actions, sheets, scroll containers, mobile safe areas, keyboard/ARIA focus, loading/empty/error states and themes are required. Large maps must not hide the task list or prevent the user from acting when location is blocked. Every control must work; no decorative dead buttons.

## Feature classification — mandatory gating

Before coding each item classify it:
- **A — Cosmetic/reorganization only:** existing component's styling/navigation/layout, existing button/field behavior, theme, empty states. Implement with little risk.
- **B — Data already available:** derived counts, list filters, existing order/job/ledger reports, SSE in-app update indicators. Implement only by using typed client/schema and meaningful empty cases.
- **C — New product capability:** worker map coords, history across sessions, actual wallet balance, profile photo upload, persisted ratings (both worker and customer), account identities, notification center, geographic analytics. Requires a product design, source of truth, security review, API and UI contracts, tests, and user/team approval. Implement in a separate agreed phase. Never simulate a C feature using invented A/B data.
- **D — Defer:** franchise chain manager, invite/assign workers, store CRUD, external messaging, staff online presence, salary/Euro wallets, artificial KPI trends, elaborate rewards and real-money services unrelated to accepted scope.

For any C capability, show the fallback/skeleton without misleading content only if it makes sense, otherwise omit navigation entry entirely. A non-clickable tab claiming the feature exists is not acceptable. Do not expand `packages/core` or engine interfaces without contract-first changes and explicit scope approval.

## Map is high priority, but correct data is non-negotiable

The internal `CatalogStoreSchema` has lat/lon, BUT public `GET /api/catalog` intentionally strips coordinates. `TaskListItemSchema` has store name/address/product/amount/deadline, **not lat/lon**. Do not assume geocoded pins exist in feed. Propose the minimal safe source: a contractually approved public read-only store geolocation response keyed by catalog store id / public task id, sourced from current seed catalog, with only safe store positions (not worker locations). Update `diseno/contracts.md` FIRST and zod `packages/core` in the same commit only if approved, coordinate with A (engine/core). Do not reveal precise worker capture coordinates in map outputs. Use one map implementation strategy consistent with existing CSP and dependency policy; document map attribution, provider/tiles, offline / failed-load / deny-location fallback. When access is unavailable, the real task list remains first-class; no fake Munich markers.

## Process / phases / proof

**Phase 0: read-only inspection and feasibility.** Produce `UI_INVENTORY.md`, tab-by-tab source-mapping, the status of features, constraints, demo/real mode, no edits before context gate. Review screenshots at native scale. Explicitly flag every value or screen invented by image tools.

**Phase 1: shared brand + visual refactor, zero contract changes.** Build tokens and UI primitives; apply logo safely, manual Light/Dark/System selector persisted without secrets; worker Home/Tasks/Profile layout around current flow; dashboard Overview/Requests/Order form/Details/Ledger layout. Keep existing routes and tests. No new external packages without approval.

**Phase 2: map.** Plan/ticket and approval for minimum API or source data, map tool decisions and privacy; then implement worker map and a small **derived** dashboard locations view if rational. Filter same task source as list, no divergent states, genuine positions. Test no-location/offline and SSE closures.

**Phase 3: agreed features only.** Avatars, ratings for both sides, in-app notifications, history, earnings, basic derived gamification. Build one at a time after explicitly confirming source + permission + contract + UI semantics. Document things deferred.

**Final:** Run `cd codigo && npm run check`, `npm run build -w @shelfie/web`, smoke as permitted (`npm run smoke` when environment supports it), and targeted tests for both routes. Verify camera in HTTPS on actual phone, gesture reveal timing, claimed-task state, photoless HTTP restrictions, feed SSE, B2B ordering/auth/idempotency, ledger and explorer, OOS, error banners, light/dark, scrolling at 360/430/768/1280 and 130% text. Keep repo's pre-push peer-review/gate steps and `/sync-context` handoff. Screenshot real running views, report tests (including failures) and commits, no implicit release.

## Output I expect from you

1. Project gate/context compliance and read-only source inventory.
2. Design-to-component mapping with confidence, real data source, missing data, feasibility category, and status.
3. Proposed plan with smallest safe deliverables, approvals needed, affected files/tests.
4. Incrementally implemented working code in existing files/components, not a superficial clone.
5. Before/after screenshots, tests, deliberate omissions, tradeoffs, and updated handoff docs.

Read `07_prompts/01_WORKER.md`, `02_DASHBOARD.md`, `03_NEW_FEATURES.md`, `04_BRANDING.md`, and `08_context_and_QA/` before implementation. Adopt later repository facts over any stale wording in these prepared prompts.
