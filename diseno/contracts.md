# Contracts

Interfaces between components. JSON examples are illustrative; the zod schemas in `packages/core` are the source of truth once written, and must match this file (change this file first, then the schema, in the same commit).

## 0. Common conventions (read first)

- Base paths: engine `http://localhost:4000/api`, verifier `http://localhost:4021`. Public tunnel exposes only the engine.
- JSON everywhere except photo upload (JSON with base64, see 1.3; multipart is optional).
- IDs are prefixed strings. Timestamps are ISO-8601 UTC strings. Money is a decimal string of lovelace.
- **Error body** (all components):
  ```json
  { "error": { "code": "claim_expired", "message": "Claim expired, claim the task again.", "details": {} } }
  ```
  `code` is stable and machine-readable (`snake_case`); `message` is shown to humans.
- Status codes: 200 ok, 201 created, 202 accepted (async), 400 `invalid_request`, 401 `unauthorized`, 402 payment required (verifier only), 404 `not_found`, 409 conflict states (`task_not_open`, `claim_expired`, `already_submitted`), 413 `image_too_large`, 422 `unprocessable` (schema ok, content not), 429 `rate_limited`, 500 `internal`, 503 `dependency_unavailable`.
- Auth: worker endpoints are open (a worker is identified by `workerId`, a random id kept in the phone's local storage, plus a payout address). Admin endpoints need header `X-Admin-Token: <ADMIN_TOKEN>`. Shell endpoints need `X-Shell-Token: <SHELL_TOKEN>`. Verifier admin endpoints need `X-Admin-Token`. The verifier `POST /v1/verify` is protected by x402 only (plus the optional `X-Engine-Token`, see 3.3).
- Rate limit the public worker endpoints (for example 30 requests per minute per IP) to survive a curious judge.
- CORS: engine serves the web app itself (same origin); no CORS needed. Verifier: none.
- CSP (engine `http/security.ts` and `codigo/vercel.json`, the same value in both): `img-src 'self' data: blob: https://tile.openstreetmap.org`, for the map tiles only. Nothing else changes.

## 1. Engine API (owner: A; consumers: shell, web)

### 1.1 Jobs

**POST /api/jobs** (shell or admin): create a job. MVP scope (ADR-16): one job = one store, one product, one photo, one worker, so `stores` has exactly one entry, `n = 1`, `k = 1`. The arrays and `k` stay in the schema so multi-store jobs can return without a contract change (roadmap); the pack rejects `stores.length > 1` with `intake_rejected` / `multi_store_unsupported` until then.

Order of checks: (1) zod schema -> 422 `input_schema_violation`; (2) **intake filter** (section 1.1a) -> 422 `intake_rejected`; (3) only then tasks are planned and the job becomes `COLLECTING`. A job that fails step 2 is kept as `REJECTED_INPUT` with no tasks (section 1.1a); a step-1 schema failure stores nothing.

Request:
```json
{
  "packId": "shelf-check",
  "source": "shell",
  "externalRef": "sokosumi-task-id-or-demo-uuid",
  "input": {
    "productEan": "4000000000000",
    "stores": [ { "id": "s1" } ],
    "k": 1
  },
  "windowSec": 900
}
```
ADR-17: the input carries **ids only**, no free text. `productEan` and `stores[].id` must exist in the seeded catalogs (section 1.1a); the engine fills in name, aliases, chain, address, city, coordinates and geofence radius from the catalog, and the filled-in values are what tasks, verifier requests and reports use. `k` is optional and defaults to `n` (= 1 in the MVP). Free-text fields (`product.name`, `product.aliases`, `store.name`, `store.address`) are not part of the schema; a request that carries them is a 422 `input_schema_violation`. The brand dashboard form and the Sokosumi hire form (where the platform supports it) fill these ids from `GET /api/catalog` (section 1.1b).

Response 201 (or 200 if `externalRef` exists):
```json
{ "job": { "id": "job_01", "state": "COLLECTING", "n": 1, "k": 1, "windowEndsAt": "2000-01-01T00:00:00Z" }, "tasks": [ { "id": "tsk_01", "state": "OPEN", "spec": {} } ] }
```
Errors: 400 `invalid_request`, 422 `input_schema_violation` (details lists zod issues), 422 `intake_rejected` (section 1.1a), 401.

#### 1.1a Intake filter (admission gate)

With ADR-17 the brand dashboard cannot produce an invalid request (dropdowns, section 1.1b); the filter remains the **backstop** for every path that does not enforce the dropdowns: the Sokosumi hire form (if it has no option fields, *verify Friday*) and direct API calls. Runs inside `POST /api/jobs`, after schema validation and before `planTasks`, so an impossible job never creates tasks. Data: two seeded catalogs in the pack (`packages/domain-shelf/catalog/`), no live lookup.

| Catalog | Fields | Check |
|---|---|---|
| `stores.json` (known Munich stores) | `id`, `chain`, `name`, `address`, `city`, `lat`, `lon`, `geofenceRadiusM` | `stores[0].id` exists and `city == "Munich"`; `lat`/`lon` feed the capture-time location precheck, `geofenceRadiusM` (default 150 when absent) its radius |
| `products.json` | `ean`, `name`, `aliases[]`, `priceMinEur`, `priceMaxEur` | `productEan` exists; the range also feeds the `price_sanity` gate; names and aliases feed `product_match` and the out-of-stock label match |

Source: `investigacion/catalogo/stores.json` and `products.json` (written by another agent, not edited here); on Friday C copies them to `packages/domain-shelf/catalog/`. Exact field names are taken from those files; where they differ from this table, the files win and this table is corrected in the same commit (verify when the files land).

Rejection response (422). The job is stored in the terminal state `REJECTED_INPUT` (domain-model 2.1) with its reasons, and its id is returned in `details.jobId` so the shell can post the `INTAKE_REJECTED` settlement event and the dashboard can show it; no tasks are created and nothing is paid to anyone (Helmut, 2026-10-30; replaces "no job is created"):
```json
{ "error": { "code": "intake_rejected", "message": "Store is not in the supported Munich catalog.",
  "details": { "jobId": "job_...", "reasons": [ { "code": "unknown_store", "field": "input.stores[0].id" } ] } } }
```
Reason codes: `unknown_store`, `unknown_product`, `city_not_supported`, `multi_store_unsupported`, `catalog_mismatch` (a request that came with names or addresses that disagree with the catalog entry of the given id, only possible from paths that resolve free text to ids, such as the Sokosumi fallback). Messages are human-readable so the shell can pass them to the buyer.

Already-escrowed Sokosumi task that fails intake: the shell receives the 422, does **not** submit a result hash and posts a human-readable comment with the reasons on the task (same withhold path as ADR-11), so the buyer's no-result auto-refund applies; no worker was involved, so Shelfie loses nothing but the wait. The shell also posts `settlement-events` `INTAKE_REJECTED` for the ledger. Verify Friday: whether Sokosumi/Masumi lets the agent decline a task before payment (preferred, no escrow at all) or only after lock (then refund after timeout), and how fast that refund arrives.

#### 1.1b Catalog for dropdowns (public, read-only)

**GET /api/catalog** returns the choices the brand form shows, nothing else:
```json
{ "cities": [ { "id": "munich", "name": "Munich",
    "stores": [ { "id": "s1", "name": "Store A", "chain": "Chain X", "address": "Street 1, 80331 Munich", "lat": 48.1255, "lon": 11.6109 } ],
    "products": [ { "ean": "4000000000000", "name": "Example Pale Ale 0.33l" } ] } ] }
```
Store `lat`/`lon` (WGS84 decimal degrees) are the public position of the catalog store, for the worker map (public business data, not worker location). No price ranges are returned. The form sends ids only. The MVP has one city, so the city dropdown has one entry but exists, so adding Berlin later is data, not UI.

**GET /api/jobs/{jobId}** returns the job with tasks, counts (`passed`, `failed`, `open`), `decision`, and `settlement`.

**GET /api/jobs** returns recent jobs (newest first), for the dashboard.

**GET /api/jobs/{jobId}/decision?waitSec=25** (shell): long poll. Returns when the job leaves `COLLECTING`/`DECIDING` or after `waitSec`.
```json
{ "jobId": "job_01", "status": "PENDING" }
```
or
```json
{ "jobId": "job_01", "status": "DELIVER", "outcomes": ["OBSERVED"], "passed": 1, "k": 1, "n": 1, "reportMd": "# Shelf check ...", "reportSha256": "..." }
```
`outcomes` is `["OBSERVED"]` for a price photo or `["OUT_OF_STOCK"]` for an out-of-stock observation; the report text states it ("out of stock at store X, time T"), and an out-of-stock `DELIVER` settles the escrow like any other.

or
```json
{ "jobId": "job_01", "status": "WITHHOLD", "passed": 0, "k": 1, "n": 1, "reason": "no_passing_photo" }
```

**POST /api/jobs/{jobId}/settlement-events** (shell): shell reports Masumi observations.
```json
{ "event": "RESULT_SUBMITTED", "txHash": null, "ref": "masumi-or-sokosumi-id", "note": "" }
```
`event` is one of `ESCROW_LOCKED`, `INTAKE_REJECTED`, `RESULT_SUBMITTED`, `SETTLED`, `WITHHELD`, `REFUND_OBSERVED`. `txHash` is optional but should be set whenever the shell knows one; the engine writes a ledger entry with an explorer URL.

**POST /api/jobs/{jobId}/cancel** (admin).

### 1.2 Tasks and claims

**GET /api/tasks?status=OPEN&lat=..&lon=..** returns tasks a worker can take (`id`, `jobId`, `storeId` (catalog store id, to place the task on the map), store name and address, product name, reward `payoutAmount`, `windowEndsAt`). Coordinates are coarse (rounded to about 1 km); the engine resolves the worker's city and returns only OPEN tasks in that city (without coordinates: 403 `location_required`). Does not leak codes or other workers' ids.

**GET /api/tasks/stream?lat=..&lon=..** (SSE, ADR-17 dispatch): events `task_opened` (full task object, sent to every worker in the city when a task becomes OPEN, including when a claim expires or is released), `task_closed` (`{taskId, reason: "claimed"|"done"|"expired"}`, sent when another worker wins the claim or the task ends) and a 15 s `ping`. The worker page falls back to polling `GET /api/tasks` every 3 s when the stream drops. Delivery is best effort; the claim endpoint is the source of truth. The `task_opened` payload is the same task object, so it carries `storeId` too.

**Worker map (public).** The worker app shows the open tasks on an OpenStreetMap map. Markers use the catalog store position from `GET /api/catalog` (`lat`/`lon`, joined by `storeId`), never worker or claim coordinates. Tiles come from `https://tile.openstreetmap.org` (CSP `img-src`, section 0); the map shows "© OpenStreetMap contributors". No other map provider or script without a new decision.

**Worker location check (soft).** Claiming requires the worker's browser location to fall in the same city as the store. The page calls `navigator.geolocation` at claim time and sends coarse coordinates (rounded to about 1 km; not stored beyond the city decision, only `cityMatch` and `locationSource` are kept). The engine checks them against the city bounding box of the task's store city (Munich in the catalog). This is a demo-grade soft check: browser geolocation is spoofable and the result is a deterrent, not proof of presence (consistent with ADR-12; the challenge code still proves freshness only). If the browser denies permission or the check is disabled (`LOCATION_CHECK=off`, for stage rehearsals indoors), the claim fails with `location_required` unless an admin sets the flag, and any bypass is shown in the ledger.

**Atomic claim (first wins).** `claim` performs OPEN -> CLAIMED as one step; if two workers press at the same moment exactly one gets 201 and the other 409 `task_not_open` (message "Another worker was faster."). A worker with an active claim who claims a second task gets 409 `claim_already_active`.

**POST /api/tasks/{taskId}/claim**
```json
{ "workerId": "wrk_abc", "displayName": "Anna", "payoutAddress": "addr_test1...",
  "location": { "lat": 48.14, "lon": 11.58, "accuracyM": 800 } }
```
Response 201:
```json
{ "claim": { "id": "clm_01", "taskId": "tsk_01", "expiresAt": "...", "ttlSec": 300 },
  "challenge": { "code": "K7Q-4XM", "mode": "handwritten", "instruction": "Write this code on paper and hold it next to the price tag." },
  "task": { "product": "Example Pale Ale 0.33l", "store": "Store A" } }
```
Errors: 409 `task_not_open`, 409 `claim_already_active`, 422 `invalid_payout_address` (must parse as a preprod address), 403 `location_required` (permission denied or missing `location`), 403 `wrong_city` (worker is not in the store's city; `details.storeCity`), 409 `claim_window_closed` (after the claim cutoff, see section 1.6), 429. Repeating the call by the same worker while the claim is active returns the same claim.

Gesture mode (ADR-19, pack default): `challenge` is `{ "code": "", "mode": "gesture", "instruction": "Open the camera when you stand at the product: it shows a hand sign, then you have 90 s for the photo." }`; the gesture is not in the claim response.

**POST /api/claims/{claimId}/challenge** (gesture mode) reveals the hand sign when the worker opens the camera. Response `200 { "claimId", "gesture": { "fingers": 2-5, "side": "left"|"right" }, "revealedAt", "answerWithinSec": 90, "instruction" }`. The first call stores `revealedAt` (engine clock); later calls return the same body (no re-roll, the window does not restart). Errors: 404 `not_found`, 409 `already_submitted`, 409 `claim_expired` (claim not active), 400 `invalid_request` (claim in a code mode). The photo must reach the engine within `answerWithinSec` of `revealedAt` (G6 `challenge_stale`, a normal rejection). A submission before the reveal gets 409 `challenge_not_revealed` (no verify, no fee, no attempt).

**POST /api/claims/{claimId}/release** gives the task back (worker taps cancel).

### 1.3 Submissions

**POST /api/tasks/{taskId}/submissions**
```json
{ "claimId": "clm_01", "outcome": "OBSERVED", "imageBase64": "<jpeg bytes, no data: prefix>", "mimeType": "image/jpeg",
  "location": { "lat": 48.1371, "lon": 11.5754, "accuracyM": 18, "fixAgeMs": 1200 },
  "clientMeta": { "captureMode": "getUserMedia", "width": 1600, "height": 1200, "userAgent": "...",
                  "streamStartedToShutterMs": 8400, "deviceLabelPresent": true } }
```
- `outcome` is `OBSERVED` (default) or `OUT_OF_STOCK` (the worker used "Product not on the shelf", ADR-17); it selects the gate set (verifier-rules.md sections 2 and 2a).
- `location` is read from `navigator.geolocation` when the shutter is pressed (fresh fix, `maximumAge: 0`). It is **required**: missing -> 403 `location_required`.
- `clientMeta.captureMode` must be `getUserMedia`; anything else (`file`, `capture-input`, missing) -> 422 `capture_mode_not_allowed`. `streamStartedToShutterMs` and `deviceLabelPresent` are advisory signals only (a page cannot prove a live capture; section "limits" below). Canvas output has no EXIF; an upload that arrives with camera EXIF is logged as the advisory flag `exifPresent` and never decides.
- **Location precheck (engine, before the verifier, no fee).** `distanceM = haversine(location, store.lat/lon)`. Pass if `distanceM <= geofenceRadiusM + min(accuracyM, ACCURACY_CAP_M)`. Radius from `stores.json` (`geofenceRadiusM`), default `DEFAULT_GEOFENCE_M` = 150; `ACCURACY_CAP_M` default 100. `accuracyM > 300` or `fixAgeMs > 30000` -> 422 `location_inaccurate` ("Wait for a better GPS signal and try again"); otherwise too far -> 422 `location_mismatch` with `details: { distanceM, allowedM }`. Neither failure verifies, charges, burns the code or consumes an attempt; the claim stays active and `locationTries` increments; after `LOCATION_MAX_TRIES` (default 3) the claim is released. `LOCATION_CHECK=off` disables the precheck (flagged rehearsal switch, ledger entry; never in an evidence run). Every outcome writes `LOCATION_CHECKED` to the ledger (distance and pass/fail, not coordinates). Soft check: spoofable and poor indoors; it is a deterrent, not proof.
- **Limits, stated plainly:** the server cannot know that bytes came from a live camera. A modified browser, an emulator or a virtual camera sends the same request, and a phone aimed at a screen or printout is a live capture. The real defences are the single-use challenge code (cannot exist before the claim), the server-side timing gate and duplicate hashes. Camera-only blocks the cheap gallery cheat, not a determined one.
- **Admin test path:** with `ALLOW_TEST_UPLOAD=true` and `X-Admin-Token`, `captureMode: "admin-test"` is accepted for scripted tests and the smoke script; ledger-flagged, must be `false` in every evidence run.
Response 202:
```json
{ "submission": { "id": "sub_01", "state": "VERIFYING", "queuePosition": 1 } }
```
Errors: 403 `location_required`, 422 `location_mismatch` / `location_inaccurate`, 422 `capture_mode_not_allowed`, 409 `claim_expired` / `already_submitted`, 413 `image_too_large` (limit `MAX_IMAGE_BYTES`, default 2 MB after client-side resize), 422 `image_not_decodable`, 422 `duplicate_image`.

**GET /api/submissions/{submissionId}** (worker polls every 2 s or uses SSE):
```json
{ "id": "sub_01", "state": "REJECTED",
  "verdict": { "outcome": "OBSERVED", "pass": false, "failedGates": ["code_match"],
               "workerMessage": "We could not read the code ABC-123 in your photo. Hold the paper closer and try again.",
               "extraction": { "priceText": "2.49", "productText": "Example Pale Ale" } },
  "task": { "id": "tsk_01", "state": "OPEN", "attemptsLeft": 2 },
  "payout": null }
```
On pass, `payout` becomes `{ "state": "QUEUED|SENDING|SUBMITTED|CONFIRMED", "txHash": "...", "explorerUrl": "https://preprod.cardanoscan.io/transaction/..." }`.

### 1.4 Payouts, ledger, health, config

- **GET /api/payouts?jobId=** list with states and tx hashes.
- **GET /api/ledger?afterSeq=0&limit=200** returns EvidenceEntry list; **GET /api/ledger/stream** is Server-Sent Events with the same entry objects (`event: entry`). The dashboard uses SSE with a 3 s polling fallback.
- **GET /api/health** returns `{ "ok": true, "packId": "...", "network": "preprod", "wallets": { "vbuy": { "balanceLovelace": "..." }, "pay": { "balanceLovelace": "...", "queueDepth": 0 } }, "verifier": "up|down", "fakes": { "payments": false, "verifier": false } }`. The dashboard shows a red banner if any `fakes.*` is true or a balance is below `MIN_WALLET_LOVELACE`. A wallet entry may carry `"unknown": true` (balance not readable: no `WALLET_ADDRESS_VBUY` or the Blockfrost lookup failed); the banner ignores it. In real mode the engine reads W-VBUY's balance read-only from Blockfrost preprod (5 s timeout, 60 s cache).
- **GET /api/config** returns pack UI labels, explorer base URL, challenge mode, `secureContext` hint, `demoOverrideEnabled` (so the UI can show the badge).

### 1.5 Admin (header `X-Admin-Token`)

- **GET /api/admin/ping** -> `{ "ok": true }`; 401 without or with a wrong token. The `/dashboard` operator gate uses it before any operator view.
- **POST /api/admin/submissions/{id}/override** `{ "pass": true, "reason": "vision misread, tag visible" }`: only if `ALLOW_DEMO_OVERRIDE=true`; creates a superseding Verdict with `source = MANUAL_OVERRIDE`, ledger entry flagged `demoOverride`. 403 `override_disabled` otherwise.
- **POST /api/admin/payouts/{id}/reconcile**, **/retry**, **/mark-paid** `{ "txHash": "..." }` (see domain-model section 6).
- **POST /api/admin/jobs/{id}/finalize** forces the decision now (used to end a demo job early).
- **POST /api/admin/reset** clears jobs and the engine event log; refused when `NODE_ENV=production` or when any evidence run is flagged `locked`. Never reset the evidence ledger file.

### 1.6 Shell bridge (owner: A; the only shell code of ours)

One file in the fork, called from the starter's `answer(input, journal, deadline)` path (names from the runbook; verify Friday that this is the right seam):

1. Parse the Sokosumi task description / input into the pack's `jobInput` (ids only, ADR-17). The Coworker input schema mirrors it with option fields from `GET /api/catalog` if Sokosumi supports select/enum fields (*verify Friday*); otherwise the shell keeps a free-text fallback that resolves product and store to catalog ids (LLM or fuzzy match) and sends only ids, and an unresolvable request becomes `intake_rejected`.
2. `POST /api/jobs` with `externalRef = sokosumiTaskId`. Idempotent, so a restarted worker resumes.
   A 422 `intake_rejected` is handled as in section 1.1a (no hash, comment with reasons).
3. Long-poll `GET /api/jobs/{id}/decision` until `DELIVER`, `WITHHOLD` or the shell deadline.
4. `DELIVER`: return `reportMd` as the result, so the starter hashes and submits it. `WITHHOLD`: throw the quality-failed error the starter treats as "no hash, no completion", with a human-readable comment on the Sokosumi task (verify Friday: exact mechanism, runbook section 4 says stock behaviour blocks on errors and a "failed" text would be paid).
5. Post `settlement-events` for every Masumi observation the starter already logs.

**Timing budget.** The task window must close well before the Masumi submit deadline: `JOB_WINDOW_SEC` <= submit deadline minus 8 minutes. Inside the window, no new claim is issued after the claim cutoff `windowEndsAt - CLAIM_TTL_SEC - VERIFY_BUDGET_SEC` (`VERIFY_BUDGET_SEC` default 120: a serialised x402 verify takes 20 to 60 s), so a last claim can still be submitted and verified before the window ends; claims after the cutoff get 409 `claim_window_closed`. After the window the engine decides within about 1 minute, and the shell needs the remaining margin (`SHELL_DEADLINE_MARGIN_SEC`, default 300) to hash and submit a `DELIVER` result. Example: submit deadline 30 min after lock -> `JOB_WINDOW_SEC=900` (15 min), cutoff at minute 8 with `CLAIM_TTL_SEC=300`, `VERIFY_BUDGET_SEC=120`. The actual submit deadline is a Masumi/Sokosumi parameter (verify Friday; ask whether it can be shortened). Verified 2026-10-31 (A-25): the starter sets the submit deadline to payment request + 20 min; the shell clamps the `windowSec` it sends to `min(JOB_WINDOW_SEC, deadline - SHELL_DEADLINE_MARGIN_SEC - now - 30 s)`, so a late lock shortens the window instead of outliving the shell ([apps/shell/README.md](../codigo/apps/shell/README.md) Timing).

## 2. Browser package entry points

Web imports shared schemas, types, errors and public env parsing from `@shelfie/core/browser`.
This entry point has no Node built-ins, logger, payment ports or server env names.
`@shelfie/evidence/explorer` exposes explorer URL helpers without filesystem access.
The server entry points remain `@shelfie/core` and `@shelfie/evidence`.

## 3. Verifier service (owner: B for the x402 wrapper, C for the gate)

### 3.1 Paid endpoint

`POST /v1/verify`. Protected by the x402 seller middleware, route key `"POST /v1/verify"`.

Payment requirements (served in the 402 response):
```json
{ "scheme": "exact", "network": "cardano:preprod",
  "price": { "amount": "1000000", "asset": "lovelace" },
  "payTo": "<W-SELL address from env SELLER_ADDRESS>",
  "description": "One shelf-photo verification", "mimeType": "application/json" }
```
- **Price: 1 tADA** (`VERIFY_PRICE_LOVELACE=1000000`). Lovelace routes need at least 1 tADA (min UTxO, x402 runbook), so this is the floor. If the facilitator rejects 1 tADA (verify Friday), use 2000000 and adjust the budget. Price is per check, regardless of pass or fail.
- **Settlement: 0 L1 confirmations** (`extra.confirmationPolicy.l1Confirmations: 0`, `apps/verifier/src/payment.ts`). The paid answer comes once the facilitator has submitted the payment tx. The `@x402/cardano` default of 1 confirmation took about 96 s on preprod (M1 run, `codigo/docs/verified.md`), longer than the buyer timeout and the 20 to 60 s verify assumption in section 1.6. The risk is on the seller only (a tx that never lands leaves W-SELL without the fee). A production verifier chooses its own policy (ADR-18).
- Asset: lovelace, to avoid the two tUSDM token variants (x402 runbook section 1).
- The buyer caps spend: `maxAmountPerPayment = 2000000` (`VERIFY_MAX_PRICE_LOVELACE`). Total per engine run: `VERIFY_RUN_CAP_LOVELACE` (default 50000000); every attempt reserves the per-payment cap, released only when nothing was signed; when the next reservation would exceed the cap the buyer refuses (`run_cap_reached`) without signing. With the durable buyer state (`verify-client.json`) the cap survives a restart: every stored receipt and frozen key counts at the per-payment cap.

Request headers: `Content-Type: application/json`, `Idempotency-Key: verify:<submissionId>`, optional `X-Engine-Token`.

`task.outcome` is `OBSERVED` or `OUT_OF_STOCK` (the worker's claim); the verifier runs the matching gate set and returns the same value in `outcome` (verifier-rules.md sections 2 and 2a). Location is **not** sent: the engine prechecks it (ADR-17).

Request body:
```json
{
  "packId": "shelf-check",
  "submissionId": "sub_01",
  "task": {
    "taskId": "tsk_01",
    "product": { "name": "Example Pale Ale 0.33l", "ean": "4000000000000", "aliases": ["example pale ale"] },
    "store": { "id": "s1", "name": "Store A" },
    "expectedCode": "K7Q-4XM",
    "expectedGesture": { "fingers": 3, "side": "left" },
    "challengeRevealedAt": "2026-10-30T10:00:30Z",
    "outcome": "OBSERVED",
    "claimIssuedAt": "...", "taskWindowEndsAt": "...", "receivedAt": "..."
  },
  "image": { "mimeType": "image/jpeg", "base64": "<bytes>", "sha256": "<hex>" },
  "previousImageSha256": ["<hex of other accepted photos in the same job>"]
}
```
Response 200 (after the paid retry; includes header `PAYMENT-RESPONSE` with the receipt, carrying `transaction`):
```json
{
  "submissionId": "sub_01",
  "outcome": "OBSERVED",
  "pass": false,
  "gates": [
    { "name": "image_ok", "pass": true },
    { "name": "code_match", "pass": false, "reasonCode": "code_mismatch", "detail": { "expected": "K7Q-4XM", "seen": "K7Q-4XN" } }
  ],
  "failedGates": ["code_match"],
  "extraction": { "...": "see verifier-rules.md section 3" },
  "workerMessage": "We could not read the code K7Q-4XM in your photo. Hold the paper closer and try again.",
  "model": { "provider": "env", "id": "env", "latencyMs": 3100 },
  "cached": false
}
```
Errors before payment settles (these must not charge the buyer; the middleware order makes validation errors return before settle only if the handler runs pre-settle, so validation lives in a pre-middleware): 400 `invalid_request`, 413 `image_too_large`, 422 `image_not_decodable`, 503 `vision_unavailable` (verify Friday where in the template's flow a handler error lands relative to settle; the template README says the handler runs after verify and before settle).

A decode failure in pre-payment validation returns HTTP 422 `image_not_decodable` and makes no payment or model call. A gate-level decode failure returns a verdict reason `image_undecodable` under `image_ok`; it is not an HTTP error code.

Idempotency behaviour: the paid handler can run more than once on retries (template README). The handler looks up `Idempotency-Key`; on a hit it returns the cached verdict with `"cached": true` and never calls the vision model again.

### 3.2 Other verifier endpoints

- **GET /health** `{ "ok": true, "packId": "...", "visionConfigured": true }`.
- **GET /v1/price** (free) returns the current price and `payTo`, so the dashboard can show "verification costs 1 tADA per check".
- **POST /v1/verify-dry** (admin, no payment): same body and response as `/v1/verify` without x402; used by the evaluation runner and by the engine's `VERIFIER_PAYMENT=off` dev mode. Absent when `ENABLE_DRY=false`; must be `false` in the evidence runs (the engine refuses to count a dry verdict toward evidence).
- **POST /v1/extract** (admin, no payment): returns only the vision extraction JSON for prompt tuning.

### 3.3 Calling the verifier from the engine

`packages/payments` exposes (illustrative signature):
```ts
interface VerifyClient {
  verify(req: VerifyRequest, key: string): Promise<{ verdict: VerifyResponse; txHash: string; receipt: unknown }>;
}
```
Implementation: `wrapFetchWithPayment(fetch, x402Client)` with signer from `VBUY_MNEMONIC`, `setSpendControls({ allowedAssets: [{ network: "cardano:*", asset: "lovelace", maxAmountPerPayment: VERIFY_MAX_PRICE_LOVELACE }] })`, serial queue per wallet, receipt store keyed by idempotency key. A fake (`VERIFIER_PAYMENT=off`) calls `/v1/verify-dry`.

## 4. Payments package interfaces (owner: B)

```ts
interface PayoutAdapter {            // plain transfer, SDK specifics hidden (verify Friday)
  send(args: { toAddress: string; lovelace: string; metadataTag: string }): Promise<{ txHash: string }>;
  find(args: { metadataTag: string; sinceIso: string }): Promise<{ txHash: string } | null>;  // reconcile
  confirmations(txHash: string): Promise<number>;
  balance(): Promise<string>;
}
interface PayoutQueue {
  enqueue(p: { taskId: string; toAddress: string; lovelace: string }): Promise<Payout>;   // idempotent on taskId
  get(id: string): Promise<Payout>;
  reconcile(id: string): Promise<Payout>;
}
```
Fake adapters: `FakePayoutAdapter` (instant fake hashes, can inject timeouts, duplicates and crashes for tests) and `FakeVerifyClient` (returns scripted verdicts). The engine runs entirely on the fakes with `FAKE_PAYMENTS=1`; the dashboard then shows the red "FAKE PAYMENTS" banner.

## 5. Environment variables (names only; values live in untracked env files)

### 5.1 Shared (all components, loaded from `.env`)

`NODE_ENV`, `NETWORK` (always `preprod`), `LOG_LEVEL`, `PACK_ID`, `ADMIN_TOKEN`, `EXPLORER_TX_BASE` (default `https://preprod.cardanoscan.io/transaction/`), `EXPLORER_ADDRESS_BASE`.

### 5.2 Engine

`ENGINE_PORT`, `PUBLIC_BASE_URL`, `DEFAULT_GEOFENCE_M` (150), `ACCURACY_CAP_M` (100), `LOCATION_MAX_TRIES` (3), `ALLOW_TEST_UPLOAD` (false), `SHELL_TOKEN`, `ENGINE_TOKEN`, `VERIFIER_URL`, `VERIFIER_PAYMENT` (`on` or `off`), `FAKE_PAYMENTS`, `JOB_WINDOW_SEC`, `CLAIM_TTL_SEC`, `VERIFY_BUDGET_SEC`, `LOCATION_CHECK` (`on` or `off`), `CHALLENGE_MODE` (optional: `gesture` | `card-pool` | `handwritten`, overrides the pack, ADR-19), `MAX_ATTEMPTS`, `MAX_IMAGE_BYTES`, `PAYOUT_LOVELACE`, `PAYOUT_MAX_ATTEMPTS`, `PAYOUT_WALLETS`, `VBUY_WALLETS`, `MIN_WALLET_LOVELACE`, `ALLOW_DEMO_OVERRIDE`, `STORE_PATH`, `LEDGER_PATH`, `BLOCKFROST_PROJECT_ID`, `PAY_MNEMONIC_1`, `PAY_MNEMONIC_2` (one variable per payout wallet, never a list), `VBUY_MNEMONIC_1`, `VBUY_MNEMONIC_2`, `VERIFY_MAX_PRICE_LOVELACE`, `VERIFY_RUN_CAP_LOVELACE` (50000000), `FACILITATOR_URL`.

Additional engine names: `SELLER_ADDRESS` (public preprod payee pin, required for real paid verification), `PAYOUT_DAILY_CAP_LOVELACE` (integer lovelace, default 50000000), `ALLOWED_HOSTS` (comma-separated hostnames), `ALLOWED_ORIGINS` (comma-separated exact origins such as `https://app.example.me`, no wildcards, no paths; extra browser origins accepted by the Origin guard on state-changing requests, for a Vercel frontend that proxies `/api`; invalid entries fail boot), `CATALOG_DIR` (catalog directory), `WEB_DIST` (built web directory), `VERIFY_CLIENT` (`fake` or `real`; defaults to fake with fake payments), `PAYMENTS_IMPL` (`package` or `engine-fake`; default package), `PAYOUT_STORE_PATH` (queue file, default `payout-queue.json` beside `STORE_PATH`), `EVIDENCE_RUN_LOCKED` (false; locks admin reset).

### 5.3 Verifier

`VERIFIER_PORT`, `VERIFIER_PAYMENT` (`on` by default; `off` implies dry endpoints unless explicitly disabled and is refused in production), `VERIFIER_MODE` (`stub` or `live`), `VISION_RUN_CAP` (optional positive integer, outbound model-call cap), `SELLER_ADDRESS`, `FACILITATOR_URL`, `BLOCKFROST_PROJECT_ID` (only if running a local facilitator), `VERIFY_PRICE_LOVELACE`, `VISION_PROVIDER`, `VISION_MODEL`, `VISION_BASE_URL`, `VISION_API_KEY`, `VISION_FALLBACK_BASE_URL`, `VISION_FALLBACK_MODEL`, `VISION_FALLBACK_API_KEY`, `VISION_TIMEOUT_MS`, `VISION_MAX_TOKENS`, `ENABLE_DRY`, `IDEMPOTENCY_CACHE_PATH`, `IDEMPOTENCY_TTL_SEC`, `X_ENGINE_TOKEN_REQUIRED`, `ENGINE_TOKEN`.

### 5.4 Shell (names from the starter and runbook; ours are marked)

Starter/Masumi: `COWORKER_ID`, `EVE_PORT`, `EVE_URL`, `PAID_TASKS_ENABLED`, `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_MODEL`, `ZAI_CONTEXT_WINDOW_TOKENS`, `MPS_URL`, `AGENT_API_PORT`, `AGENT_AUTHOR`, `SOKOSUMI_ORGANIZATION_ID`, `SOKOSUMI_ORGANIZATION_SLUG`. MPS side: `DATABASE_URL`, `ENCRYPTION_KEY`, `ADMIN_KEY`, `BLOCKFROST_API_KEY_PREPROD`, `PORT`.
Ours: `ENGINE_URL`, `SHELL_TOKEN`, `SHELL_DECISION_POLL_SEC`, `SHELL_DEADLINE_MARGIN_SEC`.

### 5.5 Web (build-time)

`VITE_API_BASE` (empty for same origin), `VITE_DEMO_BADGES`. Dev proxy only: `VITE_ENGINE_URL` (defaults to loopback at `ENGINE_PORT`, or 4000). It is not needed in the browser runtime.

### 5.6 Hub scripts

`TUNNEL_PROVIDER`, `TUNNEL_URL_FILE`, `HUB_LAN_IP`. Funding check: `WALLET_ADDRESS_VBUY`, `WALLET_ADDRESS_PAY`, `WALLET_ADDRESS_MPS` (public preprod addresses), `SELLER_ADDRESS`, `BLOCKFROST_PROJECT_ID`, `MIN_WALLET_LOVELACE`. All addresses and network configuration are validated before a request.

Never commit values; ship `.env.example` files with names only. Wallets are throwaway.

## 6. Domain pack config shape (owner: C)

Declarative `pack.config.json` plus a TypeScript module for logic. Illustrative:

```json
{
  "id": "shelf-check",
  "version": "1",
  "jobInputSchemaRef": "./schemas/job-input.schema.json",
  "worker": {
    "kind": "human",
    "capture": "photo",
    "challenge": { "mode": "gesture", "alphabet": "ABCDEFGHJKMNPQRSTUVWXYZ23456789", "length": 6, "ttlSec": 300, "cardPool": null },
    "maxAttempts": 3,
    "instructions": ["Find the product", "Write the code on paper", "Hold it next to the price tag", "Take one photo, tag and code readable"]
  },
  "extraction": {
    "promptRef": "./prompts/extract.md",
    "outputSchemaRef": "./schemas/extraction.schema.json",
    "imageRequired": true
  },
  "rules": [
    { "name": "image_ok",      "params": { "minWidth": 800, "minHeight": 600, "maxBytes": 2000000 } },
    { "name": "code_match",    "params": { "maxEditDistance": 0, "minConfidence": 0.7 } },
    { "name": "readable",      "params": { "minConfidence": 0.6, "requirePrice": true } },
    { "name": "product_match", "params": { "minTokenScore": 0.8, "eanOverrides": true } },
    { "name": "price_sanity",  "params": { "minEur": 0.2, "maxEur": 60, "maxDeviationFromRef": 0.6 } },
    { "name": "timing",        "params": { "minSecondsAfterClaim": 5 } },
    { "name": "not_duplicate", "params": {} }
  ],
  "outOfStock": {
    "enabled": true,
    "rules": [
      { "name": "image_ok", "params": {} },
      { "name": "code_match", "params": { "maxEditDistance": 0, "minConfidence": 0.7 } },
      { "name": "label_visible", "params": { "minConfidence": 0.6 } },
      { "name": "label_match", "params": { "minTokenScore": 0.8, "eanOverrides": true } },
      { "name": "slot_empty", "params": { "minConfidence": 0.7 } },
      { "name": "timing", "params": { "minSecondsAfterClaim": 5 } },
      { "name": "not_duplicate", "params": {} }
    ],
    "payoutLovelace": "3000000",
    "reportTemplateRef": "./report/oos.md.hbs"
  },
  "location": { "defaultGeofenceM": 150, "accuracyCapM": 100, "maxAccuracyM": 300, "maxFixAgeMs": 30000, "maxTries": 3 },
  "payout": { "amountLovelace": "3000000", "perTask": true },
  "jobInput": { "idsOnly": true, "maxStores": 1, "catalogs": { "stores": "./catalog/stores.json", "products": "./catalog/products.json" }, "city": "Munich" },
  "settlement": { "rule": "k-of-n", "kDefault": "n", "earlyDeliver": false },
  "report": { "templateRef": "./report/report.md.hbs", "columns": ["store", "price", "verdict", "evidenceTx", "payoutTx"] },
  "ui": { "taskTitle": "Check {product} at {store}", "claimButton": "Take this task", "doneMessage": "Verified. Payment sent." }
}
```
`settlement.kDefault` is `n`, and `maxStores` is 1 in the MVP, so every job is N=1, K=1 (ADR-16). Raising `maxStores` and `k` re-enables multi-store jobs without engine changes (roadmap).

Rule names map to functions exported by the pack module (`rules.ts`); unknown names fail startup. Thresholds are tuned from the 20-photo run (verifier-rules.md section 7), not guessed.

For Plan B the same shape holds with `worker.kind = "agent"`, `challenge = null`, other rules and `payout.amountLovelace = "0"` (queue idle).

## Orders (ADR-20, amended Helmut 2026-10-30; per-brand access codes ADR-21)

All endpoints require `X-Brand-Token` in the header, never query/body. Each brand has its own access code (ADR-21, env `BRAND_ACCOUNTS`; `BRAND_TOKEN` alone is the brand `demo`). The engine stores `brandId` on every order and scopes every read and write to the caller's brand: `GET /api/orders` lists only its orders, `GET /api/orders/{id}` answers `not_found` for another brand's order (same answer as a missing one), and an `Idempotency-Key` used by another brand gets the 409 below. Orders written before `brandId` existed belong to `demo`. The daily credit cap stays global. Reads/writes rate limited; no-store responses.

- `POST /api/orders {productEan, storeIds: string[], note?: string}` -> 201 `{orderId, productEan, createdAt, fake, jobs:[{storeId, sokosumiTaskId:null|string, jobId:null|string, status, credits?, result?}]}`. Per job: `credits` is the Sokosumi price of that store's Task, recorded when the Task is created (absent if unknown; never estimated); `result` (B-17, derived at read time, never stored) is `{outcome: "passed"|"out_of_stock"|"failed"|"timed_out"|"open", priceEur?, reason?, reportReady}` with `priceEur` from the accepted photo of a passed price check and `reason` the plain-words verdict message of a failed one. Unique catalog store ids, one product, bounded note (500 characters; API only, never forwarded to Sokosumi or logs). Optional `Idempotency-Key` (8-100 URL-safe characters) deduplicates identical orders; different input with the same key returns 409 `invalid_request`.
- `GET /api/orders/{id}` -> same order view, status derived from engine job and settlement observations.
- `GET /api/orders` -> `{orders:[<order view>]}`, newest first, the caller's brand only.
- `GET /api/brand/me` (ADR-21, same access code, same rate limit) -> `{brandId, name, walletAddress: string|null, creditsReservedToday, dailyCreditCap, maxCreditsPerTask, maxStores, fake}`. `walletAddress` is the brand's preprod address (`addr_test1...`) or null for the demo brand; `creditsReservedToday` is this brand's reservations on the current UTC day; the caps are the engine's (`ORDER_DAILY_CREDIT_CAP`, `SOKOSUMI_MAX_CREDITS_PER_TASK`, `ORDER_MAX_STORES`); `fake` mirrors `/api/config.orders.fake`. The access code is never returned.
- `GET /api/brand/summary` (B-17, same access code and rate limit) -> `{credits:{spent, refunded, unpricedChecks}, checks:{passed, failed, timedOut, open}}`, derived only from the caller's own order rows and their jobs. `spent` = recorded credits of delivered/settled checks, `refunded` = recorded credits of withheld/refunded checks (escrow refund path), `unpricedChecks` = such checks with no recorded price (counted, not estimated). The recorded price comes from Sokosumi: the create answer has no price yet (0), so once the shell links a job the engine reads `totalCredits` with `GET /v1/tasks/{id}` (background, at most once a minute per check, on summary and order list reads) and stores it on the row. `passed` = decision DELIVER; `failed` = withheld with a rejected photo; `timedOut` = withheld without one; `open` = still running; cancelled or rejected-input checks are not counted. Credits are Sokosumi preprod test credits.
- `GET /api/brand/transactions` (B-17, same access code) -> `{transactions:[{orderId, storeId, jobId, kind, txHash, explorerUrl?, ts?}]}`, newest order first, chronological within a check. `kind`: `escrow_lock`, `result_submitted`, `settlement`, `refund`, `verifier_fee` (x402), `worker_payout`. Sources: ledger entries and settlement escrow refs of the jobs that belong to the caller's orders, and payouts of those jobs' tasks; another brand's jobs are never selected. `explorerUrl` is omitted for fake orders and non-64-hex hashes.
- Errors: 401 `brand_token_missing` / `brand_token_invalid`; 404 `not_found` (also for another brand's order); 422 `intake_rejected` with `details.stores:[{storeId,reasons}]` (entire order rejected before purchase); 429 `order_cap_reached` / `daily_cap_reached`; 502 `sokosumi_unavailable` with `details.orderId`. Generic abuse throttling remains 429 `rate_limited`.
- Status before a job exists: `SUBMITTING`, `AWAITING_SHELL`, `SOKOSUMI_UNAVAILABLE` (outcome unknown; no automatic repurchase). While collecting, show the worker task state (`OPEN`, `CLAIMED`, `VERIFYING`, etc.); after decision, use the engine job state including `DELIVERED`, `SETTLED`, `WITHHELD`, `REFUNDED`. A delivery decision alone is not proof of settlement.
- Persist orders and worst-case credit reservations in the engine Store journal **before** outbound requests. UTC-day cap counts all reserved credits, including ambiguous failures, across restarts; no automatic retries/release. Admin reset clears jobs but preserves order credit reservations. One engine process only.
- Each Task description contains ids-only JSON `{orderId, storeId, productEan}`. Bridge forwards correlation as optional `orderRef:{orderId,storeId}` on `POST /api/jobs`; `externalRef` remains the Sokosumi Task id. Engine validates order/product/store and binds the Task id once; legacy jobs omit `orderRef`. Fake client invokes this same engine creation method with visibly fake Task ids; no synthetic escrow events or tx hashes.
- Real client (B-16, request shape verified by A-25): one READY coworker Task per store, `POST /v1/tasks` with `Authorization: Bearer <SOKOSUMI_API_TOKEN>`, `X-Organization-Slug`, body `{ coworkerId, name, description, status: "READY" }`, `description` = `{"orderId","storeId","productEan"}` (the bridge's order correlation). Only Tasks are created, never an agent Job, so there is exactly one paid mechanism per store (the shell worker requests the Masumi payment). Task id from `data.id` (reported through `onCreated` before anything else); a returned `credits` above `SOKOSUMI_MAX_CREDITS_PER_TASK` is reported as `sokosumi_unavailable` (`task_above_credit_cap`, Task id kept for reconciliation), because Sokosumi has no cap in the create call. Bounded JSON, no redirects, 15 s timeout, no retry, no upstream body exposed.
- Fake orders require fake payments and verifier and are refused in evidence-locked runs. All their engine ledger entries carry `fakeSokosumi:true`, rejected by evidence preflight. `/api/config.orders` exposes `fake`, `enabled`, `realReady`, `maxStores` and `maxCreditsPerTask`. Real orders (ADR-22, B-17): `enabled` is true when a brand account exists and either the fake combination holds or `SOKOSUMI_CLIENT=real` with `SOKOSUMI_API_TOKEN`, `SOKOSUMI_COWORKER_ID`, `SOKOSUMI_ORGANIZATION_SLUG`, real payments (`FAKE_PAYMENTS=0`) and `VERIFY_CLIENT=real`; `realReady` is true exactly in that real case. The engine also reads optional `WALLET_ADDRESS_VBUY` for the health balance.
- Operator override response: `{verdict:{id,pass,source:"MANUAL_OVERRIDE"}}`; uses the existing authenticated admin endpoint.

Engine-only env (names also in `codigo/.env.example`): `SOKOSUMI_CLIENT=fake|real` (default fake), `SOKOSUMI_API_URL` (default `https://api.preprod.sokosumi.com`), `SOKOSUMI_API_TOKEN`, `SOKOSUMI_COWORKER_ID`, `SOKOSUMI_ORGANIZATION_SLUG` (real mode; `SOKOSUMI_AGENT_ID` is no longer used), `SOKOSUMI_MAX_CREDITS_PER_TASK` (positive safe integer, default 100 ceiling, not a quote), `ORDER_MAX_STORES` (default 5), `ORDER_DAILY_CREDIT_CAP` (default 500), `BRAND_TOKEN` (32+ characters when configured; required for real mode unless `BRAND_ACCOUNTS` is set, no default), `BRAND_ACCOUNTS` (ADR-21: `id|name|addr_test1...|token` entries separated by `;`; id `[a-z0-9-]{2,40}`, name 1-60 characters, preprod address only, token 32+ characters, unique ids and tokens; id `demo` is reserved). Missing brand config disables orders. Real mode requires token, coworker id and organization slug and refuses non-preprod URLs. There is no verified quote in the current catalog; show price unavailable. Future quotes must retain their source; credit ceilings are labelled ceilings, never advertised as actual prices. Client mode is public in `/api/config` as `orders.fake`; all credentials remain server side.
