# Fernando - role B
- Role and pair: B, pair with Isabel (A)
- GitHub: Fmayo444
- Reviews: pair reviews each other's commits first (peer review, `scripts/peer-review.sh`)

## Current focus
All B build tasks done except B-09 (public repo check, Sat 13:30). M1 paid x402 (tx `cbc9cb5d...`), M2 payments: SDK payout (`60d49a3a...`) and engine payout queue (`1abef825...`, no double pay). Waiting on: T-12 (A-05, A-08, C-09), T-14 (Sokosumi credits), Helmut's deploy env for evidence runs.

## Active branch
- `dev` (ADR-0006, direct push): everything merged and pushed up to `3a6550d`. No open branch.

## Components I added
| Name | Path | What it does | How to run | Status | Depends on |
|---|---|---|---|---|---|
| Payout once | `codigo/scripts/payout-once.ts` | One real preprod transfer from W-PAY; checks confirmations and `find()` (ADR-04) | `cd codigo && node --env-file=<local env> --import tsx scripts/payout-once.ts --to addr_test1... [--send]` | works: tx `60d49a3a...` (B-04) | funded W-PAY, Blockfrost preprod key |
| Smoke | `codigo/scripts/smoke.ts` | End-to-end checks against the engine on fakes | `cd codigo && npm run smoke` | works (fake mode, my laptop) | running engine on fakes |
| Hub launcher | `codigo/scripts/hub-up.sh` | Starts engine, verifier, web, optional tunnel | `cd codigo && npm run hub-up -- --fake [--tunnel]` | works; `--tunnel` prints the phone URL (fallback to Helmut's deploy) | cloudflared for `--tunnel` |
| Funding check | `codigo/scripts/fund-check.ts` | Preprod balances for public wallet addresses | `cd codigo && node --import tsx scripts/fund-check.ts` | works: all four wallets OK on preprod (B-01) | Blockfrost preprod key |
| Verify once | `codigo/scripts/verify-once.ts` | One paid x402 verify W-VBUY -> W-SELL, prints the receipt (M1) | `cd codigo && node --env-file=<local env> --import tsx scripts/verify-once.ts [--send]` | works: tx `cbc9cb5d...` (B-03) | verifier running with `VERIFIER_PAYMENT=on` |
| Payout queue once | `codigo/scripts/payout-queue-once.ts` | Real payout through the engine's queue, proves no double pay (B-07) | `cd codigo && node --env-file=<local env> --import tsx scripts/payout-queue-once.ts --to addr_test1... [--send] [--task tsk_...]` | works: tx `1abef825...` | funded W-PAY |
| Evidence preflight | `codigo/scripts/evidence-preflight.ts` | Fails on fakes, stub, dry routes, override, dev mode or flagged ledger entries before an evidence run (B-12) | `cd codigo && node --env-file=<local env> --import tsx scripts/evidence-preflight.ts` | works (tested) | running engine |
| Purge evidence | `codigo/scripts/purge-evidence.ts` | GDPR deletion after the event; ledger untouched (B-12) | `cd codigo && node --env-file=<local env> --import tsx scripts/purge-evidence.ts [--confirm]` | works (tested) | engine stopped |

## Open questions
- Is a self-operated verifier paid over x402 acceptable for "agents hiring agents"? (mentor-questions C2, M8; Fernando)
- Sokosumi credits: 16 left, one paid Task costs 100 (1 test USDM); top-up asked (Isabel). Blocks T-14 (M4).
- Does Sokosumi need to reach the agent API publicly (mentor question M6)? (Isabel, Helmut)
- Evidence runs on Helmut's deploy hub: who puts the wallet keys and caps into `~/.config/shelfie/<branch>.env` and switches fakes off? (Helmut, Fernando)
- Evolution SDK default tx TTL, to decide whether stale SUBMITTED payouts may move to UNKNOWN (Fernando).

## Last updated
2026-10-30 by Claude Opus 5.5 (Fernando's session)
