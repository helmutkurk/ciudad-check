# scripts

Status: implemented (`smoke.ts`, `hub-up.sh`, `fund-check.ts`, `payout-once.ts`, `setup-wallets.md`). Links point to the canonical design in `diseno/`.

## Files
| File | What it does | Run from `codigo/` |
|---|---|---|
| `smoke.ts` | End-to-end smoke (repo-layout section 4) against a **running engine on fakes**: demo job, wrong-code photo (FAIL, no payout, attempts left), valid photo (PASS, exactly one payout, `DELIVER`), duplicate create/submit, out-of-stock job (PASS `OUT_OF_STOCK`, one payout, report says out of stock), far-away submission (422 `location_mismatch`, no verify tx), out-of-catalog and free-text jobs (422, no task), ledger chain check through the API. Exit 1 on any failed assertion; refuses to run if the engine reports real payments. | `npx tsx scripts/smoke.ts` |
| `live-check.ts` | Photo-free checks against the real HTTPS engine: health/no fakes, catalog selection, independent worker feeds, wrong city, first claim wins, capture-location refusal with job-scoped ledger/no-payout checks, release/reclaim and cleanup. Requires an explicit operator token and 2-3 distinct preprod addresses. Prints PASS/FAIL and stable error codes; exit 0/1. | See live usage below |
| `hub-up.sh` | Starts engine, verifier, web, waits for `/api/health`, prints URLs and a fake-mode warning. With `--tunnel` (B-08) it first starts the cloudflared quick tunnel for the engine port only, reads its `https://*.trycloudflare.com` URL, starts the engine with `PUBLIC_BASE_URL` and `ALLOWED_HOSTS` set to it, and prints the phone URL `<tunnel>/w` (a QR code too if `qrencode` is installed). Without cloudflared it stops before starting anything. Fails fast if `codigo/.env` is missing (use `--fake` for a rehearsal without secrets). Never prints env values. `stop` and `status` subcommands. | `bash scripts/hub-up.sh --fake` |
| `fund-check.ts` | Reads public wallet addresses from env and prints Blockfrost **preprod** balances. Refuses mainnet addresses, mainnet project ids and `NETWORK` other than preprod. Without `BLOCKFROST_PROJECT_ID` it is a dry run (no request). | `node --env-file=.env --import tsx scripts/fund-check.ts` |
| `ledger-audit.ts` | Read-only deployment audit: evidence hash chain/time order, engine decisions, accepted submissions, payout uniqueness/amounts, durable verifier receipts, preprod transaction inputs/outputs and wallet movement. Summary table plus discrepancies; exit 0 when requested checks pass, 1 on discrepancies/input/query failures. | `node --env-file="$HOME/.config/shelfie/dev.env" --import tsx scripts/ledger-audit.ts` (explicit deployed paths below) |
| `payout-once.ts` | One real plain transfer from `W-PAY` on **preprod** with the queue's `EvolutionPayoutAdapter`, to settle ADR-04 (task B-04). Prints balance, sends once (default 2 tADA, capped at `MAX_PAYOUT_LOVELACE`) with a `shelfie:` metadata tag, waits for one confirmation, then checks that `find()` returns the same hash. Dry run unless `--send` (still needs the real env: it reads the balance). Refuses `FAKE_PAYMENTS`. One attempt per run and no idempotency record across runs (manual operator tool, documented exception): never rerun `--send` after exit 2 "Outcome UNKNOWN" or exit 3; check the explorer, then `--check <hash> --tag <tag> --since <iso>`. Exit codes: 0 ok, 1 refused, 2 not sent or unknown, 3 sent but unconfirmed or not found (waits up to 10 min). | `node --env-file=.env --import tsx scripts/payout-once.ts --to addr_test1... [--send]` |
| `verify-once.ts` | One paid x402 request on **preprod** (M1, B-03): the engine's buyer (`createVerifyClient`, W-VBUY, spend cap, payee pinned to `SELLER_ADDRESS`) pays the running verifier for one `POST /v1/verify` and prints the settlement tx hash. Checks `/health` and `/v1/price` first (payee must be W-SELL, price within `VERIFY_MAX_PRICE_LOVELACE`). Synthetic image and stub reader: the payment is evidence, the verdict is not. Dry run unless `--send`; refuses `FAKE_PAYMENTS` and `VERIFIER_PAYMENT=off`. Exit 3 = payment unclear: never rerun `--send`, check W-VBUY on the explorer. | verifier: `VERIFIER_PAYMENT=on VERIFIER_MODE=stub node --env-file=.env --import tsx apps/verifier/src/main.ts`; then `node --env-file=.env --import tsx scripts/verify-once.ts [--send]` |
| `payout-queue-once.ts` | One real payout through the engine's payout queue on **preprod** (B-07): `DefaultPayoutQueue` + `EvolutionPayoutAdapter` (W-PAY) + `FilePayoutStore` (default `./data/payout-queue-once.json`). Pays one task (`PAYOUT_LOVELACE`), polls to CONFIRMED, re-enqueues the same task and checks nothing new is sent. `--task <id>` repeats it after a restart. Refuses a new task while an earlier payout in the store is unfinished; refuses `FAKE_PAYMENTS`; dry run unless `--send`. Run from `codigo/`, one run at a time. | `node --env-file=.env --import tsx scripts/payout-queue-once.ts --to addr_test1... [--send] [--task tsk_...]` |
| `evidence-preflight.ts` | Before every evidence run or recording (B-12, security.md section 5): checks the engine and verifier env (preprod, no fakes, verifier paid and not stub, dry routes off, engine token required, override and test upload off, location check on, `NODE_ENV=production` or `EVIDENCE_RUN_LOCKED`), the running engine's `/api/health` (no fake flags, verifier up) and `/api/config` (demo override disabled), and the evidence ledger (no `demoOverride` or `operatorMarkedPaid` entry; with `--since <iso>` a missing ledger fails). Prints names and PASS/FAIL only; exit 1 on any failure, 2 when `--no-engine` skipped the runtime checks. | `node --env-file=.env --import tsx scripts/evidence-preflight.ts [--since <iso>] [--no-engine]` |
| `purge-evidence.ts` | GDPR deletion after the event (B-12, security.md 4.9): deletes the journal records with worker data (claims, submissions, payouts), the payout queue entries, the verifier idempotency cache, the photos in `<data>/images/` (plain files only) and the hub-up logs; keeps jobs, tasks, verdicts and settlements; never touches the evidence ledger (hash checked) or `docs/evidence/`. Dry run unless `--confirm`; refuses unless the engine is clearly stopped, while any payout (queue or journal) is not final, or when a path leaves the data dir. Do not restart the engine on the purged data dir. | `node --env-file=.env --import tsx scripts/purge-evidence.ts [--confirm]` |
| `setup-wallets.md` | Instructions only: which wallets exist, where mnemonics and public addresses go, funding. Generates nothing. | read |

## Smoke usage
```
npm run dev -w @shelfie/engine            # terminal 1 (fakes, 127.0.0.1:4000)
npx tsx scripts/smoke.ts                  # terminal 2
ENGINE_URL=http://127.0.0.1:4000 ADMIN_TOKEN=... SHELL_TOKEN=... npx tsx scripts/smoke.ts   # other targets
```
Store coordinates come from `investigacion/catalogo/stores.json` (`CATALOG_DIR` overrides). The fake verifier decides from a marker inside the synthetic JPEG, so the smoke only works against the engine's fake verifier. Re-run it against real components as they come online by changing the engine's env, not the script (the real verifier will need real photos, so the wrong/valid assertions then become manual).

## Live usage (D-17)

Run with Node 24 from `codigo/` on the unrestricted hub. This creates a real operator
`source: demo` job; it does not hire through Sokosumi or use fake adapters. Keep other
testers off this job until cleanup completes. There is no confirmation/dry-run flag.

```bash
read -rs ADMIN_TOKEN && export ADMIN_TOKEN
read -rs WORKER_ADDRS && export WORKER_ADDRS
ENGINE_URL=https://api-dev.shelfieapp.fyi npx tsx scripts/live-check.ts --store <id> --ean <ean>
```

Enter 2-3 comma-separated, distinct teammate preprod payout addresses for `WORKER_ADDRS`.
Alternatively repeat `--addr <address>` two or three times; flags replace the env list.
Defaults match `field-jobs.ts`: store `rewe-81671-august-everding-strasse-20`, EAN
`5449000000439`. `--window` defaults to 600 seconds, accepts 500-3600, and must exceed
the deployed claim TTL plus verification budget. A 422 on job creation may mean the
window is too short for that deployment. No dev token fallback; `ADMIN_TOKEN` needs
32+ characters. `NETWORK`, if set, must be `preprod`; `ENGINE_URL` must be an HTTPS
origin without credentials, path, query or fragment. Redirects are refused. Tokens
and cookies are never logged; addresses show only their first eight characters.

The script follows `/w`'s implemented identity flow: an independent random `workerId`,
payout profile and `consent-v1` in memory per simulated browser. Consent has no HTTP
endpoint; cookie/session auth is deferred in the current web client and engine. No
cookie or worker token is invented. Feed reads use `/w`'s `status=OPEN` API path.
The outside-Munich claim runs before A claims, since an occupied task returns
`task_not_open` before checking city. Expected refusals: 403 `wrong_city`,
409 `task_not_open`, and 422 `location_mismatch`.

There is no separate capture-location endpoint. The script reveals the gesture
challenge, then sends a **synthetic rejection probe**, with far-away coordinates and
valid base64 containing an unusable JPEG, through the submission route. The current
engine checks location after base64 decoding and before JPEG cleaning. This tests
the real location gate without a photo; if location checking is disabled, the JPEG
cleaner refuses the probe before a submission or paid verification can start. The
probe is never photo evidence. Ledger pagination checks `LOCATION_CHECKED` for the
claim, no `SUBMISSION_RECEIVED`, `VERIFY_PAID`, verdict or payout activity for this
job/task, unchanged attempts, and an empty job payout list. Unrelated live payments
do not affect the result. An unavailable/incomplete ledger fails the check.
This is API/ledger evidence; no endpoint exposes an internal verify-call counter.

A releases, B sees the task return and reclaims it. The `finally` block releases all
known claims and cancels only this test job, including after a failed assertion or
transport error. All requests time out after 20 seconds and mutations are never
automatically retried. On a timeout creating the job, reconcile the printed
`live-check-...` external reference in `GET /api/jobs` before rerunning. On failed
cleanup, use the printed job id to cancel it or wait for its short window to expire.
An interrupted process cannot guarantee cleanup; the same window/claim TTL apply.

Local tests, with no sockets or credentials:

```bash
node --import tsx scripts/live-check.sec.test.ts
npm run typecheck
```

The seven tests cover input/network/token guards, defaults, the nonpayable probe and
ledger activity scoping. They are a separate Node test command, outside root Vitest's
workspace glob. The script reuses smoke's request/claim/release and ledger API patterns
and shared core schemas; it cannot import `smoke.ts` helpers because that file starts
the fake-only smoke on import.

M6 remains **unverified** until real-phone testing. This script does not test camera
permissions/no file picker, shutter GPS UI, real PASS/FAIL/OOS/cheat verdicts or payout
hashes, catalog dropdown rendering, dashboard/SSE updates within three seconds,
banner rendering, iOS Safari/Android Chrome, recordings or explorer receipts. These
need the browser/phone or a real photo. `/api/health` reports engine fakes and verifier
reachability; it does not expose server `NODE_ENV` or the verifier's live/stub setting.
Run `evidence-preflight.ts` on the hub to check those settings before recording.
See [M6 acceptance](../../diseno/repo-layout.md#5-definition-of-done-per-milestone) and
the [field test](../../preparacion/field-test-supermarket.md). No live network run was
performed in the Codex sandbox.

## TODO / verify Friday
- The dry endpoint exists. Test it with real decodable fixtures and `VERIFY_CLIENT=real`; the marker-based smoke uses synthetic JPEG bytes and deliberately targets the in-engine fake verifier.
- `hub-up.sh`: verifier/web start scripts exist. Verify real startup, cloudflared command/URL pattern, `HUB_LAN_IP`, and descendant cleanup after stop on the hub laptop.
- `fund-check.ts`: `WALLET_ADDRESS_VBUY`, `WALLET_ADDRESS_PAY`, `WALLET_ADDRESS_MPS` are core `FundCheckEnvSchema` names documented in contracts §5.6; not run against Blockfrost yet (no key).
- `verify-once.ts`: paid runs 2026-10-30, txs `1547a4a7...` (1 confirmation, buyer timed out) and `cbc9cb5d...` (0 confirmations, receipt printed) (B-03 done).
- `payout-queue-once.ts`: paid run 2026-10-30, tx `1abef825...`; re-enqueue and restart sent nothing (B-07 done).
- `payout-once.ts`: first real run 2026-10-30, tx `60d49a3a...` (B-04 done; `codigo/docs/verified.md`).
- Not scripted yet (checklist items): `scripts/hub-check.sh`, `check-bundle.sh`.
- Root `npm run typecheck` includes `tsc -p scripts/tsconfig.json`; `npm run smoke` and `npm run hub-up -- --fake` are root scripts. Fake hub mode never reads `.env`. Socket startup and smoke must be rerun on the hub: this sandbox refuses TCP/Unix sockets (EPERM).

## Do not
- Never print or commit mnemonics or keys.
- Do not restart the tunnel mid-demo.

## Deployment ledger audit (D-42)

Run the new script from this checkout against the deployment's persistent data, with Node 24:

```bash
cd /home/hks/Academia/TUM/bsc_winfo/hackathon/shelfie-audit/codigo
"$HOME/.local/share/mise/installs/node/24.22.2/bin/node" \
  --env-file="$HOME/.config/shelfie/dev.env" --import tsx scripts/ledger-audit.ts \
  --store "$HOME/.local/share/shelfie/dev/engine-events.jsonl" \
  --ledger "$HOME/.local/share/shelfie/dev/evidence-ledger.jsonl" \
  --payout-store "$HOME/.local/share/shelfie/dev/payout-queue.json" \
  --verify-state "$HOME/.local/share/shelfie/dev/verify-client.json"
```

Node loads `--env-file` before the script, matching `fund-check.ts`; there is no custom dotenv
reader. Shell variables take precedence. Online checks require `NETWORK=preprod`,
`BLOCKFROST_PROJECT_ID`, `WALLET_ADDRESS_VBUY`, `WALLET_ADDRESS_PAY`, `SELLER_ADDRESS`, and the
prices used by the deployment: `PAYOUT_LOVELACE` (default 3000000) and `VERIFY_PRICE_LOVELACE`
(default 1000000). Only these public configuration fields and data paths are retained; the audit
never uses signing mnemonics or payment adapters. No new dependencies.

Paths default to `STORE_PATH`, `LEDGER_PATH`, `PAYOUT_STORE_PATH` (or `payout-queue.json` beside
`STORE_PATH`) and `verify-client.json` beside `STORE_PATH`, matching engine wiring. The default
transaction log is **this checkout's** `codigo/docs/evidence/tx-hashes.md`; use `--tx-log <path>`
for another captured log. Every input must exist and pass validation. `--help` lists all flags.

- `--since <ISO-UTC>` scopes job checks to creation, ledger activity, submission receipt or payout
  write-ahead activity since the timestamp; related earlier records are retained for context.
  The entire ledger chain and timestamp order are always checked. Unattributed payments cannot
  be silently hidden by the time filter. Every documented hash is checked because Markdown
  rows do not have reliable structured timestamps.
- `--no-chain` performs local checks without any network request or Blockfrost key. Exit 0 then
  means **local consistency only**; the output explicitly marks transaction existence, on-chain
  amounts and balance deltas as skipped.
- A passing `DELIVER` job needs one accepted submission with an effective PASS and exactly one
  submitted/confirmed payout. `WITHHOLD`, cancelled and failed tasks must have none. Intake
  rejection does not require a task. Repeated journal updates and submitted/confirmed ledger
  observations of the same payout are deduplicated; conflicting hashes and duplicate task or
  submission payments fail. Unfinished payouts, pending/uncertain verifier payments and expired
  undecided jobs fail; active jobs before their deadline are reported as in flight.
- The journal is replayed without discarding historical records at `clear` markers. Lost records,
  missing durable queue/receipt entries, fake/dry hashes and flagged overrides fail. This audit
  complements `evidence-preflight.ts`; it does not attest the photo or verifier model's truth.

The Blockfrost client uses GET only at the fixed preprod origin, a timeout, pacing, and refused
redirects. Transaction metadata and UTxOs are validated; reference/collateral inputs do not count
as the sender. Receiver **net** lovelace across ordinary inputs/outputs must match the expected
payment, excluding change. Fee expectations for deployment receipts use the configured verifier
price; payouts use their recorded destination/amount and the configured payout amount. API
contract: [Blockfrost official OpenAPI](https://github.com/blockfrost/openapi/blob/master/openapi.yaml).

Balance rows reconstruct outputs minus inputs at W-VBUY and W-PAY over the window, paginating
address history against a fixed tip height. Expected delta is minus recorded payment principal
and actual recorded-transaction fees, each hash counted once. Residuals are report-only: funding,
unrelated transfers, deposits, co-funding and clock/indexing differences can explain them. No
opening/closing balance snapshots exist in these stores; this is a reconstructed address delta,
not an independent reconciliation against saved wallet balances. Only the configured public
address for each wallet is covered; extra wallet derivations require a separate audit.

Limits: files are stat-checked before and after the snapshot but the running engine is not
locked. Detected writes fail; retry in a quiet interval or use a consistent snapshot. Script
validation failure or a Blockfrost 404/API error fails closed, including unconfirmed transactions
which are not yet indexed. Documented setup/escrow hashes get existence checks; historical
payout rows lacking a worker address get sender/amount checks with an explicit coverage note.
Historical documented amounts are used when no deployment record supplies an expectation.
The hash chain cannot detect suffix removal or a complete rewrite without an externally saved
head, and payload preimages are not persisted, so `payloadHash` cannot be recomputed. Purged data
cannot produce a complete consistency pass. The tool never repairs, reconciles, signs or submits.

Socket-free synthetic tests (fixtures in `ledger-audit-fixtures.ts`, under 50 KB):

```bash
cd codigo
node node_modules/vitest/vitest.mjs run --configLoader native --no-cache \
  scripts/ledger-audit.test.ts scripts/ledger-audit-chain.test.ts scripts/ledger-audit.sec.test.ts
node node_modules/typescript/bin/tsc -p scripts/tsconfig.json
```

The native config loader and disabled cache avoid writes to the prepared worktree's read-only
`node_modules` symlink. The root Vitest include now covers `scripts/**/*.test.ts`, so these tests
also run in `npm run check` on a normal writable checkout.
