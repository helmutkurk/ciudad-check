# Decisions (ADR style)

Short records. Status "accepted" means: build on it unless a "verify Friday" item turns it over; the fallback is named in each record. Changes are appended as a new ADR, not edited silently.

## ADR-01 Verified micro-task engine with a domain pack
- **Decision:** one generic engine (`Job -> Tasks -> Worker -> Verifier -> Settlement`); Shelfie is the `shelf-check` pack; Plan B (`letter-decoder`) is another pack.
- **Alternatives:** build Shelfie directly (faster at first, a pivot would rewrite everything); build a plugin system with dynamic loading (over-engineered).
- **Consequences:** a small interface to maintain (`DomainPack`); all shelf strings and thresholds live in the pack; worker kinds `human` and `agent` and optional challenge are in the engine from day one. Cost: roughly an hour of extra structure.

## ADR-02 x402 for the verifier, priced per check
- **Decision:** the verifier sells `POST /v1/verify` behind the x402 seller middleware at 1 tADA per check, paid by the engine from `W-VBUY`.
- **Alternatives:** call the verifier in-process (no agent-pays-agent proof, loses the track's point); Sokosumi credits for the verifier (no tx hash we control; runbook: credits are not x402); Masumi-escrow x402 variant (4+ hours, only if time remains).
- **Consequences:** every check, pass or fail, is a visible on-chain payment and a ledger entry; latency of 20 to 60 s per check serialises on one wallet (ADR-08); fails cost money (stated as verification spend). Price floor is 1 tADA; verify Friday that the facilitator accepts it, else 2 tADA.

## ADR-03 Lovelace as the payment asset
- **Decision:** price and payouts in tADA, not tUSDM.
- **Alternatives:** tUSDM (two incompatible token variants; the dispenser and SDK tokens differ, x402 runbook).
- **Consequences:** payments have min-UTxO floors; the pitch uses ADA amounts with an EUR equivalent as illustration only.

## ADR-04 Direct transfer for worker payouts
- **Decision:** workers are paid by a plain Cardano transfer from `W-PAY`, queued and idempotent (domain-model section 6).
- **Alternatives:** per-worker Masumi escrow (heavy, ≥60 min cycle); making the worker's phone page an x402 seller so the engine "pays via x402" (adds a second payment protocol and a seller per phone).
- **Unverified:** whether the Cardano SDK in the x402 template (`@evolution-sdk/evolution`) can build and submit plain transfers with metadata. **Verify Friday (B, before 13:00).**
- **Fallback order:** (1) SDK transfer; (2) Lucid or Mesh library for the transfer only, isolated behind `PayoutAdapter`; (3) the worker's address as an x402 `payTo` of a tiny seller route on the engine ("claim your reward" paid by the engine), which reuses the known-good x402 path; (4) manual operator payout with `mark-paid` for the last-resort demo (flagged).
- **Consequences:** the payout path has its own failure modes (UTxO contention, unknown outcome), handled by the queue and reconcile.

## ADR-05 Escrow job runs early; stage shows recorded settlement
- **Decision:** start the first Masumi paid cycle Friday afternoon, run the no-passing-photo/refund job Friday night (single-photo job, ADR-16), and do the last paid cycle by 13:00 Saturday. On stage, the live part is the verify (x402) and payout leg; settlement and refund are shown from recorded runs with explorer links.
- **Alternatives:** wait for settlement live (at least 60 min, not possible); skip escrow (loses "pay on result"). 
- **Consequences:** the demo says "this settlement is from an earlier run" explicitly; the engine and shell must make it easy to label runs (ledger entries carry `jobId`).

## ADR-06 Tunnel (HTTPS) over LAN for phones
- **Decision:** expose only the engine through a public HTTPS tunnel; the worker page uses in-app `getUserMedia`. LAN with `<input capture>` is the automatic fallback.
- **Alternatives:** LAN only (HTTP: no in-app camera, possible gallery uploads, venue Wi-Fi may isolate clients); deploy engine to a cloud host (needs secrets and wallets off the laptops; slower to iterate).
- **Amended by ADR-17:** the LAN fallback no longer allows `<input capture>` or any submission; over HTTP the worker page is read-only. Secure alternatives to a tunnel on the venue LAN: HTTPS with a locally trusted certificate (mkcert, verify Friday on iOS and Android), a second tunnel provider, or Android Chrome with a loopback `adb reverse` (secure context on localhost).
- **Consequences:** a hostname that changes on tunnel restart (never restart mid-demo; the dashboard QR code is regenerated); dependency on tunnel provider uptime. Verify Friday that the chosen tunnel tool works without an account at the venue.

## ADR-07 Vision model and provider are configuration
- **Decision:** `VisionClient` adapters selected by `VISION_PROVIDER`/`VISION_MODEL`; the model is chosen by the 20-photo evaluation (verifier-rules.md section 7), not in advance. The model reads; deterministic code decides; the model never sees the expected code or price.
- **Alternatives:** hard-wire one provider; let the model score "looks valid" (opinion, not auditable).
- **Amended (Helmut, 2026-10-29):** defaults chosen: primary Google Gemini Flash through its OpenAI-compatible endpoint, fallback OpenAI, so one OpenAI-compatible adapter serves both (`VISION_BASE_URL` and `VISION_MODEL` differ, plus `VISION_FALLBACK_*`). The 20-photo evaluation, now including out-of-stock cases, confirms or swaps primary and fallback. Exact model ids and the endpoint URL: verify Friday.
- **Consequences:** switching provider is an env change if the adapter exists; at least one OpenAI-compatible adapter is built first. The agent shell's LLM (ZAI variables in the starter) is independent and may not support images (verify Friday).

## ADR-08 Separate wallets and one serial queue per wallet
- **Decision:** `W-VBUY` (verify), `W-PAY` (payouts), `W-SELL` (verifier income) are distinct; each sender wallet has concurrency 1; optional round-robin across several wallets of the same purpose.
- **Alternatives:** one wallet for all (UTxO contention, runbook warning); a wallet per worker (not our wallets to hold).
- **Consequences:** more funding steps (three wallets); the throughput ceiling is the confirmation latency; the worker page shows queue position; the demo script staggers submissions.

## ADR-09 Workers are paid at verifier pass, not at job settlement
- **Decision:** a passed task triggers its payout immediately, even if the job later fails K-of-N and the brand is refunded.
- **Amended by ADR-16:** with single-photo jobs (N=1, K=1) a PASS always delivers the job, so the case "worker paid, job refunded" no longer occurs; the rule "pay at pass" stays and matters again only if multi-store jobs return.
- **Alternatives:** hold payouts until the job settles (cleaner economics, kills the live "photo goes green, payout appears" moment and delays pay by an hour or more).
- **Consequences:** Shelfie bears the cost of workers on a failed job; recorded in the ledger as `COST_BORNE`; the pitch says so ("we pay workers for verified work, regardless of the brand's threshold"). For a real product, K would be chosen so that the risk is small, or payouts would be funded from the job budget.

## ADR-10 Simple persistence behind a Store interface
- **Decision:** in-memory state plus append-only event log on disk, replayed at start; hash-chained JSONL for the evidence ledger.
- **Alternatives:** SQLite (better queries, native build risk on four different laptops, and Postgres is already needed for MPS but is a separate service); Postgres reuse (couples our state to MPS).
- **Consequences:** no ad-hoc queries; fine for tens of records; a crash loses nothing that was flushed (write-ahead before every chain call). Swap to SQLite behind the same interface if time allows, not otherwise.

## ADR-11 Withhold-the-result to trigger refunds
- **Decision:** when the job decision is WITHHOLD (MVP: no passing photo before the window closes; also an intake rejection of an escrowed task) the shell submits no result hash and does not complete the task, so the buyer's no-result auto-refund applies.
- **Alternatives:** submit a "failed" result (the seller is paid: runbook section 4); request a refund through the API (needs the buyer side, slower, extra roles).
- **Consequences:** the refund arrives only after the timeout window (about 30 min after the submit deadline, estimate), so it is recorded on Friday and shown from recording. The Sokosumi task must carry a human-readable explanation. Verify Friday exactly how the starter lets a task end without a hash (runbook marks stock behaviour as blocking on errors).

## ADR-12 Challenge code proves freshness, not location
- **Decision:** a random, single-use, short-lived code, written by the worker or from a printed card, must appear in the photo. It is combined with server-side timing and image-hash duplicate checks.
- **Alternatives:** GPS (spoofable, privacy-heavy); EXIF time (editable); store-owned QR codes (needs stores; roadmap).
- **Amended by ADR-17:** a capture-time geofence precheck (distance to the store coordinates) is added; it is soft and spoofable, so the sentence "proves freshness, not location" stays true for the code itself.
- **Consequences:** an honest limit in the pitch; the `card-pool` mode exists as a stage-reliability option; the code must be readable by the model (evaluation decides handwritten vs card).

## ADR-13 Demo override exists, is off by default, and is always visible
- **Decision:** an admin-only override with mandatory reason, off for all evidence runs, flagged in ledger, dashboard and report.
- **Alternatives:** no override (a vision failure on stage ends the demo); open override (undermines the whole claim of verified payouts).
- **Consequences:** credibility depends on never using it silently; the Devfolio text states its existence.

## ADR-14 One hub laptop for the demo
- **Decision:** engine, verifier, shell, MPS and Postgres run on one machine during the demo; development happens on all four laptops against fakes.
- **Alternatives:** distribute across laptops (cross-network URLs, more failure points, four machines awake).
- **Consequences:** a single point of failure; mitigated by a recorded perfect run as stand-by and a second laptop prepared with the same env set (cold spare, not running).

## ADR-15 Shell kept as a thin fork
- **Decision:** fork the starter with minimal diff (one bridge file, env additions); logic in TypeScript packages.
- **Alternatives:** rewrite the shell in TypeScript (risky around Masumi's escrow adapter, journals and settlement checks); put engine logic inside the shell (untestable without Sokosumi).
- **Consequences:** a JavaScript exception to the TypeScript rule; merging upstream changes is not needed during the event.

## ADR-16 MVP scope: single-photo jobs, intake filter, soft worker-location check (Helmut, 2026-10-29)
- **Context:** the first design had a job cover N stores with a K-of-N rule (example N=5, K=3). If some photos passed but fewer than K, workers were already paid at verifier pass (ADR-09) while the brand was refunded: a Shelfie loss and a long, fragile demo with several workers and photos. Separately, nothing stopped a brand from asking for a job nobody can do (unknown store, product that does not exist, city we have no workers in), and nothing tied a worker to the store's city.
- **Decision:**
  1. **One job = one store, one product, one photo, one worker (N=1, K=1).** Photo passes the verifier -> worker payout, report delivered, escrow settles. Photo fails -> the worker may retry with a new challenge code until `maxAttempts` or the window end; no passing photo by then -> result withheld -> buyer auto-refund (ADR-11; M5 still exists, now with N=1). The engine stays generic: `jobInput.maxStores` is 1 and `settlement.kDefault` is `n` in the pack, so multi-store K-of-N returns by configuration (product-roadmap.md section 4a).
  2. **Intake filter before acceptance.** `POST /api/jobs` validates the job against seeded catalogs of known Munich stores (id, chain, address, city) and products (EAN, name, plausible price range) after the schema check and before tasks are planned. Rejection: 422 `intake_rejected` with reason codes; the job is kept as `REJECTED_INPUT` (id in `details.jobId`) with no tasks (Helmut, 2026-10-30; earlier text: "no job, no tasks"). An already-escrowed Sokosumi task that fails intake is withheld by the shell (no hash, comment with the reasons), so the buyer is refunded with no worker involved. Verify Friday: whether Sokosumi/Masumi lets the agent decline before escrow locks, and the refund latency.
  3. **Soft worker-location check.** Claiming needs browser geolocation and the worker must be in the store's city (coarse, city level). Demo-grade deterrent, spoofable, not proof; the challenge code still proves freshness only (ADR-12).
  4. **Timing.** The task window closes at least 8 minutes before the Masumi submit deadline, and no claim starts after `windowEndsAt - CLAIM_TTL_SEC - VERIFY_BUDGET_SEC`, so retries and a serialised x402 verify fit (contracts.md section 1.6). The submit deadline value is verify Friday.
- **Alternatives:**
  - Keep K-of-N multi-photo jobs: richer demo and story ("ten stores"), but partial-delivery losses (paid workers, refunded job), several workers and wallets in the demo, longer window. Rejected for the MVP.
  - Multi-photo with partial payment (pay the brand pro rata per passed store): fixes the loss but needs per-store escrow or partial settlement, which the stock Masumi flow is not known to support (verify Friday), and a more complex report and refund. Rejected for the MVP.
  - No intake filter (accept anything, fail at the window end): costs the brand a full wait and the verifier fees. Rejected.
  - GPS or radius-level location proof: spoofable and privacy-heavy (ADR-12); a city-level soft check is cheap and explainable.
- **Consequences:**
  - Remaining Shelfie loss: one verifier fee (1 tADA) per rejected attempt (up to `MAX_ATTEMPTS`, default 3), plus the wait for the refund. Workers are paid only on PASS, which delivers the job, so no worker cost on a refunded job.
  - Brands that want ten stores place ten jobs (or wait for the roadmap bundle); the pitch persona asks about one store.
  - The catalogs are seed data to maintain (and a source of "demo is staged" criticism; state it). Out-of-catalog requests are refused by design.
  - Location check may fail indoors or when permission is denied; `LOCATION_CHECK=off` is a flagged rehearsal switch.
  - Amended by ADR-17 (catalog-only dropdowns, dispatch to all workers, capture-time geofence, out-of-stock observation).
  - Amends ADR-05, ADR-09, ADR-11 wording (K-of-N failure becomes "no passing photo").

## ADR-17 Dispatch to all workers, camera-only capture, location at capture, catalog-only requests, out-of-stock observation (Helmut, 2026-10-29)
- **Context:** after ADR-16 the open points were: how a task reaches a worker (a list to browse), whether the photo must come from the live camera (the LAN fallback in ADR-06 allows gallery files on some phones), where the worker is when the photo is taken (ADR-16 only checks the city at claim), whether a brand can still ask for something impossible (free-text fields), and what a worker does when the product is not on the shelf (the task would just expire and the brand would be refunded, although "not on the shelf" is the very fact the brand wants).
- **Decision:**
  1. **Dispatch (a).** A new job's task is shown to all workers in the job's city (Munich) the moment it is OPEN (feed filtered by coarse location, pushed by SSE with a 3 s polling fallback). The first worker whose `claim` request the engine processes wins (atomic compare-and-set on the task state; the engine is single-process, so one in-memory transition decides); every other client sees the task disappear (`task_closed` event, or 409 `task_not_open` on a late claim). The claim TTL stays (`CLAIM_TTL_SEC`, default 300 s): when it expires or the worker gives the task back, the task returns to OPEN and is shown to everyone again. A worker can hold one active claim at a time.
  2. **Camera only (b).** The photo must be taken in the app with the live camera (`getUserMedia`, frame drawn from the video track to a canvas); no file picker, no gallery, no `<input type=file>`. Over the non-secure LAN fallback (HTTP) **there is no submission at all**: the page is read-only there (feed and task detail), the capture step shows "Open this page over the secure link to take the photo", and the engine rejects any submission whose `clientMeta.captureMode` is not `getUserMedia` (422 `capture_mode_not_allowed`). The LAN fallback is replaced by secure alternatives (architecture.md section 4). `<input capture>` is not used, not even "flagged": a flagged path would be the exact gallery hole this decision closes, and nothing in the browser lets a page tell a gallery pick from a fresh shot.
  3. **Location at capture (c).** When the shutter is pressed the page reads `navigator.geolocation` (high accuracy, fresh fix, max age 0) and sends `{lat, lon, accuracyM, fixAgeMs}` with the submission. The **engine prechecks it before calling the verifier**: distance to the store's coordinates (`lat`, `lon`, `geofenceRadiusM` from `investigacion/catalogo/stores.json`, copied into the pack catalog; default radius 150 m) must be at most `geofenceRadiusM + min(accuracyM, ACCURACY_CAP_M)`, with `ACCURACY_CAP_M` default 100 m; a fix with `accuracyM` above 300 m or `fixAgeMs` above 30 s is `location_inaccurate`. Fail = 422 `location_mismatch` / `location_inaccurate`, **no x402 fee, no verifier call, no attempt consumed, the claim stays active** (max `LOCATION_MAX_TRIES`, default 3, then the claim is released). Rationale for a precheck instead of a verifier gate G8: the failure is known from engine data alone, so a gate would charge 1 tADA to reject something free to reject; the verifier stays stateless about stores; the result is still written to the ledger (`LOCATION_CHECKED`) and shown on the verdict panel. Soft check: browser geolocation is spoofable (mock-location apps, browser dev tools) and indoors accuracy is poor; it raises the cost of cheating, it is not proof (ADR-12 still applies for freshness).
  4. **Catalog-only requests (d).** Brands choose city, store and product from dropdowns fed by the catalogs (`GET /api/catalog`); the brand form has no free-text field. The job input carries ids only (`storeId`, `productEan`); the engine fills names, aliases, address and coordinates from the catalog. The intake filter (ADR-16) stays as backstop for every path that cannot enforce it in the UI (Sokosumi hire form, API). Whether the Sokosumi/Masumi input schema supports option/select fields: verify Friday.
  5. **Out of stock (e).** Besides the price-tag photo, a worker can submit a second kind of observation, `OUT_OF_STOCK`: the empty shelf spot where the product should be, with the shelf-edge label of the product readable, the facing above it empty, and the challenge code in frame. The vision model extracts; deterministic gates decide a separate verdict (verifier-rules.md section 2a). Accepted: the worker is paid exactly as for a price photo, the job is delivered with an "out of stock at store X, time T" report, and escrow settles (the brand paid for the observation, not for the presence of the product). Rejected: same retry rules as a normal rejection.
- **Alternatives:**
  - Assign by distance or round-robin: fairer, needs live positions and an assignment step; first-claim is simple and shows well on stage. Cost: fast scripters win; rate limit and wallet-bound identity are the only brakes (roadmap: reputation).
  - Keep `<input capture>` as a flagged LAN fallback: it keeps phones working on the venue LAN but can be defeated by a gallery pick on some phones. Rejected; secure alternatives exist (below, architecture.md).
  - Location as verifier gate G8: one more reason code in one place, but costs 1 tADA per rejected attempt and puts catalog data into a stateless service. Rejected; if C prefers it, the precheck function can move without changing the contract (the response codes differ, see contracts.md).
  - Free text plus intake filter only (ADR-16): rejects impossible requests after the fact instead of preventing them. Kept as backstop only.
  - Treat "product not on shelf" as a failed task (refund): the brand pays nothing, but it learns nothing, the worker is unpaid for a true and valuable observation, and workers would be tempted to photograph any other tag. Rejected.
  - Let the model decide "out of stock" from a general shelf photo: opinion, not auditable. Rejected; the model only reads the label text and describes the facing, code decides.
- **Consequences:**
  - Honest limits, to state in the pitch: a web app cannot prove that a frame came from a live capture (a modified browser, an emulator, a virtual camera or a phone pointed at a screen or printout produce the same stream). What actually defends the photo is the single-use challenge code (cannot exist before the claim), server-side timing (G6) and duplicate hashes (G7); camera-only removes the cheap attack (gallery), not the determined one. Location is a deterrent and a way to catch honest mistakes.
  - Out-of-stock risk: a lazy or dishonest worker can claim "empty" without finding the product, or clear a facing before the photo. Mitigations: the label must match the product (EAN or name) and be readable, the facing must be seen empty, location and code apply as usual, the payout equals the price-photo payout (no incentive to prefer OOS), the report states what was observed ("no product at the label's shelf spot at time T"), not "not stocked", and the ledger keeps the photo. A per-worker OOS ratio flag and second-worker sampling are roadmap. The evaluation must include OOS cases (verifier-rules.md section 7).
  - New engine surface: SSE task feed, `GET /api/catalog`, `outcome` on submissions, location precheck, `capture_mode_not_allowed`. The live cheat in the demo is no longer a gallery upload: the worker points the live camera at an old photo or a printout, or shoots the tag with a wrong code (rejected for `code_missing` / `code_mismatch`); scripted tests use an admin-only test upload that is off in evidence runs and flagged.
  - Workers with several phones or a rooted device can still spoof; stated.
  - The 20-photo set grows by 8 OOS photos (28 in total).
  - Confirmed by Helmut (2026-10-29): OOS payout equals the price-photo payout; a different product standing in the labelled slot is rejected (`slot_not_empty`); the edits to `ideas/decision.md` (chain step 2, live moment) are accepted.
  - Amends ADR-06 (the LAN `<input capture>` fallback is removed; LAN is read-only), ADR-12 (the claim-time city check becomes a capture-time geofence precheck on top of the unchanged freshness proof; location remains "soft", not proof), ADR-16 (item 3: city check at claim stays as feed filter and claim guard; the intake filter is the backstop of the dropdowns, item 2; "one photo" now means one observation, a price photo or an out-of-stock photo).

## ADR-18 Verifier is neutral by design; in the demo we operate it ourselves
- **Context:** in the hackathon build the engine (`W-VBUY`) pays the verifier (`W-SELL`) and the team controls both wallets, so the x402 payment is circular (net zero minus fees). Shelfie has a conflict of interest: it earns only on passed checks, so it gains from approving bad photos; the brand pays only for passes, so it gains from rejections.
- **Decision:** keep the verifier a separate x402 service priced per check, **pass or fail** (ADR-02), with published deterministic rules. The pitch states openly that we run both sides in the demo and does not count verifier fees as revenue. Production target: the verifier is run by an independent party, ideally chosen by the brand; the verifier URL is configuration.
- **Alternatives:** call the verifier in-process (honest about ownership, but loses the agent-pays-agent proof and hard-codes us as judge); pay the verifier only on pass (gives it an incentive to pass); let the brand verify (gives it an incentive to reject).
- **Consequences:** swapping verifiers is a configuration change, not a rewrite; multi-verifier agreement for large jobs stays on the roadmap; the same endpoint can be sold to other agents. Q&A answers 3 and 3a in `../pitch/qa-prep.md` follow this record.

## ADR-19 Gesture challenge with late reveal replaces the hand-written code; screen recapture gates (Lorenz, 2026-10-30)
- **Context:** the hand-written code (ADR-12) needs pen, paper and two hands in a store, relies on handwriting OCR that was never measured, looks low-tech, and still passes a printout or screen of an old tag with a freshly written code. Ten-perspective review: `../review/challenge-alternatives-2026-10-30.md`.
- **Decision:**
  1. New challenge mode `gesture` (pack default): at claim the engine draws 2-5 raised fingers and a side (hand `left` or `right` of the tag or label, as seen in the photo). The claim response does not contain it.
  2. Late reveal: `POST /api/claims/{claimId}/challenge` reveals the gesture when the worker opens the camera and stores `challengeRevealedAt` (engine clock). Idempotent: no re-roll, the answer window does not restart.
  3. G2 `code_match` becomes the challenge gate: with `task.expectedGesture` it compares the model's `gesture` read (exact count and side, confidence at least `minGestureConfidence` 0.7; reasons `gesture_missing`, `gesture_mismatch`, `gesture_low_confidence`); otherwise the code as before. The model never sees the expected gesture.
  4. G6 adds `challenge_stale`: `receivedAt - challengeRevealedAt > maxSecondsAfterReveal` (90 s). Never revealed counts from the claim.
  5. New gate G8 `not_screen` in both gate sets: fails `screen_recapture` when the model reports `looksLikeScreenPhoto: true` (prompt narrowed to display screens; printed paper tags are normal). Pack param `enabled` is the kill switch.
  6. No photo before the reveal: `POST /api/tasks/{id}/submissions` on an unrevealed gesture claim returns 409 `challenge_not_revealed` (no verify call, no fee, no attempt), and gesture rejections never name the expected gesture (message and gate detail), so a throwaway photo cannot fish for the sign (security-reviewer finding, 2026-10-30).
  7. Engine env `CHALLENGE_MODE` (`gesture` | `card-pool` | `handwritten`) overrides the pack: the fallback to codes is configuration, not code.
- **Alternatives:** torch flash pattern (no torch API on iOS Safari, weak under store light, printouts pass); code burned into the canvas (the client can stamp any code: theatre); motion/parallax burst (best browser-only signal, but untuned false rejects; roadmap as soft signal); hash-chained frame stream (10-14 h, screen cheat still passes; roadmap); WebAuthn/C2PA (bind nothing to pixels in a browser); printed card pool by default (kept as fallback mode).
- **Consequences:** no prop needed; one hand holds the phone, the other shows the sign. Entropy drops to 3 bits, so freshness rests on the late reveal plus the 90 s window, single use, G6 and G7. The live cheat becomes "camera at a laptop showing an old tag" -> `screen_recapture`. Still not proven: live capture and location (ADR-12, ADR-17 limits unchanged); a printout of the tag plus the right fingers passes, as it did with paper. Finger-count reliability is unmeasured: the eval needs gesture photos (valid, wrong count, wrong side, no hand, screen). Residual risks accepted: a blind guess passes G2 with probability 1/8 per attempt (about 3/8 over `MAX_ATTEMPTS` = 3; G3-G7 and location still apply); release and re-claim gives a new sign and window but no information; G8 fails open when the model omits the flag, so the screen defence is only as good as the model. Kill criteria: gesture read exact on fewer than 7 of 8 valid photos, or a false `screen_recapture` on our printed demo tag -> `CHALLENGE_MODE=card-pool` and/or `not_screen.enabled=false`.
- **Amends:** ADR-12 (the freshness proof is now the gesture plus reveal window; card-pool and handwritten modes stay), ADR-17 (the staged cheat).

## ADR-20 Brands order in our own web app; Shelfie places the Sokosumi Task on their behalf (Fernando, 2026-10-30)
- **Status:** accepted with amendment: orders are placed from `/dashboard`; `/brand` dropped (Helmut, 2026-10-30 evening). Fakes first; real REST feasibility remains B-15.
- **Context:** in the MVP the brand hires the Shelfie agent on Sokosumi and types the request into a free-text task; the catalog dropdowns (ADR-17) only exist for the operator. The team wants brands to start in our own front end, with a better-looking design that later carries over to `/w` and `/dashboard`, hosted on Vercel (docs/deploy.md).
- **Decision:**
  1. Existing customer front end (`/dashboard`, Vercel): the brand picks one product and one or more stores from the catalog (`GET /api/catalog`, filtered by chain), sees available price information, places an order and follows each store's status and report. Several stores = several jobs (one store per job stays, ADR-16). Operator tools remain in a collapsible Operator section, protected by the operator token. Map view is deferred.
  2. New engine API `POST /api/orders` and `GET /api/orders/{id}` (contracts to be written in the same commit as the code): the engine creates one Sokosumi Task per store through the Sokosumi REST API (`api.preprod.sokosumi.com`, verify Friday: endpoint, body, `maxCredits`, response, how the Task id reaches the bridge) with Shelfie's own account. The task input is the same ids-only JSON the bridge already parses, so starter, bridge, engine jobs, verifier, x402 and payouts do not change.
  3. Payment stays on Masumi: each Task locks the Masumi escrow (deliver = settle, withhold = refund). In the demo Shelfie is the buyer, so the fee goes from Shelfie's Sokosumi credits to Shelfie's W-MPS (circular, like the verifier fee, ADR-18). In production the brand pays with its own Sokosumi account or wallet (roadmap).
  4. The Shelfie agent is registered at the lowest price Masumi accepts (verify Friday: minimum; the starter registration quoted 1 test USDM = 100 credits), so the scarce credits last for many stores.
  5. Abuse guard: the order API spends Shelfie's credits, so it is never public. It needs `X-Brand-Token` (32+ bytes, shared demo access code), caps credits per order and per day, and the Sokosumi token lives only in the engine env (`Secret`, never in Vercel, the bundle or logs).
- **Alternatives:** brand wallet in the browser paying the Masumi escrow through `/x402/start_job` (the brand really pays, but the x402 + Masumi escrow path is unverified, 4-6 h); a link that opens Sokosumi with the order prefilled (simplest, but the brand still enters through Sokosumi); no Masumi for orders (loses the escrow story and the "paid per job" track path).
- **Consequences:** Shelfie needs Sokosumi credits for every store checked; the order API is a new trust boundary (token, caps, security tests). The pitch says plainly that in the demo Shelfie places the order on behalf of the brand. The dashboard uses the existing shared design tokens; D-37 remains separate. Owners: engine A, Sokosumi A, web D, order client and caps B (ADR-0006 allows cross edits; coordinate in chat).
- **Amends:** ADR-17 (the catalog dropdowns become customer-facing), webapps.md sections 3 and 5 (orders from `/dashboard`, no separate `/brand` app).

## ADR-21 Brand app at `/b`, one access code per brand, `/dashboard` operator-only (Fernando, 2026-10-31)
- **Status:** accepted (team decision, 2026-10-31). Proof of concept for the demo: one brand configured.
- **Context:** after ADR-20 the brand ordered from `/dashboard`, which also holds the operator views; anyone with the URL saw every job, and all brands shared one `BRAND_TOKEN`, so the engine could not tell whose order was whose.
- **Decision:**
  1. New brand app at `/b`, built from the dashboard components: sign-in with the brand access code (tab memory only), two tabs (Overview, Orders) and a Profile panel. Overview shows only the brand's own orders; with no orders it shows only a centered "+" to start a shelf request.
  2. Engine env `BRAND_ACCOUNTS` (`id|name|addr_test1...|token`, `;`-separated, token 32+ chars, unique): each order stores its `brandId`; `GET/POST /api/orders` and `GET /api/orders/{id}` are scoped to the calling brand (foreign order = 404); `GET /api/brand/me` returns the profile (name, preprod wallet address, credit caps), never the code. The legacy `BRAND_TOKEN` maps to the reserved brand `demo`.
  3. Profile is informational: in the demo Shelfie still places the Sokosumi Task and pays the Masumi escrow (ADR-20 point 3). The brand's wallet address is shown, not used for payment.
  4. `/dashboard` is operator-only: a gate asks for the operator token (checked with `GET /api/admin/ping`) and the brand order form leaves it. Public read endpoints (`/api/jobs`, ledger) stay public because the worker app and the ledger need them; the gate hides the operator view, it does not make job data secret.
- **Alternatives:** brand types its wallet address to sign in (no secret: anyone who copies the public address could spend Shelfie's credits); sign-in by wallet signature (CIP-30 `signData`, the real version, 5-6 h and an unverified verifier library: roadmap); keep one shared code (no per-brand isolation).
- **Consequences:** the operator registers each brand in the engine env; daily credit cap stays global, reserved credits shown per brand. Contracts: Orders section and admin routes in `diseno/contracts.md`; routes in `diseno/webapps.md`.
- **Amends:** ADR-20 amendment "`/brand` dropped" (brands now order from `/b`, not `/dashboard`).

## ADR-22 Demo runtime on 2026-10-31: real mode only, hub split, Sokosumi buyer account (Isabel, 2026-10-31)
- **Status:** accepted (team decision, 2026-10-31).
- **Context:** hackathon day. Feature freeze Sat 11:00, last paid escrow cycle started by 13:00, Devfolio deadline 15:00 (AGENTS.md build window). The demo and pitch must run on real preprod services with several phones in a supermarket. The docs still described fakes, a blocked real Sokosumi adapter and Isabel as the hub operator.
- **Decision:**
  1. Real mode only for the demo and evidence: shared deployments run with fakes off (`FAKE_PAYMENTS=0`, `VERIFIER_PAYMENT=on`, `VERIFY_CLIENT=real`, `VERIFIER_MODE=live`, `SOKOSUMI_CLIENT=real`). Fakes stay for local tests only. If something fails we fix it, we do not switch to fakes.
  2. Topology: Helmut's laptop is the hub for engine and verifier, behind the named Cloudflare tunnel (`api.shelfieapp.fyi` / `api-dev.shelfieapp.fyi`); the web app is on Vercel. Isabel's Windows laptop runs the Masumi Payment Service (port 38127, Postgres 16, never public) and the patched starter worker with the shell bridge (`codigo/apps/shell`); the bridge reaches the engine through the tunnel URL with `X-Shell-Token`. MPS stays on Isabel's laptop because its wallets and the paid Tasks M4, M5 and A-25 already ran there.
  3. Sokosumi buyer: the engine creates the Tasks (`RealSokosumiClient`, `POST /v1/tasks`, verified as A-25 in [verified.md](../codigo/docs/verified.md)) with a Sokosumi user API key (`soko_preprod_` prefix) of Isabel's preprod account. This is "Shelfie's own account" in ADR-20 point 3, so credits are charged to Isabel's account (100 credits per Task at the current registration price). The key lives only in the hub engine env as `SOKOSUMI_API_TOKEN`, handed to Helmut privately; never in Vercel, chat or git. Engine env for real orders: `SOKOSUMI_CLIENT=real`, `SOKOSUMI_API_TOKEN`, `SOKOSUMI_COWORKER_ID` (= the starter's `COWORKER_ID`), `SOKOSUMI_ORGANIZATION_SLUG` (TUM workspace slug), `BRAND_ACCOUNTS` or `BRAND_TOKEN`, caps `SOKOSUMI_MAX_CREDITS_PER_TASK`, `ORDER_MAX_STORES`, `ORDER_DAILY_CREDIT_CAP`. `SOKOSUMI_AGENT_ID` is not read by the real adapter.
  4. Brand flow: the brand opens `/b` and signs in with its access code only; there is no separate payment in `/b` (ADR-21 point 3). The order becomes one Sokosumi Task per store, the Task locks the Masumi escrow, the engine pays the verifier per check via x402 and pays the worker in preprod ADA on a pass; deliver settles the escrow, withhold refunds it.
  5. Pages and owners for the hackathon:

     | Page / part | What | Owner |
     |---|---|---|
     | `/story` | pitch and demo screen | Lorenz (C) |
     | `/homepage` | startup homepage, frozen, not part of the hackathon | frozen (built as D-41) |
     | `/dashboard` | operator | Helmut (D) |
     | `/w` | worker phone app | Helmut (D) |
     | `/b` | brand app (ADR-21) | Fernando (B) |
     | Sokosumi worker + MPS | on Isabel's laptop | Isabel (A) |
     | Pitch and presentation | deck, script, video (`pitch/`) | Lorenz (C) |
- **Alternatives:** move MPS to Helmut's hub (new DB, wallets, registration and a private link from the worker; too risky hours before the freeze); keep fakes as a stage fallback (rejected: fake output must not be presented as real, AGENTS.md).
- **Consequences:** Isabel's laptop and Helmut's laptop must both stay on and online during the demo; Isabel's account needs enough Sokosumi credits; the worker's `ENGINE_URL` must point to the tunnel, not 127.0.0.1. The worker uses `https://api-dev.shelfieapp.fyi` (dev) per [hub-laptop.md](../preparacion/hub-laptop.md); moving the demo to `api` (main) needs the release PR (decide: Helmut). Creating the `soko_preprod_` key in the Sokosumi web app is still unverified (verify on first use).
- **Amends:** ADR-20 point 3 (names the buyer account), [hub-laptop.md](../preparacion/hub-laptop.md) (hub operator), [adr20-validation.md](../codigo/docs/adr20-validation.md) (historical).

## Open (not yet decided)
- Early delivery (`earlyDeliver`) default: false (dashboard shows the full table); revisit if the Masumi submit deadline is tight.
- Whether to enter the API3 track as a secondary candidacy: not decided here; this design does not depend on it.
