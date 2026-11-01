# Shelfie monorepo

Verified shelf checks, paid only when the photo is true. The engine admits one catalog store and product per job, verifies one worker photo, pays only on PASS, and delivers the report or withholds it for the buyer's refund. Cardano preprod and test ADA only.

Current post-hackathon operation: [STATE](../docs/STATE.md). The public web remains
on Vercel; the engine/verifier backend is deliberately offline. Historical real
preprod payments and the complete engine/photo cycle are recorded in
[verified facts](docs/verified.md) and [evidence](docs/evidence/tx-hashes.md).
Local fake development remains available; it does not prove live availability.

## Layout

| Folder | Owner | Already available |
|---|---|---|
| `apps/shell` | A, Isabel | JS bridge, pinned starter patch and shell tests (starter checkout is git-ignored) |
| `apps/engine`, `packages/core` | A, Isabel | API, state machines, catalog intake, geofence, journal, shared schemas and env loader |
| `packages/payments`, `scripts` | B, Fernando | x402 buyer, payout adapter and durable queue, fakes, smoke, hub-up, fund-check |
| `apps/verifier` | B wrapper, C gate | x402 seller, validation before payment, idempotency, dry/extract routes, G1-G7 and OOS gates |
| `packages/domain-shelf`, `packages/vision`, `eval` | C, Lorenz | Catalog loader, prompt constants, reports, provider adapters and evaluation runner |
| `apps/web`, `packages/evidence`, `docs/evidence` | D, Helmut | Worker app, dashboard, hash-chained ledger and preprod explorer helpers |

## How to run

The hosted `/w`, `/b` and `/dashboard` require the offline API for live functions.
For hosting/reactivation use [deploy.md](../docs/deploy.md); continuing the backend
requires a server. Do not start the retired laptop hub from old task notes.

Use Node 24 and npm. The checked local version is 24.22.2; the repo's `.node-version` selects major 24. Keep global Node unchanged if needed:

```bash
# From codigo/; choose one version manager.
mise exec node@24 -- node --version
# Or: nvm install 24 && nvm use 24
npm ci
npm run check
```

With mise, prefix subsequent npm commands with `mise exec node@24 --` unless Node 24 is already active. `npm run check` covers workspace and scripts typechecks, ESLint, Vitest, then the shell bridge's `node --test` suite. No dependency upgrades are needed.

For a local env file, copy `.env.example` to `.env`, fill values locally, and never commit it. The example contains names only; blank values count as unset in `loadEnv`. App commands consume exported environment variables, not the root `.env` automatically. Humans can supply the local file to Node with `node --env-file=.env --import tsx <entrypoint>`. The non-fake hub loader reads the root file for its child services. Agents must follow AGENTS.md's restriction on reading `.env` files.

Start each app on fakes in separate terminals from `codigo/`:

```bash
FAKE_PAYMENTS=1 VERIFIER_PAYMENT=off npm run start -w @shelfie/engine
VERIFIER_PAYMENT=off VERIFIER_MODE=stub npm run start -w @shelfie/verifier
npm run dev -w @shelfie/web
```

Engine: `http://127.0.0.1:4000/api/health`. Verifier: `http://127.0.0.1:4021/health`. Web: `http://127.0.0.1:5173/w` or `/dashboard`; `/api` is proxied to the engine. `VITE_ENGINE_URL` changes the dev proxy target; otherwise it uses `ENGINE_PORT` (4000 by default). The engine's fake verifier is in-process, so the smoke does not depend on the separate verifier. To exercise the separate stub service with a real decodable fixture, set `VERIFY_CLIENT=real`, `VERIFIER_PAYMENT=off`; the marker-based smoke uses synthetic JPEGs and is not suitable for that path.

The tracked shell bridge and starter patch are in `apps/shell/`; setup of the separate, pinned starter checkout is in its [README](apps/shell/README.md). The workspace dev script does not launch a Coworker.

For the hub rehearsal and smoke:

```bash
npm run build -w @shelfie/web
npm run hub-up -- --fake
npm run smoke
npm run hub-up -- status
npm run hub-up -- stop
```

`--fake` uses exported settings and never loads `.env`. Hub logs and PID files are under `${TMPDIR:-/tmp}/shelfie-hub/`. The hub starts engine, verifier and web, not the Masumi worker. The built web app is served by the engine; the dev server is at 5173. Stop foreground app terminals with Ctrl-C. After a hub stop, inspect `ss -ltnp` for 4000-4021 and 5173 and stop any surviving child belonging to this run. Do not stop another teammate's service.

A real hub run is `npm run hub-up -- --tunnel` after the owner has configured the local env and authorised paid resources. It needs cloudflared and curl, exposes only the engine, and requires `PUBLIC_BASE_URL`/`ALLOWED_HOSTS` to match the tunnel. Venue headers, LAN routing and the phone secure context remain to verify. Build before using the engine's HTTPS tunnel for the live camera; plain LAN HTTP stays read-only.

Evaluation and evidence checks:

```bash
npm run eval -w @shelfie/eval -- --mode stub --out /tmp/shelfie-eval
npm run verify-ledger -w @shelfie/evidence -- apps/engine/data/evidence-ledger.jsonl
node --import tsx scripts/fund-check.ts
```

The eval calls the same `evaluate` function in-process, without HTTP. Stub/synthetic output is explicitly NOT evidence. Live eval needs Lorenz's reviewed labels, local photos and owner-authorised `VISION_*` credentials; see [eval/README.md](eval/README.md). The ten-photo [REWE draft](eval/labels.rewe-2026-10-30.draft.json) needs Lorenz's review: blurry photos are intentional negatives and this set has no challenge codes, so it cannot establish G2 accuracy or full-verifier acceptance. Fund-check without addresses/key makes no network request; real balances are unverified.

### Fake and real switches

Local development and CI use the Rehearsal column. The Real column describes
requirements for an authorized preprod evidence run, not a currently running hub.
The vision key was removed from the hub. Humans configure private credentials and
budgets only when reactivation is approved; never put their values in git or chat.

| Name | Rehearsal | Real/evidence requirement |
|---|---|---|
| `NETWORK` | `preprod` | `preprod` only |
| `FAKE_PAYMENTS` | `1` | `0`; authorised, funded W-PAY and W-VBUY |
| `VERIFIER_PAYMENT` | `off` | `on`; actual x402 receipt |
| `VERIFY_CLIENT` | `fake` (default with fake payments) | `real` |
| `PAYMENTS_IMPL` | `package` with fake adapter; optional `engine-fake` | `package` |
| `VERIFIER_MODE` | `stub` | `live`, evaluated provider/model |
| `ENABLE_DRY` | implied true by payment off unless explicitly disabled | false |
| `SELLER_ADDRESS` | unnecessary for fake client | required payee pin for real paid verification |
| `VERIFY_RUN_CAP_LOVELACE` | default 50000000 | `200000000` on shared deployments (each receipt counts 2 tADA) |
| `PAYOUT_DAILY_CAP_LOVELACE` | default 50000000 | set the agreed budget; per-payout hard cap remains 5000000 |
| `VISION_RUN_CAP` | optional positive integer | set a finite agreed call budget |
| `ALLOW_TEST_UPLOAD`, `ALLOW_DEMO_OVERRIDE` | false by default | false |
| `LOCATION_CHECK` | on by default | on |
| `EVIDENCE_RUN_LOCKED` | false | true locks reset; it does not certify an otherwise fake run |
| `X_ENGINE_TOKEN_REQUIRED` | optional in dev | true with matching engine token |

Mnemonics and keys are server-only. Web imports `@shelfie/core/browser` and `@shelfie/evidence/explorer`; neither pulls Node built-ins or server env names into the bundle. Queue state defaults to `payout-queue.json` beside `STORE_PATH`; all default engine data is git-ignored. Queue events and engine verdicts share the evidence ledger.

## Evidence and remaining validation

The old implementation-pass status table is superseded by the dated records in
[verified.md](docs/verified.md), [transaction evidence](docs/evidence/tx-hashes.md)
and [ai-log](../docs/ai-log.md). These record historical real x402, SDK payouts,
escrow settlement and refunds, including the full engine/photo cycle. This is
not a claim that today's hosted service works.

Known open areas: worker authentication and wallet ownership, actual CIP-30/mobile
wallet compatibility, broader real-photo/OOS evaluation, iPhone app icon,
server persistence/deployment and code cleanup. Current findings, local test
results and limitations are in the [cleanup audit](../docs/cleanup-2026-11-01.md).

Keep fakes and overrides visibly separate from evidence. Templates and starter
pins remain in `docs/verified.md`; do not upgrade dependencies during cleanup.
