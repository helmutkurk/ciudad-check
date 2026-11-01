# apps/engine (@shelfie/engine)

Status: implemented on fakes (Express 4.21.2, TypeScript strict, zod, no database). Links point to the canonical design in `diseno/` at the repo root.

## Purpose
Job, Task, Claim, Submission state machines (all transitions go through `transition()` from `@shelfie/core`); intake filter; challenge codes; soft city check at claim; capture-time geofence precheck; job decision (K rule, default 1 of 1); orchestration of verifier calls and payouts; REST + SSE API; optional static web app; hash-chained evidence ledger (`@shelfie/evidence`).

## Run
```
cd codigo
npm run dev -w @shelfie/engine          # fakes: FAKE_PAYMENTS=1 VERIFIER_PAYMENT=off, 127.0.0.1:4000
npx tsx scripts/smoke.ts                # in a second terminal: end-to-end smoke (see scripts/README.md)
npm test                                # engine tests are apps/engine/src/*.test.ts
```
Dev tokens (`dev-admin-token`, `dev-shell-token`) apply only outside `NODE_ENV=production`; production boot needs 32+ character tokens. Runtime state (journal, ledger, photos) goes to `./data/` next to where you start it (git-ignored): `STORE_PATH` (journal, default `./data/engine-events.jsonl`), `LEDGER_PATH`, and `images/` beside the journal. The ledger is append-only; a ledger that fails verification stops the boot and is never rewritten.

Extra runtime switches (validated by core `EngineEnvSchema`): `CATALOG_DIR`, `WEB_DIST`, `ALLOWED_HOSTS` (comma list, for LAN IP or tunnel host; set `PUBLIC_BASE_URL` for the tunnel), `VERIFY_CLIENT=fake|real`, `PAYMENTS_IMPL`, `PAYOUT_STORE_PATH`, `EVIDENCE_RUN_LOCKED`. `SELLER_ADDRESS` pins the real x402 payee; `PAYOUT_DAILY_CAP_LOVELACE` reaches the queue cap. All names are in the root `.env.example` and contracts §5.

## Layout (`src/`)
- `engine.ts` all domain logic (jobs, claims, submissions, verification queue, payouts watcher, settlement events, admin). Synchronous claim = atomic first-wins. `sweep()` expires claims and closes windows (called on every request and every second by `main.ts`).
- `http/app.ts` routes (every endpoint of contracts section 1); `http/security.ts` headers, token bucket, Host/Origin guards, constant-time auth with lockout.
- `store.ts` `Store` interface + `MemoryStore` with an append-only JSONL journal replayed (and zod-validated) at start. Swap for SQLite behind the same interface.
- `jpeg.ts` upload pipeline (strict base64, SOF dimensions, strips EXIF/XMP/IPTC/COM and trailing data, sha256 of cleaned bytes). `geo.ts` haversine, precheck, city boxes. `catalog.ts`, `pack.ts`, `feed.ts` (SSE hub).
- `wiring.ts` picks fakes or real adapters from env. `fakes/` `FakeVerifyClient` (decides from a marker in the image bytes: `STUB_VERDICT=FAIL_CODE|FAIL_PRICE|PRODUCT_PRESENT`, default PASS) and `FakePayoutQueue` (steps QUEUED, SENDING, SUBMITTED, CONFIRMED through the core machine; hashes are visibly fake).
- `testkit.ts` test rig (FakeClock, sequential ids, in-process server, synthetic JPEG builder).

## Behaviour notes
- Order on submit: schema, claim state, `captureMode` guard, location required, size, **location precheck (no verifier call, no fee, no attempt on failure)**, image pipeline, duplicate hash, then store and queue. One submission per claim; the same photo again returns the same submission.
- Verifier calls run in a serial queue with the key `verify:<submissionId>`; transport errors retry twice with the same key, then `ERROR_FINAL` (task reopens, attempt not counted, operator-alert ledger flag).
- A job decides when its window ends (waiting for in-flight verifications) or all tasks are terminal. `ACCEPTED` counts for K immediately; DELIVER waits for the payout to confirm or the window end. The decision never flips; a late verdict is recorded and ignored.
- An intake-rejected request persists a `REJECTED_INPUT` job without tasks (domain-model 2.1) and returns its id in `error.details.jobId`, so the shell can post `INTAKE_REJECTED`.

## Tests
`engine.test.ts` (API flows on fakes: happy path, rejected-then-retry, attempts exhausted, window expiry, claim TTL and cutoff, intake, duplicates, two racing claims, SSE feed, out of stock, location precheck, capture mode guard, verifier errors, settlement events, admin paths, upload pipeline, log hygiene), `security.sec.test.ts` (admin auth enumeration and lockout, headers, Origin, Host, body limits, rate limit, SSE cap, error hygiene), `units.test.ts` (geo, challenge generator, JPEG, store journal).

## Integration state
- `src/wiring.ts` uses `@shelfie/payments`: `createPayoutAdapter` + `createPayoutQueue` (+ `FilePayoutStore` beside `STORE_PATH`) in every mode (the adapter is the fake one under `FAKE_PAYMENTS=1`); `PAYMENTS_IMPL=engine-fake` swaps in the in-engine `FakePayoutQueue` without loading the wallet SDKs. The verifier client is the in-engine marker-based `FakeVerifyClient` under `FAKE_PAYMENTS=1`; `VERIFY_CLIENT=real` uses `createVerifyClient` (dry endpoint when `VERIFIER_PAYMENT=off`, x402 when `on`). `main.ts` calls `queue.recover()` at start and `queue.pollConfirmations()` every 3 s. Queue `onEvent` appends to the same evidence ledger, with job/task/payout refs and fake/dry flags; its file defaults beside `STORE_PATH`. A socket-free wiring regression proves verify and payout hashes land once in the job ledger.
- `src/domain-pack.ts` uses `shelfPack`, `loadCatalog` and `renderReport` from `@shelfie/domain-shelf` in `main.ts`; the tests keep the local `defaultShelfPack` and a synthetic catalog so they do not move with pack edits.

## TODO / verify Friday
- Real run never exercised: x402 verify client, Evolution payout adapter, W-VBUY balance in `/api/health` (shows `"0"` outside fakes), `SELLER_ADDRESS` is now validated in `EngineEnvSchema` and required for real paid verification.
- Worker identity is the `workerId` body field (contracts); security.md wants a server session cookie (`/api/auth/*`, not in contracts). Not implemented.
- Photo upload is base64 JSON only (multipart is optional in contracts). JPEG only; PNG is refused as `image_not_decodable`.
- Override supports only `pass: true` on an open task (replays the legal state path); payout override and FAILED tasks are not covered.
- City box for Munich is approximate. Admin routes are not refused specifically over the tunnel host (token only).
- No coordinates or display names enter the ledger or logs; worker addresses appear shortened in ledger notes.

## Do not
- Do not change `packages/core` without announcing it and mirroring `contracts.md` in the same commit.
- Do not log mnemonics, tokens, API keys or image bytes. Do not reset the evidence ledger.
- Do not add endpoints that are not in `contracts.md`.

## Dashboard orders (ADR-20)

`Orders` persists reservations in the same Store journal as jobs; POST/GET `/api/orders` and GET `/api/orders/:id` require `X-Brand-Token`. The brand token has no default and needs 32+ characters. `SOKOSUMI_CLIENT=fake` drives the same shell job creation path for local tests, requiring fake verifier/payments and no evidence lock. Orders survive admin reset so the daily cap cannot be bypassed. Idempotent retries use the same `Idempotency-Key`; unknown outcomes need reconciliation, not a new order.

`SOKOSUMI_CLIENT=real` creates one READY coworker Task per store (`POST /v1/tasks`, request verified by A-25; needs `SOKOSUMI_API_TOKEN`, `SOKOSUMI_COWORKER_ID`, `SOKOSUMI_ORGANIZATION_SLUG`). Never combine READY auto-pickup with a second paid agent-job call; see `docs/verified.md` and contracts "Orders".
