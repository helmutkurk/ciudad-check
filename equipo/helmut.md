# Helmut - role D

- Role and pair: D, pair with Lorenz (C)
- GitHub: helmutkurk
- Reviews: pair reviews each other's commits first (peer review, `scripts/peer-review.sh`)

## Current focus

D-42: labelled 14 external WhatsApp shelf photos and added optional authenticated dry HTTP evaluation (Codex, 2026-10-31). Eval typecheck/lint and 89 offline tests pass (12 eval + 77 verifier regressions); all 14 images pass local G1 inspection. Live model run is for the orchestrator. Notes preserve unknown signs/prices/facing boundaries and conflicting store provenance.

Previous M6 check work is preserved below. The subsequent hub run is recorded in the 2026-10-31 ai-log update; two-phone M6 evidence remains separate.

## Previous focus (2026-10-30)

ADR-20 customer orders implemented on fakes in `/dashboard` per Helmut's amendment (Codex, 2026-10-30 evening). D-36 done; B-16 blocked on B-15's real capped REST Task/authority/identity proof. Real adapter probes the schema and refuses purchases; shared deployments remain on their existing real-payment configuration. [Validation and handoff](../codigo/docs/adr20-validation.md).

## Update 2026-10-30 evening (Claude for Helmut)
Public deployment is live (dev.shelfieapp.fyi, app.shelfieapp.fyi, api and api-dev through the Cloudflare tunnel; engine and verifier on this laptop, systemd --user, auto-update every 60 s; details in `docs/deploy.md` and `equipo/components.md`). Field test on phones passed claim/release; two 422 submissions unexplained until the access log carries `errorCode`. Keep the laptop on. Next: first release PR dev -> main, real-payment env switch with Fernando, tx hashes into `codigo/docs/evidence/tx-hashes.md`.

## Active branch

`dev`, D-42 changes uncommitted for the orchestrator. No git command that writes metadata, commit, push or network call was run in this block. Peer-review `pending` was not run because it performs `git fetch`, which the user expressly prohibited.

## Components I added or integrated

| Name | Path | What it does | How to run | Status | Depends on |
|---|---|---|---|---|---|
| Live checks | `codigo/scripts/live-check.ts`, `live-check.sec.test.ts` | Real API health/feed/claims/location/no-payment checks; release/reclaim and cleanup | From `codigo/`: export `ADMIN_TOKEN`, `WORKER_ADDRS`; `ENGINE_URL=https://api-dev.shelfieapp.fyi npx tsx scripts/live-check.ts` | local validation passes; live run pending | production engine; 2-3 distinct teammate preprod addresses |
| Worker/dashboard | `codigo/apps/web` | Camera/GPS worker flow and live job/ledger views; public package subpaths | `cd codigo && npm run dev -w @shelfie/web` | build and component tests pass; real-phone QA pending | engine, core/browser, evidence/explorer |
| Evidence ledger + CLI | `codigo/packages/evidence` | Append-only hash chain and explorer helpers; queue/verdict ledger integration | `npm run verify-ledger -w @shelfie/evidence -- <ledger-path>` from codigo | local tests pass; no real tx evidence | core |
| Team/run handoff | `docs/START-HERE-TEAM.md`, `codigo/README.md` | First 30 minutes, tasks/times, fake/real commands, verify-Friday register | read | complete | component READMEs and canonical design |
| Branch model | `docs/adr/0005-branch-model-dev-integration-main-final.md`, contributor docs, `.github/`, `.claude/`, `scripts/launch-github.sh` | `dev` integration and gated `dev` -> `main` releases | read | docs and guards updated; Fernando review and live GitHub protection remain | ADR-0005 |

## What runs / next command

D-42: Node 24.22.2 `npm run typecheck -w @shelfie/eval`, `npx --no-install eslint eval/src` and `npx --no-install vitest run eval/src apps/verifier/src/gates.test.ts apps/verifier/src/evaluate.test.ts apps/verifier/src/injection.sec.test.ts` pass (89 tests). Network is mocked; no full workspace check or live eval was run. Scoped security review found no blocking issues.

Exact next command from `codigo/`, after the orchestrator exports the matching `ADMIN_TOKEN` and starts its local live-vision verifier with `ENABLE_DRY=true`: `npm run eval -w @shelfie/eval -- --mode live --no-synthetic --labels labels.whatsapp-2026-10-31.json --verifier-url http://127.0.0.1:4199`. Photos remain outside git. Lorenz: review Fuze OOS facing ambiguity and #4 occlusion notes; confirm REWE/EDEKA provenance. Commit is orchestrator-owned; note D edited C-owned eval files (D-42).

Previous M6 block: photo-free checks and manual phone gaps are documented in `codigo/scripts/README.md` and `docs/ai-log.md`; its later hub run is recorded there.

Previous-block validation and handoff (2026-10-30):

Node 24 typecheck, ESLint, web production build, 113 targeted tests, three shell test files, 113 hook tests, redacted source scans and diff whitespace check pass. Full-suite socket listeners hit sandbox EPERM; details in [ADR-20 validation](../codigo/docs/adr20-validation.md). Fake order lifecycle includes delivery, withholding and observed refund; no real order was placed. Peer-review lookup requires authenticated gh on hub.

Exact next command on the unrestricted hub: `cd codigo && npm run check`. Fernando: follow `codigo/docs/verified.md` TODO B-15 to establish one capped Task purchase mechanism and the Task/agent Job/starter id mapping; then replace the fail-closed real probe, test one real 1-2-store order and close B-16. Keep A-24/D-37 separate. For unrelated D tasks: `bash scripts/task.sh next D`.

## Open questions / evidence

- Fernando (B-15/B-16): real Task cap enforcement, workspace/coworker authority, actual schema/quote and Task id -> starter journal -> engine externalRef. Real buying remains disabled; env names and exact spike are in verified.md. No prices/txs invented.
- Helmut/orchestrator: integrate the uncommitted feature after hub checks and authenticated peer review. No push was performed here.

- Helmut: approve or reject pre-existing sharp 0.34.5 in verifier/eval. No external package was added by this pass.
- Lorenz: review ten REWE draft labels (blurry photos are intentional negatives; no challenge-code evidence), complete 20 price + 8 OOS eval, verify real models/options.
- Isabel + Fernando: starter bridge and escrow/refund semantics, paid x402 and plain preprod transfer, W-VBUY balance, ledger observer failure handling.
- Session cookie is explicitly deferred; workerId is still in the request body. Real phone camera/GPS/CIP-30, secure LAN, tunnel headers and screenshot/explorer evidence remain to capture.
- [Full open register and validation](../codigo/docs/integration-2026-10-30.md). Task statuses remain in `equipo/tasks/`; D-28 remains blocked; D-29 (skills) and D-30 (branch model) are done.
- Fernando (B): review the `scripts/launch-github.sh` protection loop because `scripts/` is B-owned.
- Helmut: apply and verify the live `dev`/`main` protection settings after the PR is merged; this work only changed the script and guidance.
- Seed task D-05 still says the repo skeleton is merged to `main`; `scripts/task.sh` has no task-edit command. Update its acceptance before starting D-05 through an approved task-tracker change.

## Laptop setup (done 2026-10-29)

Node 24.22.2 via mise (global stays 26.8.2), Sokosumi CLI 1.0.4, logged in to preprod.

## Last updated

2026-10-31 by Codex for Helmut (D), D-42.

Update 2026-10-31 02:00 (Claude): ledger audit `codigo/scripts/ledger-audit.ts` merged into dev (D-43); first run 18/18 txs on preprod, 11 fake-era ledger entries flagged, one uncertain verify payment (W-VBUY paid twice, one verdict recorded).
