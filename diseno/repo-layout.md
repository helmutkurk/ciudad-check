# Repo layout, conventions, tests, milestones

The Git repository root contains this design and the implemented npm monorepo in
`codigo/`. Current operation is in [STATE](../docs/STATE.md) and ADR-0008.
The planned layout and milestone dates below record the hackathon build; they are
not current deployment instructions. No new Git repository is needed in `codigo/`.

## 1. Layout

```
codigo/
  package.json              npm workspaces: apps/*, packages/*, eval
  tsconfig.base.json        strict, shared
  eslint.config.js          one config for all TS
  .prettierrc
  .env.example              names only, per component also in each app
  .gitignore                .env*, *.jsonl runtime files, evidence/images, node_modules
  README.md                 what it is, how to run, links to evidence (owner D)
  apps/
    shell/                  JS. Fork of masumi-network/tum-hackathon-quickstart (pin the commit in the runbook)
    engine/                 TS. Express. From scratch, reuses package patterns of x402-express (tsx, dotenv)
    verifier/               TS. From cardano-foundation x402-express template (seller.ts becomes our server)
    web/                    TS. Vite + React. Routes /w (worker, mobile first) and /dashboard (stage layout)
  packages/
    core/                   types, zod schemas, ids, state machine tables, error codes
    payments/               wallet signers, x402 buyer (from the template buyer.ts), payout queue, adapters, fakes
    evidence/               hash-chained ledger writer/reader, explorer URL helpers
    vision/                 VisionClient interface, provider adapters, JSON repair
    domain-shelf/           pack.config.json, rules.ts, prompts, report template, ui labels
    domain-letter/          Plan B pack (created only if the pivot happens)
  eval/                     labels.json, photos (not committed if large), runner, results/
  scripts/                  setup-wallets, fund-check, hub-up (starts engine, verifier, shell, tunnel), smoke
  docs/
    design/                 copy of this folder
    verified.md             answers to every "verify Friday"
    evidence/               tx-hashes.md, screenshots/, ledger snapshots, README with the evidence index
```

## 2. Ownership

Roles A-D as in the team plan. People: A Isabel (`mariaisabel16`), B Fernando (`Fmayo444`), C Lorenz (`04Lenz04`), D Helmut (`helmutkurk`); see `scripts/team.conf`. Pairs (Helmut, 2026-10-29): A+B and C+D; a pair reviews each other's commits first in peer review. Extras outside this table (bots, helper scripts) go in the owner's folder or `codigo/tools/<name>/` and are registered in `equipo/components.md`. Each folder has one owner (who knows the area); ownership blocks nothing (ADR-0006): others may edit it and the owner's agent sees it in peer review.

| Folder | Owner | Starts from |
|---|---|---|
| `apps/shell` | A | `tum-hackathon-quickstart` (fork, minimal diff; only the bridge file and env additions) |
| `apps/engine` | A | scratch; uses `packages/*` |
| `packages/core` | A | scratch; **shared contract**: any change is announced in chat, checked by the consumer owner's agent in peer review, and mirrored in contracts.md the same commit |
| `packages/payments` | B | x402-express `buyer.ts` and `wallet.ts` patterns; Cardano SDK from the template (`@evolution-sdk/evolution` pinned by the template) for transfers (verify Friday) |
| `apps/verifier` (x402 wrapper, idempotency cache, routes) | B | x402-express `seller.ts` |
| `apps/verifier` gate call (`evaluate`) and `packages/domain-shelf`, `packages/vision`, `eval/` | C | scratch |
| `apps/web`, `packages/evidence`, `docs/evidence`, root `README.md`, pitch assets | D | scratch (Vite React TS template) |
| `scripts/` | B (wallets, funding, tunnel) with A (hub-up) | scratch |
| Masumi Payment Service (outside the repo, run from its own clone) | B | `masumi-payment-service` at the pinned commit |

Shared rule: the verifier route file has two owners by function. B owns everything up to the point where the handler calls `evaluate(...)`; C owns `evaluate` and below. They meet at one function signature (`evaluate(task, image) -> VerifyResponse`) defined in `packages/core`.

## 3. Conventions

- **TypeScript strict** (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`), ESM, Node 24 for everything (x402 needs 22 or higher, Masumi needs 24; one version avoids confusion). The shell stays JavaScript as in the starter; it is the only exception.
- **Dependencies**: pin exact versions from the x402 template (`@x402/*` 2.26.0, `@evolution-sdk/evolution` 0.5.14, `express` 4.x); do not bump during the event. Add dependencies sparingly; each needs a one-line reason in the commit message.
- **Lint and format**: ESLint (typescript-eslint recommended, `no-floating-promises`, `no-explicit-any` as error with escape comments), Prettier defaults with 100 columns. `npm run check` = typecheck + lint + test; run before every push.
- **Validation**: zod at every boundary (HTTP in, env, model output, file store load). No unvalidated JSON.
- **Errors**: one `AppError(code, message, status, details)` class; codes from `packages/core`.
- **Logging**: structured JSON lines with `jobId`, `taskId`, `submissionId`; never log mnemonics, tokens, API keys or image bytes.
- **Secrets**: only env files, throwaway wallets, never in the repo or in screenshots. A pre-commit grep for `MNEMONIC`, `API_KEY`, `addr_test1` private patterns is optional.
- **Time and IDs**: injectable clock and id generator (tests and demos).
- **Git**: ADR-0008 governs current maintenance: Helmut maintains `main` directly and keeps `dev` equal to it. GitHub protection stays active and team-controlled. See [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md). The event release process is historical.
- **Fakes first**: every component runs against fakes of its neighbours (`FAKE_PAYMENTS=1`, `VERIFIER_PAYMENT=off`, `VERIFIER_MODE=stub`, fake shell via `POST /api/jobs` from curl or the dashboard's "demo job" button). This is what lets four people work at once.

## 4. Test strategy per component

| Component | Unit | Integration | Manual / on-chain |
|---|---|---|---|
| `packages/core` | State machine tables (legal and illegal transitions), schema round-trips | - | - |
| `apps/engine` | Intake filter (unknown store, unknown product, wrong city, multi-store rejected), job decision (K rule with default k=n=1; keep K-of-N edge cases as pack-level unit tests so the roadmap extension stays safe), claim TTL and claim cutoff, soft city check at claim (wrong city, denied), atomic first-claim-wins (two concurrent claims, one winner; late claim `task_not_open`), capture-time location precheck (inside, outside, accuracy cap, stale fix, `LOCATION_MAX_TRIES`, no verifier call and no fee on failure), `captureMode` guard (`capture_mode_not_allowed`), ids-only job input (free text rejected), out-of-stock outcome (accepted counts toward K, same payout), attempts, challenge generator (alphabet, uniqueness), idempotent create | API tests against fakes: full happy path, rejected-then-retry, window expiry with no passing photo, intake rejection (no tasks, no payout), duplicate create, duplicate submit, two workers racing for one task (feed event `task_closed`), out-of-stock happy path and rejected out-of-stock (product present) | Click-through with the web app on the fakes |
| `packages/payments` | **Payout queue with fault injection**: timeout after send then reconcile finds tx -> exactly one payout; crash between write-ahead and hash; concurrent enqueue of the same task; insufficient funds pauses queue | Against preprod with tiny amounts: send, confirm, reconcile by metadata (if supported) | The M1 and M2 transactions |
| `apps/verifier` | `evaluate` gates with fixture extractions (every reason code, both gate sets: price photo and out-of-stock O3-O5), parsers (EUR formats, EAN checksum), token similarity | x402 flow with the buyer on preprod; idempotency (same key twice -> one model call); dry endpoint | The 20-photo run (eval) |
| `packages/vision` | JSON repair, schema enforcement, timeout handling with a fake HTTP server | One real call per adapter | 20-photo run |
| `apps/shell` | - | Bridge against a fake engine; withhold path leaves no hash | Smoke task on Sokosumi (M3), paid cycle (M4/M5) |
| `apps/web` | Component tests for the live feed (task disappears on `task_closed`), claim, camera sheet states (no secure context -> read-only notice, no file input anywhere in the DOM), location status, "Product not on the shelf" flow, brand request form (dropdowns only, no free text), verdict rendering from fixtures | - | Real phones on the tunnel: iOS Safari and Android Chrome; secure-context camera, geolocation accuracy at the venue, LAN HTTP read-only behaviour |
| Evidence | Hash chain verification, duplicate-event no-op | - | `verify-ledger` check before submission |

End-to-end smoke (`scripts/smoke`, Friday): create a demo job (one catalog store, one catalog product), submit a canned photo with a wrong code (assert FAIL, no payout, attempts left), then a valid one (assert PASS, exactly one payout, decision `DELIVER`); also an out-of-stock submission (assert PASS `OUT_OF_STOCK`, one payout, report says out of stock) on a second demo job, a submission far from the store (assert 422 `location_mismatch`, no verify tx), and one out-of-catalog job (assert 422 `intake_rejected`, no task). Re-run it against real components as they come online; it is also the pre-demo check ("go/no-go checklist").

## 5. Definition of done per milestone

Milestones M1-M6 keep the ladder and times of the team plan, re-mapped to Shelfie. Stop at any rung and still have a valid submission. Every milestone ends with its evidence saved to `docs/evidence/` (a line in `tx-hashes.md`: milestone, what, hash, explorer link, who captured it, screenshot filename).

### M1 - x402 paid request (Friday 11:30) - track qualified
- **Work (B):** x402-express seller and buyer run; one paid request on preprod.
- **Acceptance:** the buyer prints a receipt with a transaction hash; the hash opens on the preprod explorer showing the transfer from the buyer address to `W-SELL`; the amount equals the route price.
- **Evidence:** tx hash; screenshot of the explorer page; terminal screenshot of the receipt; wallet addresses (public) in `docs/evidence/wallets.md`; the Node and package versions used.
- **Also done by now (all roles):** repo created, `docs/verified.md` started with the SDK-transfer question, fakes skeletons in place so others can start.

### M2 - Agent pays agent, and agent pays human (Friday 15:00)
- **Work:** B: verifier route is our `POST /v1/verify` (price 1 tADA) and the engine's `VerifyClient` pays it with `fetchWithPayment` and a spend cap; payout queue sends one plain transfer from `W-PAY` to a teammate's address. C: `evaluate` with real vision on a few photos. A: engine API and state machines on fakes complete. D: worker page shows the live feed, claims and captures with the live camera against the engine on fakes (no gallery path).
- **Acceptance:** from the API, one canned submission produces: a verify tx (x402) with hash recorded on the verdict; a passing verdict that enqueues a payout; a payout tx confirmed on preprod; both hashes in the ledger and visible on the dashboard; a wrong-code photo produces FAIL with only the verify tx and no payout; a submission outside the store geofence is refused by the engine with no verify tx at all. Re-sending the same submission does not pay twice (idempotency demonstrated).
- **Evidence:** the 2 or 3 tx hashes with explorer screenshots; ledger excerpt; the first 20-photo evaluation report (even if rough).
- **Verify Friday gate:** if plain transfers from the SDK are not possible by 13:00, apply ADR-04 fallback and tell everyone.

### M3 - Hired via marketplace (Friday 13:00; unpaid)
- **Work (A):** starter forked, Coworker and worker running, an unpaid Sokosumi task reaches `COMPLETED` with a result produced through the bridge (engine on fakes is fine).
- **Acceptance:** the task is `COMPLETED` in the Personal Workspace with our report text; the bridge created the job idempotently from the task.
- **Evidence:** task id; screenshot of the completed task with the result.

### M4 - Paid escrow for a job (Friday 20:00)
- **Work (A, B):** Masumi Payment Service running, agent registered, paid task cycle with the real engine in the loop and a real (human) shot taken on the worker page.
- **Acceptance:** `sokosumi runtime receipt` shows `settled: true` with a tx hash; the settlement verified by the starter's check; the same job's ledger shows verify and payout tx hashes inside the window.
- **Evidence:** lock tx, settlement tx, task id, receipt JSON (private fields removed), screenshots; the cycle takes at least 60 min, so start it by 18:00.
- **Go/no-go at 22:00:** if not working, freeze M4 and demo M1-M3 and M6 with escrow as roadmap (as the team plan says).

### M5 - Pay only on result: withheld result and refund (Friday night, recorded)
- **Work (A, C):** a single-photo job (N=1, K=1) where no photo passes before the window closes (for example only wrong-code attempts, or no claim at all); the bridge withholds the result (no hash); wait for the buyer auto-refund. Optional second case: an intake-rejected job that was escrowed (verify Friday whether this is possible).
- **Acceptance:** engine decision `WITHHOLD` (reason `no_passing_photo`) and no worker payout in the ledger; no result hash was submitted; the escrow refund transaction appears on the explorer; job reaches `REFUNDED` through a settlement event.
- **Evidence:** job id, the dashboard screenshot of the withheld job, refund tx hash with screenshot, timing observed (to correct the estimates in the runbook).

### M6 - Front end and live ledger (Saturday 11:00)
- **Work (D):** worker page and dashboard on real data, built to `diseno/ui-design.md` (visual system, screens); stage layout; QR code to the worker page; verification spend, payouts and escrow status visible; every tx hash links to the explorer.
- **Acceptance:** on two real phones, a task shows up on two phones at once and disappears from the second when the first claims it; the winner (location prompt accepted; a worker outside Munich gets `wrong_city`) takes the photo with the live camera (no file picker anywhere), sees the location status at the shutter (a shot away from the store is refused with no verify tx), sees PASS or FAIL with reasons, and sees the payout hash; "Product not on the shelf" works end to end on the props shelf; the brand form offers only catalog dropdowns; the dashboard updates live within 3 s; the cheat attempt (live camera aimed at an old photo, or a wrong code) is rejected on screen; both pages work on iOS Safari and Android Chrome; the "fake" and "override" banners work.
- **Evidence:** screen recording of the full flow, screenshots of the dashboard with the ledger, the final `tx-hashes.md`.

### Release gates (Saturday)
- 13:00: last paid cycle started; code freeze after the final smoke run.
- 14:30: video of at most 2.5 min uploaded, repo public with the README and design folder, all tx hashes in the Devfolio description. Submit before 15:00.
- Pre-demo checklist (D reads it aloud): wallets funded, tunnel up and QR scanned, hub awake, `GET /api/health` green and no fakes, override off, ledger verified, cheat photos ready, stand-by recording of a perfect run.
