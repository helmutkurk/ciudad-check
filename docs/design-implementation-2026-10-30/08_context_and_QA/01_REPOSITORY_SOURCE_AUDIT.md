# Read-only snapshot of the actual repository (`dev`, 2026-10-30)

Source: https://github.com/helmutkurk/shelfie ; inspected via connected GitHub. This is only a **starting audit**; Claude must re-read current sources and changes, since collaborators are building rapidly. The repo, its `AGENTS.md`, accepted ADRs and code govern any discrepancies.

## Architecture and ownership

- `codigo/apps/web`: `@shelfie/web` Vite 8 + React 19 + strict TypeScript. Existing URLs `/w` and `/dashboard`, same-origin engine/API, real `@shelfie/core/browser` zod contracts, `@shelfie/evidence/explorer` tx links, `src/deps.tsx` injectable effects.
- `AGENTS.md`/`CLAUDE.md`, nested `codigo/CLAUDE.md`, `.claude/rules/web.md`, context acknowledgment hook, `scripts/task.sh`, peer-review, stage test and release procedures. User role D (Helmut), pairs C (Lorenz); payments B/Fernando, shell/engine/core A/Isabel. No bypass of collaboration rules.
- `diseno/` contains canonical behavior, visual guidelines, security and decisions; source behavior takes precedence over design mockup.

## Worker (`/w`)

| Actual component | Existing behavior | Important constraint |
|---|---|---|
| `WorkerApp.tsx` | Onboarding/feed/detail/claimed/camera/result state machine | Do not replace or strand claim state while adding bottom navigation |
| `Onboarding.tsx` | Local name, paste `addr_test1...` address, `consent-v1`, decline read-only | No genuine login/account history or CIP-30 connect yet |
| `Feed.tsx` / `useTaskFeed` | Coarse city location; real tasks SSE, reconnect, periodic fallback, new task pill | Preserve first-claim and task_closed handling |
| `TaskDetail.tsx` | Claim with location; amount/time/store/product | Some instructions still mention handwritten codes; adapt dynamically to gesture mode |
| `Claimed.tsx` | TTL, open camera, OOS, give task back | Sign remains secret until camera reveal |
| `CameraSheet.tsx` | Secure-context `getUserMedia`, server `revealChallenge`, fresh shutter-time GPS, submit, preview, OOS | NO gallery/file input for verification, no early gesture exposure |
| `Result.tsx` | Real async verifier state, retries, payout status/explorer | Do not declare payout confirmed prematurely |
| `lib/storage.ts` | Local worker id/profile/consent | Avoid local secrets or invented authenticated identity |

**Important accepted ADR-19:** Default challenge is a random 2–5 fingers plus side left/right of price tag. Actual challenge gets revealed when camera opens, via `POST /api/claims/{claimId}/challenge`; idempotent, server deadline, anti-replay checks. The user initially mentioned 1–5 in speech, but actual code/documentation currently says 2–5. Follow current code unless a separate approved change is requested. Earlier image versions showing gesture numbers openly in map/task cards are incorrect for the real security flow.

## Customer/operator dashboard (`/dashboard`)

| Actual component | Existing behavior | Important constraint |
|---|---|---|
| `DashboardApp.tsx` | jobs/new/job/ledger local UI views; real health, config, catalog, jobs, ledger, orders polling | No need to add every mockup nav item as route |
| `RequestForm.tsx` | Product catalog dropdown, chain store filter, store multi-select, `X-Brand-Token` memory only, limits, idempotency key | Must preserve; never allow arbitrary product or store free text |
| `OrderStatus.tsx` | Per-store statuses from real order API | Multi-store order maps to separate jobs |
| `JobList.tsx`/`JobDetail.tsx` | Real requests, timeline, verdict evidence and report | Preserve job report/status links |
| `LedgerView.tsx` | Append-only evidence, sequence, verification and payout wallets, explorer | No made-up tx or conflation of wallets |
| `OperatorTools.tsx` | Restricted admin/demo tools | Keep behind operator token and collapsed operator-only section |
| `Banners.tsx` | Engine, real/fake, override, wallet status | Never hide for prettier screenshots |
| `Header.tsx` | Network preprod / status / section tabs | Keep real connection status and projection stage |

## Current API / feature gaps relevant to mockups

- `TaskListItemSchema` has task/job id, storeName/storeAddress, productName, payoutAmount and windowEndsAt; **no lat/lon, no worker rating, no worker history, no avatar**.
- Server `CatalogStoreSchema` includes lat/lon, but `CatalogResponseSchema` for public `GET /api/catalog` **explicitly omits coordinates and price ranges**. Map needs an approved safe read-only data contract; a geocoding provider or random pins would not be justified.
- No general worker historical ledger API, no dedicated worker profile image service, no persisted ratings/reviews, no server notification inbox, no XP/level model. Don't use screenshot values as existing facts.
- Worker wallet: app has payout address and submission-related payout states, not a confirmed user wallet-balance read; employer verification/payout wallets are separate and in engine health. Don't display fake "Wallet €128.50"; transaction balances must be sourced honestly.
- Customer order API and protections already exist in ADR-20; real REST purchasing path is blocked/pending confirmation according to the last reviewed README, so disabled means disabled. Read active config / code to confirm current status.
- The product uses test ADA on Cardano preprod, Masumi escrow/Sokosumi ordering and x402 verification. Code path provenance and security matter more than sample visuals.

## Repo docs to read next

`AGENTS.md`, `CLAUDE.md`, `codigo/CLAUDE.md`, `.claude/rules/web.md`, `diseno/contracts.md`, `diseno/webapps.md`, `diseno/ui-design.md`, `diseno/decisions.md` ADRs 16/17/19/20, `diseno/security.md`, `diseno/repo-layout.md`, `codigo/apps/web/README.md`, `codigo/docs/verified.md`, `equipo/helmut.md`, `docs/ai-log.md`, `codigo/packages/core/src/api.ts`, `codigo/packages/core/src/catalog.ts`.
