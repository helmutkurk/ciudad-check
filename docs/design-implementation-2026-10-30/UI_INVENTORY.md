# UI inventory (Phase 0, read-only)

Snapshot: branch `dev`, HEAD `c3344c3` at session start. Scope: `codigo/apps/web/src/**`, `index.html`, `vite.config.ts`, `public/`, the design package in this folder. No source edits, no commits. Not run in this phase: `npm run check`, `npm test`, the browser. Line refs are to the file itself (`file:line`). Class: **A** styling/reorganisation only, **B** real data already available, **C** needs new API/storage/approval, **D** defer.

## 1. Routing and view state

### 1.1 Entry points

| Input | Result | Where |
|---|---|---|
| `/` | `location.replace("/story/index.html")` | `App.tsx:12-14` |
| `/dashboard`, `/dashboard/*` | `DashboardApp` | `lib/router.ts:27-29`, `App.tsx:15` |
| any other path (including `/w`) | `WorkerApp` (no path check for `/w`) | `lib/router.ts:28`, `App.tsx:15` |
| `/dashboard?stage` | same app; `stage` read from `window.location.search` on each render, no listener. Skips the form column (`DashboardApp.tsx:71-99`) and the "New order" button (`:120-128`); adds `.stage` (`:55`); CSS `--base-size: 125%` (`components.css:518-520`) | `DashboardApp.tsx:31-32` |
| `/w/*`, `/dashboard/*` in production | rewritten to `index.html` | `vercel.json` rewrites |

- `navigate()` (`lib/router.ts:20-23`) has no caller. No in-app URL changes exist. Dashboard views and worker screens are not in the URL: no deep link to a job, the ledger or a claim.

### 1.2 Worker flow (`worker/WorkerApp.tsx`)

`screen` is one `useState` union (`WorkerApp.tsx:27-32`): `onboarding | feed | detail{task} | claimed{task,claim} | result{task,info}`. Initial value: `feed` if a profile and `consent-v1` exist, else `onboarding` (`:41-45`). Reload loses the screen; an active server claim survives until its TTL.

| From | Trigger | To | Where |
|---|---|---|---|
| start | profile + consent missing / present | onboarding / feed | `WorkerApp.tsx:41-45` |
| onboarding | Continue (saves profile + consent) | feed | `:109-115`, `Onboarding.tsx:63-69` |
| onboarding | Decline (clears consent) | feed, read-only | `:116-120` |
| feed | tap a task | detail | `:130`, `Feed.tsx:96` |
| feed | profile button | onboarding | `:132`, `AppHeader.tsx:53-60` |
| detail | "Tasks" back | feed | `:143`, `TaskDetail.tsx:66` |
| detail | no profile | onboarding | `:144`, `TaskDetail.tsx:35-37` |
| detail | claim OK | claimed | `:145`, `TaskDetail.tsx:50` |
| detail | 409 `task_not_open` | feed + notice "Another worker was faster." | `:146-149`, `TaskDetail.tsx:54-55` |
| detail | location error | inline error, stays on detail | `TaskDetail.tsx:52-53` |
| claimed | Open camera | sheet, mode OBSERVED | `:159`, `Claimed.tsx:46` |
| claimed | Product not on the shelf | sheet, mode OUT_OF_STOCK | `:160`, `Claimed.tsx:47` |
| claimed | Give task back (confirm) | `api.release`, feed + toast "Task given back" | `:161`, `:90-100`, `Claimed.tsx:48-57` |
| claimed | countdown reaches 0 | detail + toast "Claim expired, take the task again." | `:162-166`, `Claimed.tsx:26` |
| sheet | submit OK | result | `:175-178`, `CameraSheet.tsx:207` |
| sheet | `claim_expired` / `already_submitted` | detail + toast | `:179-183`, `CameraSheet.tsx:80-81`, `:212-213` |
| result | Next task / Back to tasks | feed | `:194`, `Result.tsx:109`, `:134` |
| result | Try again (new code) | detail | `:195`, `Result.tsx:131-133` |

State ownership and lifetime:

| State | Owner | Lifetime |
|---|---|---|
| screen, profile, consented, toast, notice, camera mode, busy, explorer base | `WorkerApp.tsx:39-50` | page memory; profile and consent in localStorage (`lib/storage.ts`) |
| location, location state | `WorkerApp.tsx:53-54`; auto-read when `shelfie.locationHint` is set (`:69-71`) | session |
| feed rows, pending buffer, SSE status | `useTaskFeed` (`lib/hooks.ts:143`), inside `Feed` | **unmounted on every screen change**: each return to the feed reloads the list and reopens the stream |
| camera stream, reveal, shot, location line | `CameraBody` (`CameraSheet.tsx:47`) | `Sheet` mounts children only while open (`ui/index.tsx:266`); each open re-reveals (server-idempotent) |
| give-back confirm | `Claimed.tsx:17` | local |
| busy / error | `TaskDetail.tsx:31-32` | local |
| verdict polling | `Result.tsx:149-158` (2 s, stops when `isFinished`) | until settled |
| workerId | localStorage, `loadWorkerId` (`lib/storage.ts:65-71`) | persisted |

### 1.3 Dashboard view state (`dashboard/DashboardApp.tsx`)

| State | Where | Notes |
|---|---|---|
| `view` = `jobs \| new \| job{id} \| ledger` | `:21`, `:26`; section derived `:45` | not in the URL |
| `brandToken` | `:27`; `RequestForm.tsx:70-76` | password field, memory only |
| `orderId` (last created) | `:28` | keys the orders panel: `OrdersPanel` keyed `token:orderId` (`:104`) |
| `adminToken` | `:29`; `OperatorTools.tsx:65-72` | memory only |
| toast | `:30` | "Request sent" after create (`:46-49`) |
| polling | `:34-43` | config 30 s, health 3 s, catalog 60 s, jobs 3 s (**re-reads up to 10 jobs every tick**, `:37-41`), orders 3 s (`:160-167`), ledger via `useLedger` (`lib/hooks.ts:232`) |
| `JobDetail` polling | `JobDetail.tsx:59-60` | job and payouts every 3 s, never stops, even when terminal |
| `RequestForm` | `RequestForm.tsx:20-26` | product, chain, store ids, busy, error, idempotency-key map (in memory) |

## 2. Components

### 2.1 Worker (`src/worker/`)

| File | Purpose | Key props | Data source | States rendered | Tests (file: test) | Selectors the tests rely on |
|---|---|---|---|---|---|---|
| `WorkerApp.tsx` | screen state machine, storage, location, toast | none (`useDeps`) | `GET /api/config` (`:74-81`); `readCoarseLocation`; localStorage | all five screens, toast, sheet | `camera.test.ts` "worker app" (`:226`, `:252`) | button "Continue"; checkbox; label "Payout address"; testid `challenge-code`; text "Example Pale Ale 0.33 l" (clicked) |
| `Onboarding.tsx` | W0: payout address, name, consent | `initial`, `consented`, `onSave`, `onDecline` | none (zod `PayoutAddressSchema`) | address error after blur; Continue disabled until valid and agreed; no back button | `camera.test.ts:252` "starts at onboarding with consent text and a validated address" | text `/Version consent-v1/`; button "Continue" (disabled state); label "Payout address"; single `checkbox` |
| `Feed.tsx` | W1 live open-task list | `location`, `locationState`, `onRequestLocation`, `onOpen`, `address`, `onEditProfile`, `notice` | `useTaskFeed`: `GET /api/tasks?status=OPEN&lat&lon`; SSE `/api/tasks/stream` (`task_opened`, `task_closed`, `ping`); reconcile 15 s open / 3 s closed | location missing (idle, reading, denied, unavailable); skeleton; reconnect banner; error; "N new tasks" pill; empty; rows with `leaving` | `feed.test.ts`: lists with reward (`:35`), removes on `task_closed` (`:43`), adds on `task_opened` (`:54`), tap opens detail (`:63`), empty state (`:72`), location button (`:88`); reducer (`:107-141`); reconcile (`:142`) | `.task-reward-amount`; button "Allow location"; text `/No tasks in Munich right now/`; clickable task text |
| `TaskDetail.tsx` | W2: details and "Take this task" | `task`, `profile`, `canClaim`, `onBack`, `onClaimed`, `onTooSlow`, `onNeedProfile` | `POST /api/tasks/{id}/claim` with coarse location, workerId, name, payout address | hero; steps (hard-coded, see risk R1); inline error; "looking around only" note; "Taking…" | `claim.test.ts` `:41` claims with coarse location; `:52` 409 "another worker"; `:61` wrong city; `:72` location denied; `:92` button disabled until consent | button "Take this task" (exact); text "Another worker was faster."; `/Allow location \(city level\)/`; "This task is in Munich; you appear to be elsewhere." |
| `Claimed.tsx` | W3: timer, hand-sign intro or code, camera / OOS / give-back | `claim`, `busy`, `onOpenCamera`, `onOutOfStock`, `onGiveBack`, `onExpire` | `ClaimResponse` (no fetch) | gesture intro (`:29-35`) vs handwritten code (`:36-44`); confirm row | `camera.test.ts:237-249` only (through `WorkerApp`); no unit test | testid `challenge-code`; button "Open camera"; group "Give the task back?" |
| `CameraSheet.tsx` | W4: live capture, reveal, location line, preview, submit | `open`, `mode`, `onModeChange`, `claim`, `task`, `onClose`, `onSubmitted`, `onClaimLost` | `POST /api/claims/{id}/challenge` (gesture only, `:70-89`); `getUserMedia` (`lib/camera.ts`); fresh GPS fix; `POST /api/tasks/{id}/submissions` (`:192`) | insecure notice (`:226-241`); camera error; reveal loading / error / chip; location reading / ok / weak / off; preview; "Sending…"; OOS title | `camera.test.ts`: sheet `:52-156` (8 tests), gesture `:171`, `:198`, constraints `:268` | button "Take photo" (aria-label, `:330`); "Use photo"; testids `location-status`, `gesture-sign` (aria-label `Hold up 3 fingers to the left of the price tag`); dialog name "Price photo" / "Empty shelf spot"; "Open the secure link to take the photo."; `/camera is blocked/i`; `/about 240\sm from the store/`; no `input[type=file]` |
| `Result.tsx` | W5/W6: verdict polling and rendering | `Result`: `submissionId`, `payoutAmount`, `queuePosition`, `onNext`, `onRetry`; `VerdictView`: `view` + same | `GET /api/submissions/{id}` every 2 s (`:150-158`) | waiting (queue position); PASSED (verified / not on the shelf); payout status words; tx row; REJECTED / ERROR_FINAL; load error | `verdict.test.ts`: `:24` PASS, `:36` payout pending, `:42` OOS, `:50` FAIL, `:58` queue, `:63` polling stops, `:70` extraction | heading "Verified" (exact); heading "Verified: not on the shelf"; "Price read", "Label read", "Same as a price photo", "Payment confirmed", "Payment pending", "Rejected", "Attempts left"; link "View on explorer"; button "Try again (new code)"; "Queued for verification, position 2."; body text "2.49 EUR" |
| `AppHeader.tsx` | wordmark, connection status, payout chip (copy), profile button | `address`, `onEditProfile`, `status?` | none (props) | chip with short address / warn "Set payout address"; "Copied" state | none direct (rendered by `Feed`) | aria-labels "Copy payout address …", "Edit profile and payout address" (not asserted) |

### 2.2 Shared UI (`src/ui/index.tsx`)

| Export | Purpose | Notes |
|---|---|---|
| `NavBar`, `LargeTitle`, `Group`, `Row` | layout blocks (iOS-like grouped lists) | `Group` footer copy is used for consent (`Onboarding.tsx:35`) |
| `Button`, `TextButton` | primary and secondary actions | `button-primary` / `text-button destructive` classes |
| `Field`, `Select` | labelled inputs; `Field` links label with `useId` | tests query by label text |
| `Segmented` | `role=group` with `aria-pressed` buttons | used for "Filter requests", "Section" |
| `Pill`, `Banner`, `EmptyState` | status, alerts (`role=alert` for error, `status` otherwise), empty states | `Banner` role differs by tone (`:216-219`) |
| `Sheet` | native `<dialog>`, `showModal`; content mounts only when open; Escape calls `onClose` | `aria-label` = title (`:260`) |
| `Toast` | 4 s status toast | `:275` |
| `TxLink` | explorer link + copy; text "No explorer page (fake hash)" when no URL | `:306` |
| `Countdown` | mm:ss timer; `aria-label "<t> left"`; testid `countdown` | `onExpire` fires once per effect run (see R12) |
| `Icon`, `Wordmark`, `ConnectionStatus`, `Skeleton` | inline SVG icons; inline "Shelfie" wordmark; Live / Reconnecting | `Wordmark` is not logo D (see 3.6) |

Indirect test coverage for `ui/index.tsx` comes through the component tests above.

### 2.3 Dashboard (`src/dashboard/`)

| File | Purpose | Key props | Data source | States rendered | Tests (file: test) | Selectors the tests rely on |
|---|---|---|---|---|---|---|
| `DashboardApp.tsx` | `/dashboard` shell and polling | none | config, health, catalog, jobs, ledger (see 1.3) | views jobs / new / job / ledger; stage; "Enter your brand access code…" hint (`:111`) | `dashboard.test.ts` "dashboard orders" (`:132`) | button "Ledger" (exact); `/Example Pale Ale/` button; "Demo job" absent without token (`:163`) |
| `Header.tsx` | brand, "Cardano preprod", engine status pill, Requests / Ledger switch | `health`, `healthError`, `config`, `stream`, `section`, `onSection` | props from `DashboardApp` | Engine connected / Verifier down / Engine degraded / Engine offline / Connecting; suffix "· ledger reconnecting" | `dashboard.test.ts` (indirect) | `role=status` pill; Segmented group "Section" |
| `Banners.tsx` | system banners: engine unreachable, fake payments, verifier stub, override, empty wallet | `health`, `healthError`, `config`, `demoBadges` | health, config, `VITE_DEMO_BADGES` | each chip conditional; hidden when none apply | `dashboard.test.ts` `:35` fake banners, `:44` none on real run, `:51` override, `:57` unreachable | text "Fake payments.", "Verifier stub.", "Operator override enabled.", "Engine not reachable." |
| `RequestForm.tsx` | new order: catalog selects, chain filter, multi-store, brand code, POST `/api/orders` | `catalog`, `brandToken`, `onBrandToken`, `onCreated`, `enabled`, `maxStores`, `fake`, `maxCreditsPerTask` | `POST /api/orders` (`X-Brand-Token`, `Idempotency-Key`); catalog props | disabled until ready; "Fake orders" note; "Orders are unavailable" note; credit ceiling copy; "Placing order…"; error alert | `form.test.ts` `:51` catalog-only, `:59` chain filter, `:70` posts ids, `:82` retained key on failure / 502 | labels "Brand access code", "Product", "Chain", "Stores"; `form.request-form` with 3 selects and no input or textarea; button "Place order" (exact); `/Fake orders/`; `/Price not yet quoted/`; `/1 store selected/`; `role=alert` |
| `OrderStatus.tsx` | one card per order; per-store status; link to timeline | `order`, `catalog`, `onOpenJob` | orders from `OrdersPanel` (`DashboardApp.tsx:153-187`) | per-store status pills; fake note; "outcome is uncertain" note for `SOKOSUMI_UNAVAILABLE` | `form.test.ts` `:104` per-store, `:125` independent delivery and refund | text "Store A", "Store B", "Waiting for Shelfie", "Settled", "Refunded", `/Fake order/`; button `/Timeline and report/` |
| `JobList.tsx` | requests list: All / Active / Done filter, rows, progress, relative time | `jobs`, `catalog`, `selectedId`, `onOpen`, `onNew` | `api.jobs` + `api.job` per id (`DashboardApp.tsx:37-41`) | filter; empty state with "New order"; rows; sr-only counts (`:70-72`) | `dashboard.test.ts:65` lists and opens | button `/Example Pale Ale 0.33 l/`; sr-only text `/Passed 0 of 1, open 1, failed 1/` |
| `JobDetail.tsx` | request detail: header, sentence, tiles, timeline with receipts, tasks, report, download | `jobId`, `catalog`, `ledger`, `onBack` | `api.job`, `api.payouts` (3 s), ledger props | loading; error; WITHHOLD text; report or "appears when decided"; "photo viewer is not built" note | `dashboard.test.ts:74` report and receipts as explorer links | text "Delivered.", "Waiting for a worker.", "PASS: price 2.49 EUR", "Verification payment", "Override" (`getAllByText`) |
| `LedgerView.tsx` | ledger table, sequence check, wallet tiles | `entries`, `status`, `health` | ledger stream and fallback (via `useLedger`), health props | "Sequence intact · N entries" or gap; reconnecting note; "No entries yet." | `dashboard.test.ts:119` table and merged stream | `role=table`; text "JOB_CREATED", "TASK_OPENED" (kind pills) |
| `OperatorTools.tsx` | collapsed `<details>` "Operator": token, Demo job, override (flag-gated) | `catalog`, `packId`, `enabledOverride`, `ledger`, `adminToken`, `onAdminToken`, `onCreated` | `POST /api/jobs`, `POST /api/admin/submissions/{id}/override` (`X-Admin-Token`) | summary; token field; buttons only with token; "Override is disabled" note | `dashboard.test.ts:132` (Demo job absent without token) | summary "Operator"; label "Operator token"; button "Demo job" |
| `Overview.tsx` | "Live overview" tiles when no request is selected | `jobs`, `health` | `jobs` (last 10 only, `DashboardApp.tsx:40`), health wallets | zero counts when no jobs; wallet tile when health loaded | none | heading "Live overview" (section label "Overview") |
| `TxChip.tsx` | hash chip: explorer link or "fake, no explorer page"; copy | `hash`, `explorerUrl` | `TxBaseContext` from `/api/config` | link / fake / copied | `dashboard.test.ts:74` (indirect) | link name "View on explorer"; button "Copy hash" |
| `Progress.tsx` | segment bar of passes (max 10 segments) + "p/k" text | `passed`, `needed` | none | capped at 10 | indirect | none |
| `model.ts` | label maps (`jobStatus`, `taskStatus`), filters, `jobSentence`, `describeJob`, `entriesForJob`, `receiptLabel` | n/a | catalog for names | n/a | indirect | labels "Open", "Verifying", "Delivered", "Withheld", "Refunded", "Rejected", "Cancelled"; sentences "Waiting for a worker.", "Delivered.", "Result withheld. Your fee is refunded." |
| `time.ts` | `relativeTime`, `useNow` (15 s tick) | n/a | `Date.now` | "just now", "N min ago", "N h ago", "N d ago" | none | none |

### 2.4 API surface used by the web app (`lib/api.ts`)

| Method | Endpoint | Caller (file:line) | Cadence |
|---|---|---|---|
| `config` | GET `/api/config` | `WorkerApp.tsx:77`, `DashboardApp.tsx:34` | once / 30 s |
| `health` | GET `/api/health` | `DashboardApp.tsx:35` | 3 s |
| `catalog` | GET `/api/catalog` | `DashboardApp.tsx:36` | 60 s |
| `tasks` | GET `/api/tasks?status=OPEN&lat&lon` | `lib/hooks.ts:161`, `:212` | load; reconcile 15 s (open) / 3 s |
| `tasksStreamUrl` | GET `/api/tasks/stream` (SSE) | `lib/hooks.ts:179` | stream |
| `claim` | POST `/api/tasks/{id}/claim` | `TaskDetail.tsx:44` | on tap |
| `revealChallenge` | POST `/api/claims/{id}/challenge` | `CameraSheet.tsx:74` | on camera open |
| `release` | POST `/api/claims/{id}/release` | `WorkerApp.tsx:93` | on give back |
| `submit` | POST `/api/tasks/{id}/submissions` | `CameraSheet.tsx:192` | on "Use photo" |
| `submission` | GET `/api/submissions/{id}` | `Result.tsx:152` | 2 s until settled |
| `createOrder` | POST `/api/orders` (`X-Brand-Token`, `Idempotency-Key`) | `RequestForm.tsx:48` | on submit |
| `orders` | GET `/api/orders` (`X-Brand-Token`) | `DashboardApp.tsx:161` | 3 s |
| `order` | GET `/api/orders/{id}` | `DashboardApp.tsx:163` | when selected id is not in list |
| `jobs` / `job` | GET `/api/jobs`, `/api/jobs/{id}` | `DashboardApp.tsx:38`, `:40`; `JobDetail.tsx:59` | 3 s |
| `payouts` | GET `/api/payouts?jobId` | `JobDetail.tsx:60` | 3 s |
| `ledger` | GET `/api/ledger?afterSeq&limit=200` | `lib/hooks.ts:251`, `:280` | load; 3 s while stream not open |
| `ledgerStreamUrl` | GET `/api/ledger/stream` (SSE) | `lib/hooks.ts:257` | stream |
| `createJob` | POST `/api/jobs` (`X-Admin-Token`) | `OperatorTools.tsx:28` | on Demo job |
| `override` | POST `/api/admin/submissions/{id}/override` (`X-Admin-Token`) | `OperatorTools.tsx:48` | on override; body reason fixed at `api.ts:210` |
| `decision` | GET `/api/jobs/{id}/decision` | **no caller** | n/a (dead in web) |

`locationQuery` (`api.ts:259-266`) puts `lat` and `lon` (2-decimal coarse, `lib/geo.ts:44-46`) in the URL query string.

## 3. Styling

### 3.1 Files

| File | Lines | Loaded by | Scope |
|---|---|---|---|
| `styles/tokens.css` | 77 | `main.tsx:6` | `:root` variables, dark overrides in one `@media` block |
| `styles/components.css` | 1289 | `main.tsx:7` | shared components, worker screens, `.app-dashboard` (`:514-520`), dead `.dash*` rules (`:521-541`), `.status-line` (`:557`, unused) |
| `styles/dashboard.css` | 692 | `DashboardApp.tsx:6` | `.dsh` / `.dgrid` scoped, but **global**: `App.tsx:3` imports `DashboardApp` statically, so the file also loads on `/w`. Unscoped examples: `.dcard` (`:215`), `.jlist` (`:322`), `.tiles` (`:419`), `.tasks li` (`:554`), `.operator` (`:682`) |
| `styles/README.md` | 15 | not loaded | note for the dashboard agent; lists "new" tokens |

Vite bundles `main.tsx` CSS globally; there are no CSS modules.

### 3.2 Tokens (`styles/tokens.css`)

| Token | Light | Dark (`:51-76`) |
|---|---|---|
| `--bg` | `#f5f5f7` | `#000000` |
| `--surface` / `--surface-2` | `#ffffff` / `#f0f0f3` | `#1c1c1e` / `#2c2c2e` |
| `--text` / `--text-2` | `#1d1d1f` / `#6e6e73` | `#f5f5f7` / `#a1a1a6` |
| `--separator` | `#d2d2d7` | `#38383a` |
| `--accent` / `--accent-fill` | `#0066cc` / `#0066cc` | `#2997ff` / `#0071e3` |
| `--success-text` / `--success-bg` | `#1b7a31` / `#e6f4ea` | `#6ee787` / `#1b3a24` |
| `--warning-text` / `--warning-bg` | `#8a5300` / `#fff3d6` | `#ffd479` / `#3d2e0a` |
| `--error-text` / `--error-bg` | `#b3261e` / `#fce8e6` | `#ff9c96` / `#4a1f1c` |
| `--camera-chrome` | `#000000` | same |
| `--accent-soft` / `--accent-soft-text` | `#e8f1fb` / `#004c99` | `#0f2a44` / `#8ec5ff` |
| `--frame-bg` | `#e4e4ea` | `#101012` |
| `--card-line` | `rgba(0,0,0,.06)` | `rgba(255,255,255,.08)` |
| `--skeleton-a` / `--skeleton-b` | `#ececf0` / `#f6f6f8` | `#26262a` / `#323237` |
| `--scrim` | `rgba(0,0,0,.4)` | same |
| `--shadow-float` / `--shadow-card` / `--shadow-frame` | `0 8px 32px .16` / two-layer / `0 24px 64px .14` | `none` / `none` / `0 0 0 1px #2a2a2d` |
| `--app-width` | `430px` | same |
| Spacing `--s-1..--s-7` | 4, 8, 16, 24, 32, 48, 64 px | same |
| Radii `--r-control`, `--r-group`, `--r-sheet`, `--r-thumb` | 12, 16, 24, 8 px | same (`--r-thumb` unused) |
| `--font` | system stack (`tokens.css:43-45`) | same |
| `--mono` | `ui-monospace, "SF Mono", Menlo, monospace` | same |
| `--base-size` | `100%` (overridden to 125% in stage) | same |
| `--ease` | `cubic-bezier(0.2,0.8,0.2,1)` | same |

Light values equal `diseno/ui-design.md` section 2.1 (checked). Not in that doc: `--accent-soft*`, `--card-line`, `--frame-bg`, `--skeleton-*`, `--app-width`, `--shadow-card`, `--shadow-frame`.

### 3.3 Dark mode

- Only `@media (prefers-color-scheme: dark)` (`tokens.css:51`). No toggle, no `data-theme`, no stored preference.
- `color-scheme: light dark` on `:root` (`tokens.css:3`).
- `index.html:7-8` sets `theme-color` `#F5F5F7` (light) and `#000000` (dark), matching the blue-era tokens.
- `diseno/ui-design.md:19` says "no manual toggle in the MVP, decide Friday". A selector needs a decision (ADR or minor impact, see AGENTS.md).

### 3.4 Class naming

- kebab-case, component-element names: `task-card`, `task-main`, `jrow-side`, `order-stores`.
- State as modifier classes: `selected`, `leaving`, `warn`, `pill-success`, `button-primary`, `text-button destructive`, `dstatus-ok`.
- Dashboard prefixes: `dsh` (root), `dhead`, `dbrand`, `dstatus`, `dbanner`, `dgrid`, `dcol-*`, `dcard`, `dform`, `dback`, `dsub`, `dh1..dh3`, `dlist`; `jlist` / `jrow`, `tline` / `tstep` / `tmark`, `txc*`.
- Utility: `.sr-only`. No CSS framework.
- Tests use two classes: `.task-reward-amount` (`feed.test.ts:39`) and `form.request-form` (`form.test.ts:53`).

### 3.5 Fonts

- System stack only (`tokens.css:43-46`). No `@font-face`, no `url(` in `styles/` (grep). Matches `ui-design.md:44`.
- Monospace only for codes and hashes (`--mono`).

### 3.6 Logo

- `Wordmark` (`ui/index.tsx:389-401`): inline SVG shelf mark with `--accent-fill` background, plus text "Shelfie".
- Dashboard header: CSS-only `.dlogo` (`Header.tsx:36`, `dashboard.css:35-57`).
- Approved logo D (`docs/design-implementation-2026-10-30/01_branding/logo_D_approved_original.png`) is **not referenced** anywhere in `apps/web` (grep for `logo_D` and `01_branding`: no hits).
- `public/story/shelfie-logo.webp` is used by the story page; not compared with logo D (unverified).

### 3.7 CSP and headers

| Source | Value |
|---|---|
| `codigo/vercel.json` (headers block, CSP line 25-26) | `default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` |
| `codigo/apps/engine/src/http/security.ts:12-13` | same string (second copy) |
| `vercel.json` (same block) | `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`; `Referrer-Policy: no-referrer`; HSTS |
| `index.html` | no CSP meta; `referrer` meta `no-referrer` (`:9`) |
| `vite.config.ts` | `/api` proxy only; no CSP plugin |

- No `font-src`, `img-src` or `connect-src` beyond `'self'`, `data:` and `blob:`. No external fonts, scripts or images (README line 22 states the same).
- No `style={{` literal in `apps/web/src` (grep). Inline styles would break `style-src 'self'`.
- CSP is in two places (vercel.json and engine). `security.sec.test.ts:105` in the engine checks the header. Any map provider or library needs `img-src` / `connect-src` (and possibly `worker-src`) changes in both, plus security review (`diseno/security.md`).

## 4. Mockup-to-source mapping (approved board)

Board: `00_reference/APPROVED_DIRECTION_BOARD.png`. Worker panels 1-5 (Home, Map, Tasks, Wallet, Profile); dashboard large panel (Overview) plus panels 2-5 (Tasks, Workers, Analytics, Locations). All numbers below are from the image, not from data.

### 4.1 Worker

| Board panel | Backed by today | Real data available | Invented in the image | Class |
|---|---|---|---|---|
| 1 Home: greeting "John", Level 4 320/500 XP, Today's Earnings €28.50 (3 tasks), Next Task card with Start, Quick Actions Scan / Tasks / Map / Rewards | `WorkerApp` feed; `Feed.tsx` list and count (`:39`); `AppHeader.tsx` | local name (`storage.ts` profile); first OPEN task; open count; tADA via `formatAda` | Level / XP; today's earnings; "3 completed"; Scan; Rewards; avatar | A + B (greeting, next task, count); C earnings; D level/XP, scan, rewards |
| 2 Map: € pins, distance chips, filter chips (All, 3 km, >€3, High Priority), bottom card with "Accept Task" | none. No map code or dependency. Task list has no coordinates (`packages/core/src/api.ts:234-241`); public catalog omits lat/lon (`packages/core/src/catalog.ts:35-52`) | OPEN tasks (no geo); public store name and address; coarse city location (`lib/geo.ts:48-55`) | pins, prices on the map, distances (800 m etc.), "3 km", ">€3", "High Priority" filters; "Accept Task" (real flow: "Take this task" with location check) | C: needs approved store-position contract, tile provider, CSP change, attribution; `ui-design.md:136` says "no map" for W1 |
| 3 Tasks: My Tasks, Active (2) / Completed, cards with distance and €, "Recommended for you" | `Feed.tsx` (available), `Claimed.tsx` (one active claim, in memory), `TaskDetail.tsx` | available tasks; at most one active claim, held only in memory | "Active (2)" count; Completed tab; distances; recommendations; task types ("Take product photos", "Verify promotion") | B for available + current claim (A layout); C Completed (no history API); D Recommended |
| 4 Wallet: Balance €128.50, Total earned €482.30, This month €156.80, Recent Activity "+ € 4.50", Weekly bonus | `Result.tsx` payout state and `TxLink` for the current submission only; `AppHeader.tsx` payout chip; `Onboarding.tsx` address | payout address (local); per-submission payout state and explorer link (result screen only); no balance or history endpoint | every € amount; "Balance"; totals; activity rows; bonus | B for address and current payout status (session only); C balance and history (new read API); D bonus and any EUR |
| 5 Profile: avatar, "John Doe", Level 4 XP, 84 Tasks / 4.8 Rating / 12 Weeks, Achievements, Statistics, Payment Methods, Help & Support, Settings | `Onboarding.tsx` (edit name, address, consent) via `AppHeader` user button (`AppHeader.tsx:53-60`) | local name, payout address, consent version | avatar, level, XP, achievements, the three stats, Statistics page, help centre | A (layout; initials fallback from local name; "Payment Methods" = address edit; theme selector); C stats (persisted history); D rating, level, achievements |

### 4.2 Dashboard

| Board panel | Backed by today | Real data available | Invented in the image | Class |
|---|---|---|---|---|
| Overview: sidebar (Overview, Tasks, Workers, Locations, Payments, Messages, Settings); KPI cards 124 Active Tasks +12%, 38 Active Workers +8%, €1,284 Total Spend +15%, 4.7 Avg Rating +0.3; Active Tasks map; Recent Activity | `Overview.tsx` (four tiles); `Header.tsx` (two sections only); `Banners.tsx`; `JobList.tsx` | active and delivered counts over the 10 most recent jobs (`DashboardApp.tsx:40`); payout wallet (tADA, health); ledger events | every delta; workers count; rating; euro spend; map; Messages, Workers, Payments as sections | A (structure); B (counts, wallet, recent ledger events, with coverage text); C map and spend (`LedgerEventSchema` has no amount, `packages/core/src/entities.ts:251-262`); D deltas, workers, messages |
| 2 Tasks: "Create Task", filters All / Active / Completed / Drafts, table Task / Location / Reward / Status / Assigned to | `JobList.tsx` (All / Active / Done), `RequestForm.tsx` ("New order"), `OrderStatus.tsx`, `JobDetail.tsx` | product and store names via catalog (`model.ts:97-111`); job state; passed / k; task `payoutAmount` only if present in `spec` (unverified) | "Drafts" filter; "Assigned to" column (`JobViewSchema`, `api.ts:139-158`, has no worker field); "Create Task" wording (real action is "New order"); euro reward | A (table, labels: "Requests", "New order"); B (columns from `JobView`); D (Drafts, Assigned to) |
| 3 Workers: "Invite Worker", rating, tasks, Online / Offline, joined | none | none (no worker directory, no presence, no worker id in `JobView`) | everything on the panel | D |
| 4 Analytics: date range "Oct 1 - Oct 31, 2024", €1,284, 486 completed, 4.7 rating, 38 workers, Task Completion line chart, Tasks by Category bars | none (`Overview.tsx` is the nearest) | counts over 10 jobs; no time series; no category; no amounts in ledger | all numbers, charts, categories, date range, rating | D for charts, categories, date range, rating; B only for a small summary of loaded jobs with a coverage line |
| 5 Locations: "Add Location", table Name / Address / Active Tasks / Workers, store rows | `RequestForm.tsx` store list (catalog ids); `model.ts` `describeJob` | public catalog: id, name, chain, address, aliases (`catalog.ts:40-50`); job counts per store derived from job specs | "Add Location" (store CRUD, out of scope); workers per location; street addresses in the image (not the catalog's) | B for a read-only store table with job counts (Munich only); C map pins (no public coordinates); D "Add Location", workers |

### 4.3 Global

| Item | Today | Class |
|---|---|---|
| Palette `#0B2E1F`, `#2E7D32`, `#6BAF5B`, `#CFE7C1`, `#F5EFE3`; cream and forest green | `tokens.css` is Apple blue (`#0066cc`); `ui-design.md:23` says one blue accent | A (tokens), but a change to the canonical design doc needs the governance route (AGENTS.md) |
| Logo D | not used; generic `Wordmark` and `.dlogo` | A (asset swap in `Wordmark` and `Header`); needs approved SVG or PNG handling (board note says the PNG is not a vector) |
| Gamification: level, XP, streaks, bonuses | none in code | D (prompts: no XP without a persistent rule) |

### 4.4 Invented in the image (do not implement)

Names and people (John Doe, Maria Santos, Carlos Mendoza, Ana Ruiz, Lukas Weber); avatars; euro amounts (€28.50, €128.50, €482.30, €156.80, €1,284, every task reward); ratings (4.7, 4.8); XP and levels; trends (+12%, +8%, +15%, +0.3, +€10.00 bonus); worker counts (38, 84, 12 weeks); task counts (124, 486); store addresses; map pins and distances; "Verify promotion" and similar task types; "Weekly bonus"; "Add Location"; "Invite Worker"; "Messages".

## 5. Invariants to keep

| ID | Invariant | Enforced in | Test that proves it |
|---|---|---|---|
| I-1 | Payout address must parse as a preprod address before Continue; consent required | `Onboarding.tsx:19-24`, `:63-69` | `camera.test.ts` "starts at onboarding with consent text and a validated address" (`:252`) |
| I-2 | Without consent the claim button is disabled (browse only) | `TaskDetail.tsx:100-109` | `claim.test.ts` "keeps the button disabled until the privacy text is accepted" (`:92`) |
| I-3 | Claim sends coarse location, payout address and worker id | `TaskDetail.tsx:34-50` | `claim.test.ts` "claims with coarse location, the payout address and a worker id" (`:42`) |
| I-4 | 409 `task_not_open` shows "Another worker was faster." and returns to feed | `TaskDetail.tsx:54-55`; `WorkerApp.tsx:146-149` | `claim.test.ts` "says another worker was faster on 409 task_not_open" (`:52`) |
| I-5 | Wrong city, location denied and location-required messages | `lib/messages.ts:14-35` | `claim.test.ts` `:61`, `:72` |
| I-6 | A task leaves the list on `task_closed` (leaving state, then removed after 220 ms) | `lib/hooks.ts:98-103`, `:187-193` | `feed.test.ts` "removes a task when task_closed arrives" (`:43`); reducer "marks a closed task as leaving, then removes it" (`:120`) |
| I-7 | New tasks wait in a pill while scrolled; flush merges them | `lib/hooks.ts:87-96`, `:221`; `Feed.tsx:74-78` | `feed.test.ts` "buffers new tasks while the list is scrolled and merges them on flush" (`:111`) |
| I-8 | Feed polls every 3 s while the stream is not open, reconciles every 15 s when open | `lib/hooks.ts:204-219` | `feed.test.ts` "re-reads the list periodically even when SSE reports open" (`:143`) |
| I-9 | SSE reconnects with backoff and reports status | `lib/sse.ts:34-78` | `api.test.ts` "reconnects after an error and reports status" (`:57`) |
| I-10 | Gesture hand sign is never shown before the camera opens; reveal is idempotent; shutter disabled until revealed | `CameraSheet.tsx:70-98`, `:331-333`; `Claimed.tsx:29-35` (instruction only) | `camera.test.ts` "reveals the hand sign on open and enables the shutter only then" (`:171`); "keeps the shutter disabled while the sign is not revealed" (`:198`); `queryByText("K7Q-4XM")` null (`:194`) |
| I-11 | No file input anywhere in the worker app or the order form | `CameraSheet.tsx` (no input); `RequestForm.tsx` | `camera.test.ts` `:22-23` helper, "has no file input anywhere in a secure context either" (`:59`), "never renders a file input across onboarding, feed and claimed screens" (`:226`); `form.test.ts:57` |
| I-12 | Without a secure context: read-only notice, no shutter, no upload | `CameraSheet.tsx:226-241` | `camera.test.ts` "shows the read-only notice without a secure context and offers no upload" (`:52`) |
| I-13 | Shutter disabled when location is off | `CameraSheet.tsx:331-333` | `camera.test.ts` "disables the shutter when location is off" (`:73`) |
| I-14 | Blocked camera shows a plain message | `lib/messages.ts:70-71`; `CameraSheet.tsx:116-118` | `camera.test.ts` "explains a blocked camera" (`:83`) |
| I-15 | Location refusal keeps the sheet open, with the distance | `CameraSheet.tsx:216-218` | `camera.test.ts` "keeps the sheet open with the distance when the location precheck fails" (`:141`) |
| I-16 | Capture sends `captureMode: getUserMedia`, location and outcome | `CameraSheet.tsx:192-206`; `lib/camera.ts` (HD constraints `:34-38`) | `camera.test.ts` "submits a live capture with location and captureMode getUserMedia" (`:92`); "asks for an HD rear camera" (`:268`) |
| I-17 | Out-of-stock flow sends `OUT_OF_STOCK` | `CameraSheet.tsx:39`, `:224`; `WorkerApp.tsx:160` | `camera.test.ts` "sends outcome OUT_OF_STOCK from the empty-spot flow" (`:116`) |
| I-18 | Verdict: PASS shows price read, payout and explorer link; payout in flight uses neutral wording; OOS wording; FAIL reason and retry; queue position; polling stops only when settled | `Result.tsx:11-16`, `:75-137`, `:150-158` | `verdict.test.ts` `:24`, `:36`, `:42`, `:50`, `:58`, `:63`, `:70` |
| I-19 | Dashboard catalog-only selects; brand code in memory (`type=password`); idempotency key reused for the same body | `RequestForm.tsx:20-26`, `:45`, `:70-76`, `:84-119` | `form.test.ts` `:51`, `:59`, `:70`, `:82` |
| I-20 | Multi-store order shows each store and its own status and delivery or refund | `OrderStatus.tsx:47-75` | `form.test.ts` `:104`, `:125` |
| I-21 | Fake, verifier-stub, override and unreachable banners are shown when active and hidden on a real run | `Banners.tsx:25-61` | `dashboard.test.ts` `:35`, `:44`, `:51`, `:57` |
| I-22 | Operator tools are in a collapsed section and need a token; no Demo job without token | `OperatorTools.tsx:63`, `:73` | `dashboard.test.ts` "places a customer order ...; operator controls require a token" (`:132`, asserts `:163`) |
| I-23 | Ledger is a real table with streamed merge | `LedgerView.tsx:78-112`; `hooks.ts:226-230` | `dashboard.test.ts` "renders entries as a real table and merges streamed entries" (`:119`) |
| I-24 | Job detail shows report and receipts as explorer links; sentence for decided and open jobs | `JobDetail.tsx:101-199`, `model.ts:69-94` | `dashboard.test.ts` "job detail: decided job shows the report and receipts as explorer links" (`:74`) |
| I-25 | Token never in localStorage, URL or logs | `DashboardApp.tsx:27-29`; `lib/storage.ts` holds only worker data | none automated (grep only); add a test before redesign |

## 6. Risks and surprises

### 6.1 Test coupling (copy and selectors the redesign must keep, or update the tests in the same commit)

- **R1 Stale copy is asserted.** `verdict.test.ts:55` asserts the exact text "Try again (new code)" (`Result.tsx:132`). ADR-19 uses hand signs, not codes. `ui-design.md:144` has the same text. Changing copy means changing the test and the design doc.
- **R2 Hard-coded handwritten steps.** `TaskDetail.tsx:12-17` ("Write the code on paper", "Hold it next to the price tag") render in gesture mode too. No test covers them.
- **R3 Testid `challenge-code` only in handwritten mode.** `camera.test.ts:245-246` expects it through `WorkerApp`, using `claimFixture` (`testing.ts:40-49`, mode `handwritten`). The gesture path has `gesture-intro` (`Claimed.tsx:32`), which no test asserts.
- **R4 Exact labels and roles.** Form labels "Brand access code", "Product", "Chain", "Stores" (`form.test.ts:43-67`); button "Take this task", "Take photo", "Use photo", "Place order", "Continue", "Allow location", "Ledger"; heading "Verified" (`verdict.test.ts:26`); `role=table` (`dashboard.test.ts:125`); single checkbox (`camera.test.ts:261`). Wrapped `<label>` around `Stores` is needed for `getByLabelText`.
- **R5 Class selectors.** `.task-reward-amount` (`feed.test.ts:39`); `form.request-form` with exactly 3 selects and no input or textarea (`form.test.ts:53-55`).
- **R6 Exact sentences.** `/Passed 0 of 1, open 1, failed 1/` (sr-only, `JobList.tsx:71`); "Waiting for a worker." (`model.ts:92`); "Delivered." (`model.ts:76`); "2.49 EUR" and "PASS: price 2.49 EUR" (fixtures); "Show the shelf label and the empty space above it." (`camera.test.ts:128`, OBSERVED path only).
- **R7 Gesture aria-label.** `camera.test.ts:187` expects `Hold up 3 fingers to the left of the price tag` (`camera.test.ts:186-187`; `CameraSheet.tsx:355`).

### 6.2 Behaviour traps for restyling and navigation

- **R8 A bottom nav that replaces the screen loses the claim.** `claimed` holds the claim in the screen union (`WorkerApp.tsx:31`). Switching to Wallet or Profile from `claimed` or the camera drops it from the UI while the server claim lives on. The nav must hide during `claimed`, or the claim must move outside `screen`.
- **R9 Feed remounts every return.** `Feed` is unmounted on every screen change (`WorkerApp.tsx:124-135`), so the stream reconnects and the list reloads each time. A redesign that keeps Feed mounted changes this. Test both.
- **R10 Onboarding is also "edit profile" and has no back button.** `AppHeader.tsx:56` and `WorkerApp.tsx:132` route to onboarding. `Onboarding.tsx` has no `NavBar`. Decline there calls `clearConsent` (`WorkerApp.tsx:116-120`), which revokes consent and drops the user to a read-only feed.
- **R11 Inferred: reveal may re-POST on every WorkerApp render.** The reveal effect depends on `onClaimLost` (`CameraSheet.tsx:89`), and WorkerApp passes an inline arrow (`WorkerApp.tsx:179-183`). Each WorkerApp re-render while the sheet is open therefore re-runs `revealChallenge`. The server is idempotent, so it is harmless, but it adds traffic. Verify in the browser with a request count before the redesign adds more parent state.
- **R12 Countdown `onExpire` identity.** `Countdown` resets its `expired` ref whenever its effect re-runs (`ui/index.tsx:328-341`), and `Claimed` passes an inline callback (`WorkerApp.tsx:162-166`). A parent re-render after expiry could fire `onExpire` twice. Low impact; verify.
- **R13 Overview totals cover 10 jobs.** `DashboardApp.tsx:40` slices to 10; `Overview.tsx:250-269` labels "Active requests", "Delivered" and "Verified photos" as if complete. Label the coverage or fetch more.
- **R14 "Refunded" stated before it is observed.** `model.ts:79` says "Result withheld. Your fee is refunded." for WITHHELD and REFUNDED, and `JobDetail.tsx:179` repeats it. Whether a refund has been issued is not checked here (engine state machine not read in this phase; unverified).
- **R15 Result: UNKNOWN stops polling.** `TERMINAL_PAYOUT` includes `UNKNOWN` (`Result.tsx:9`), so polling stops and the screen says "Payment pending" (`:45`) with no later update. The spec wants UNKNOWN shown as reconciliation, not confirmed; a later CONFIRMED is never picked up without a reload.
- **R16 EUR fallback.** `Result.tsx:32` defaults the currency to "EUR" when the verifier omits it. Shelf-tag prices are euros, so this may be correct, but the default hides a missing field (see the no-EUR rule for wallets).
- **R17 Payout label shows the reward before payment.** `Result.tsx:91-97` labels the task reward "Payout" while the status row (`:98-101`) may still say "Payment pending".
- **R18 Polling load.** `DashboardApp.tsx:37-41` re-reads 10 jobs every 3 s; `JobDetail.tsx:59-60` polls two endpoints every 3 s with no stop; `OrdersPanel` polls every 3 s; `useLedger` polls while the stream is not open. Any new panel adds to this.
- **R19 Dashboard CSS is global.** `dashboard.css` loads on `/w` too (`App.tsx:3`). A new global class in `components.css` can collide with `dcard`, `jrow`, `tiles`, `tasks li`, `operator`.

### 6.3 Governance and drift

- **R20 Canonical design conflicts with the approved board.** `ui-design.md:23` (blue accent only), `:136` (W1: "no cards, no avatars, no map"), `:19` (no manual theme toggle in MVP), `:152` (stage hides operator controls). Changing these needs an ADR or a declared minor impact (AGENTS.md "Context gate" point 4). AGENTS.md lists `diseno/**` as a governed path, so both files are covered.
- **R21 Consent text is versioned.** `lib/messages.ts:75-76` describes the vision provider and retention. Editing it without bumping `consent-v1` (`messages.ts:74`, `storage.ts` key `shelfie.consent`) leaves existing users consented to the old text.
- **R22 Map and CSP.** Coordinates would have to be public (not in `TaskListItemSchema` or the public catalog, `catalog.ts:35-52`). The map needs CSP changes in two places (section 3.7) and security review. `locationQuery` (`api.ts:259-266`) already sends coarse coordinates in URLs; precise coordinates must never go there.
- **R23 Hard-coded city.** Feed title "Tasks in Munich" (`messages.ts:62`), empty state (`:63`), `RequestForm.tsx:28` and `OperatorTools.tsx:21` filter `id === "munich"`. A map or locations view must not add a second city without a contract change.

### 6.4 Dead code and hygiene

- `.dash`, `.dash-list`, `.dash .screen`, `.dash[data-detail]`, `.dash-detail` in `components.css:521-541`: no TSX uses `dash`, `dash-list`, `dash-detail`, `data-detail` (grep).
- `.status-line` (`components.css:557`): no TSX use.
- `--r-thumb` (`tokens.css:41`): no `var(--r-thumb)` use.
- `navigate()` (`lib/router.ts:20-23`): no caller.
- `ApiClient.decision` (`lib/api.ts:221-227`): no caller.
- `Overview.tsx` `Live overview`: not covered by tests.
- Comment mismatch: `DashboardApp.tsx:23` says list-detail from 1024 px; `dashboard.css:174` switches at 1100 px.
- `Onboarding.tsx:37` TODO (CIP-30) is unverified ("verify Friday").

### 6.5 Coverage gaps (no test today)

- Stage mode (`?stage`), routing between `/w` and `/dashboard`, `appForPath`.
- `formatAda` and `minutesLeft` (`lib/format.ts`).
- Banners: low-balance (empty wallet) branch.
- Ledger sequence gap (`LedgerView.tsx:29-37`).
- Give-back flow (`WorkerApp.tsx:90-100`), claim expiry, `Countdown`.
- Sheet Escape key (`ui/index.tsx:261-264`).
- Connection status pill text; `Header` states.
- `Result` for UNKNOWN and FAILED_FINAL payout states.
- Theme (no tests).
- Test count in `apps/web/src`: 57 `it` blocks (grep count; not run).

### 6.6 Not verified in this phase

- Tests were not run; the 57-test count is from grep.
- No browser run: R11, R12, R9 are read from code.
- Engine state machine for refunds (R14) and payout states (R15) not read.
- `task.payoutAmount` inside `JobView.tasks[].spec` (Tasks table reward) is not confirmed.
- The `story/` page and `public/story/shelfie-logo.webp` were not compared with logo D.
- Gesture timing (answer window) and real-phone camera behaviour are for Phase 1 QA.
