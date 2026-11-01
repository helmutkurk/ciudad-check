# Hub handoff, 2026-10-31 ~03:20 (Claude for Helmut, role D)

Safe checkpoint before Helmut's Claude credits run out. Isabel leads from now on, together with Fernando (B, `/b`); Helmut's Claude session is not needed again before the deadline. Helmut's laptop only keeps running the hub. Secrets (operator token, shell token, brand code, all hub env values) are in a private file Helmut sends directly to Isabel and Fernando: never commit it, never post it in a group. Demo engine: `https://api-dev.shelfieapp.fyi` (dev branch), decided by Helmut and Isabel (ADR-22).

## Update 2026-10-31 ~12:55 (Claude for Helmut)

- Hub unchanged and healthy: `/api/health` `ok:true`, fakes both false, verifier up; W-VBUY ~9,775 tADA, W-PAY ~9,976 tADA; auto-deploy from `dev` working (deployed `56766e9` at 11:54 UTC).
- Open item 1: `fix/ui-brand` merged (`6587180`). `fix/ui-dashboard-w` was **never committed or merged**, see its status at the end of this file.
- Open item 2 done twice: full real cycles for Tasks `01a18fe6` and `01a19013` (lock, x402 verify, payout, DELIVER, ResultSubmitted, settlement) plus refunds of withheld Tasks, all in `codigo/docs/evidence/tx-hashes.md` (A-25). The `01a19013` settlement came at 08:45 UTC because MPS was down from about 05:00.
- Since 03:20 on `dev`: shell worker fixes, real Sokosumi Task price for brand credits, store-internal barcodes ignored by the verifier, worker wallet earnings, pinned operator tools and catalog test job (Isabel); Devfolio text and 3-minute video cut (Fernando, Lorenz); hooks suspended (ADR-0007).
- Still open: item 4 (release PR dev -> main, Helmut's bypass), items 5 and 6.

## Hub state (Helmut's laptop, stays on, plugged in, online)

| Unit (`systemctl --user`) | State | Notes |
|---|---|---|
| `shelfie-engine@dev` | running, port 4100 | real mode, NODE_ENV=production |
| `shelfie-verifier@dev` | running, port 4121 (loopback) | Gemini live, OpenAI fallback configured (account has no credits) |
| `shelfie-tunnel` | running | `api-dev.` -> 4100, `api.` -> 4000 |
| `shelfie-update@dev.timer` | **active again** | pulls `origin/dev` every 60 s, builds, restarts engine and verifier: every push to dev is live within ~2-3 min |
| `shelfie-engine@main`, `shelfie-verifier@main`, `shelfie-update@main.timer` | stopped and disabled | not used for the demo (Helmut) |

Check from anywhere: `curl -s https://api-dev.shelfieapp.fyi/api/health` (expect `ok:true`, `fakes` both false, `verifier:"up"`, real `vbuy` balance) and `curl -s https://api-dev.shelfieapp.fyi/version.json` (deployed commit).

## Engine env on the hub (`~/.config/shelfie/dev.env`, names only)

Real switches: `FAKE_PAYMENTS=0`, `VERIFIER_PAYMENT=on`, `VERIFY_CLIENT=real`, `VERIFIER_MODE=live`, `LOCATION_CHECK=on`, `ENABLE_DRY=false`, `ALLOW_TEST_UPLOAD=false`, `ALLOW_DEMO_OVERRIDE=false`, `X_ENGINE_TOKEN_REQUIRED=true`.
Sokosumi real (Isabel's account): `SOKOSUMI_CLIENT=real`, API URL, token, coworker `01a188b2-...`, org `tum-hackathon-u4ve65`, `SOKOSUMI_MAX_CREDITS_PER_TASK=100`, `ORDER_MAX_STORES=5`, `ORDER_DAILY_CREDIT_CAP=5000`. Brand: `BRAND_ACCOUNTS` (Acme Foods).
Timings: `JOB_WINDOW_SEC=660` (bridge sends `windowSec<=600`), `CLAIM_TTL_SEC=180`, `VERIFY_BUDGET_SEC=60` -> claims close 240 s before the window end. `PAYOUT_DAILY_CAP_LOVELACE=100000000`.
Changing any of these needs Helmut at the laptop (edit the file, `systemctl --user restart shelfie-engine@dev`). Backups: `~/.config/shelfie/*.bak-20261031`, `dev.env.bak-pre-sokosumi`.

Wallets (2026-10-31 00:30): W-VBUY ~9,793 tADA, W-PAY ~9,991 tADA, W-SELL 6, W-MPS ~195. Funds are not a limit.

## Verified tonight (real mode, api-dev)

- `codigo/scripts/live-check.ts`: 20/20 (feed on 3 workers, claim race 409, `wrong_city` 403, far capture 422 with no verify/payout, release/reclaim).
- `/b` real orders enabled (`/api/config` orders `enabled:true, realReady:true`), Tasks created on Sokosumi in seconds.
- First real x402 verifier payment from a real `/w` photo: `94c29ae1db972f418b3a156c22a6e3b0de6ae80b9f12f98fb94d848de39f5887` (verdict FAIL: hand sign and product mismatch; not yet in tx-hashes.md).
- Eval on 14 real shelf photos with Gemini (local dry verifier): 14/14 decisions correct, no false accepts, p95 3.6 s (`codigo/eval/results/*.md`).
- `codigo/scripts/ledger-audit.ts`: 18/18 recorded txs on preprod; 11 fake-era ledger entries from 2026-10-30 in the dev ledger; one uncertain x402 payment.
- Isabel (A-25): refunds of tonight's 4 withheld Tasks seen on MPS (hashes in her message; check on the explorer, add to tx-hashes.md).

## Open, in priority order (Isabel continues)

1. **UI branches:**
   - `fix/ui-brand`: **merged into dev** (`6587180`): `/b` shows the price before ordering (credit ceiling per store and total), a Spend and checks card (reserved today vs cap, paid, refunded, passed/failed/timed out), Transactions (escrow lock, result, settlement, refund, x402 fee, payout with explorer links) and the outcome per store. New endpoints `GET /api/brand/summary` and `GET /api/brand/transactions` (brand-scoped, security tests).
   - `fix/ui-dashboard-w`: see the status line at the end of this file. Content: `/w` take-button disabled after the claim cutoff and time left = time to claim; `/dashboard` Operator tab removed; finished jobs no longer "active"; Done filter Passed / Failed / Timeout. If it is on origin with a commit and not yet merged: review, `npm run check`, merge into dev with `--no-ff`, push.
   - Test note: on a loaded machine two old tests can time out at 5 s (`apps/verifier/src/app.test.ts` stub end-to-end, `apps/engine/src/wiring.test.ts` payout queue). They are unrelated to these merges; rerun them alone before treating them as failures.
2. **End-to-end real order (2 stores) from `/b`**: one store gets a passing photo on `/w` (live camera, 2-5 fingers hand sign next to the tag, within 150 m of the store, the product of the order), the other is left to withhold. Follow: Task -> lock -> job in `/w` within 1.5-3 min -> claim -> photo -> verify x402 tx -> payout tx -> DELIVER -> `RESULT_SUBMITTED` -> `SETTLED`; withheld store -> refund. Log every tx in `codigo/docs/evidence/tx-hashes.md` (explorer links).
3. Last paid escrow cycle must start by **13:00**; feature freeze **11:00**; Devfolio **15:00**.
4. Release PR dev -> main: needs 3 approvals, only two people active; Helmut (admin) decides the bypass after 13:00 and records it in `docs/ai-log.md`. The demo itself runs on api-dev and does not need it.
5. Fresh evidence ledger (optional, Helmut decides): archive `~/.local/share/shelfie/dev/*.jsonl` before the recorded run so the 2026-10-30 fake entries are not in the same ledger.
6. `docs/deploy.md` still to be filled from this file.

## If something breaks on the hub while Helmut is away

Isabel cannot restart the hub. Pushing a fix to `dev` deploys automatically (timer). If the engine is down (`/api/health` not 200) or the tunnel is down, call Helmut: `systemctl --user restart shelfie-engine@dev shelfie-verifier@dev shelfie-tunnel`.

## Status of `fix/ui-dashboard-w`

03:20: still being finished by an agent on Helmut's laptop.

12:55 (Claude): not merged. The branch still points at the old `dev` commit `835b6a4`; its work exists only as uncommitted changes in Helmut's worktree `../shelfie-ui-dashboard-w`. That work deletes `OperatorTools.tsx` and the Operator tab, which conflicts with Isabel's later operator tools on `dev` (`a1705ed`, `fc77a4f`). The feature freeze (11:00) has passed: do not merge it for the hackathon. `/dashboard` and `/w` run the `dev` version: the take-button can look active after the claim cutoff (the engine refuses with "Too late to start this task").
