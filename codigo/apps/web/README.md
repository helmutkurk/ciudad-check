# apps/web (@shelfie/web)

Status: implemented against the contracts, runs on the engine's fakes. Built with Vite 8, React 19 and TypeScript; tests with vitest and jsdom. Links point to the canonical design in `diseno/` at the repo root (one source of truth).

## Purpose
Both web apps in one project: the worker app (`/w`) and the customer dashboard (`/dashboard`). Same origin as the engine in production (the engine serves the build), so no CORS.

## Run
From `codigo/` (after `npm ci` there):
- `npm run dev -w @shelfie/web`: dev server on `http://127.0.0.1:5173`. `/api` is proxied to the engine at `VITE_ENGINE_URL` (default `http://127.0.0.1:4000`, or `http://127.0.0.1:$ENGINE_PORT`). The proxy sets `Origin` to the engine URL because the engine checks it on POST (security.md E9; verify Friday). Without an engine the dashboard shows "Engine not reachable".
- Phone on the same network: `npm run dev -w @shelfie/web -- --host` and open `http://<lan-ip>:5173/w`. Over plain HTTP the browser gives no camera (no secure context), so the camera sheet shows the read-only notice and the worker can read tasks but cannot take or submit a photo. For the camera, open the HTTPS tunnel URL of the engine (architecture.md "Hub and network").
- `npm run build -w @shelfie/web` (typecheck + `vite build` into `dist/`); `npm run preview -w @shelfie/web` serves it on `127.0.0.1:4173`.
- `npm test -w @shelfie/web` (50 tests; the root `npm test` runs them too). `npm run typecheck -w @shelfie/web`.
- Stage layout for the projector: `/dashboard?stage` (larger base size).

Env names (build-time, public by design; `.env.example` lists names only): `VITE_API_BASE` (empty = same origin), `VITE_DEMO_BADGES`; dev only: `VITE_ENGINE_URL` (contracts §5.5).

## What is built
- **Worker app `/w`** (mobile first, 360 px): W0 payout address, name and `consent-v1` (claim stays disabled until accepted; "Decline" leaves it read-only); W1 live feed (SSE `task_opened`/`task_closed`/`ping` with backoff reconnect and 3 s polling fallback; a task fades out on `task_closed`; new tasks wait behind a "N new tasks" pill when the list is scrolled); W2 task detail and claim (coarse location, `wrong_city`, `location_required`, "Another worker was faster."); W3 challenge code and countdown; W4 camera sheet (live `getUserMedia` only, **no file input anywhere**, read-only notice without a secure context, location status line, "Product not on the shelf" flow, preview with Retake/Use photo, location sent at the shutter); W5/W6/W6b verdict from `GET /api/submissions/{id}` (poll 2 s) with the plain-words reason, attempts left, payout state and explorer link.
- **Dashboard `/dashboard`**: banners (fake payments, verifier stub, operator override, engine unreachable, empty wallet), request form with native selects from `GET /api/catalog` (ids only, no free text), operator token field and "Demo job" button (token kept in memory only), job list with live counts, job detail (progress, tasks, verdicts and receipts from the ledger, report text and download), ledger table with live SSE and wallet balances. Customer routes beyond `/dashboard` are not in contracts.md, so views are component state, not routes.
- Typed API client (`src/lib/api.ts`): every response is parsed with the zod schema from `@shelfie/core`; errors become `AppError` with the stable code; `credentials: same-origin` is prepared for the deferred session cookie; today identity is still `workerId` in the body.
- Styles: CSS variables from `ui-design.md` (`src/styles/tokens.css`), system font stack, light theme only (no dark mode, no theme selector), no UI framework, no third-party fonts or scripts (CSP `default-src 'self'`).

## Layout
`src/lib` (api, sse, hooks, geo, camera, storage, format, messages), `src/ui` (shared components), `src/worker`, `src/dashboard`, `src/deps.tsx` (every side effect injectable: fetch, EventSource, clock, ids, geolocation, camera, storage), `src/testing.ts` (fixtures, fetch mock, fake EventSource).

## Known limits and verify Friday
- Web imports `@shelfie/core/browser` and `@shelfie/evidence/explorer`. Vite aliases/shims are removed; the browser dependency graph and production bundle are checked for Node imports and server secret env names. `addr_test1` stays in the bundle for payout address validation.
- `GET /api/jobs` returns jobs without counts, so the list reads each recent job once more (10 newest). No endpoint lists verdicts per job, so verdicts and receipts are derived from `GET /api/ledger` entries (`refs.jobId`/`refs.taskId`).
- The health payload has no `MIN_WALLET_LOVELACE`, so only an empty wallet raises the banner.
- `task_opened` payload shape (`{ task }` or the bare task) is accepted both ways; the session cookie vs `workerId` in the claim body (security.md E5 says derive it server-side; contracts.md still sends it).
- CIP-30 "Connect wallet" is not built (paste is the guaranteed path); active claim is not persisted across a reload.
- Real phones (iOS Safari, Android Chrome), 130 % text and a Lighthouse run are still to do (M6); no dark mode (decision 2026-10-30, light only). Screen recording and screenshots go to `docs/evidence/`.

## Interfaces
- [contracts.md section 1](../../../diseno/contracts.md) engine API, section 5.5 env names; behaviour in [webapps.md](../../../diseno/webapps.md), looks in [ui-design.md](../../../diseno/ui-design.md).

## Milestones
M2 worker page claims and uploads against fakes (Fri 15:00); M6 front end and live ledger (Sat 11:00).

## Do not
- Do not show a EUR amount next to a tADA amount as if equivalent.
- Do not build customer routes outside `contracts.md` without updating it.
- Do not add a file input, a gallery path or a third-party script; do not store photos or tokens in the browser.
- Do not commit `.env`.

## ADR-20 amendment (Helmut, 2026-10-30)

The customer orders from `/dashboard`, with product/chain dropdowns and a native store multi-select. The brand access code stays in React state only and is sent as `X-Brand-Token`; request selections get an idempotency key retained after transport failures. Orders poll every 3 s and open the existing job timeline/report per store. Demo and override tools are under a collapsed Operator disclosure and require the operator token. No separate `/brand` app. Prices remain explicitly unknown (credit ceilings are not quotes). Real buying is disabled pending B-15; the complete local fake flow needs engine-side `BRAND_TOKEN` and fake verifier/payments.
