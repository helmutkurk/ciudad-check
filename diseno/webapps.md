# Web apps: worker side and customer side

Status: proposal built on `contracts.md`, `architecture.md` and `verifier-rules.md` (canonical). Added 2026-10-29 after Helmut's request for two sides of the web app; updated the same day for ADR-17 (dispatch to all workers, camera only, location at capture, catalog-only requests, out of stock). Visual system and screen layouts: [ui-design.md](ui-design.md); this file keeps behaviour, flows and wireframes of the functional structure. Where the two differ on looks, `ui-design.md` wins; on behaviour, this file and `contracts.md` win. Where this file and `contracts.md` disagree, `contracts.md` wins; change it first. Nothing here is built before Friday 09:00. Items marked *inference* are our reading; items marked *decide Friday* are open.

Both sides live in one app, `apps/web` (Vite + React, owner D), served by the engine from the same origin:

| Side | Route | Audience | Layout | In contracts.md? |
|---|---|---|---|---|
| Worker app | `/w` | People in stores and on the street who take shelf photos (or report an empty shelf spot) | Mobile first, one hand, bright light | Yes (architecture.md component 5) |
| Brand app | `/b` | A brand that orders shelf checks: Overview, Orders, Profile; sign in with the brand access code (ADR-21) | Desktop layout, readable on a phone | Yes (orders, `GET /api/brand/me`, `/api/brand/summary` and `/api/brand/transactions` in contracts.md) |
| Operator dashboard | `/dashboard` | Operators: requests, locations, ledger, tools; behind the operator token gate (ADR-21) | Desktop and stage layout | Yes (component 6; `GET /api/admin/ping` in contracts.md) |
| Extra routes (proposed) | `/dashboard/jobs/:id`, `/dashboard/jobs/:id/report`, `/dashboard/ledger`, `/dashboard/entry-brief` | Operator | Same | **Proposed, not in contracts yet** |

MVP vs later is summarised in section 6. The market-entry brief (section 4.3) is roadmap; the MVP builds only the shelf-check job.

## 1. Personas

| Persona | Side | Status | Goal |
|---|---|---|---|
| **Street worker** (student, gig worker; role not yet researched) | Worker | MVP; teammates play it in the demo | Earn a small payout for a quick, verifiable photo |
| **Katharina Brandl**, field-sales manager at Isarquell (fictional, from `pitch/storyline.md`) | Customer | MVP persona | Know today whether her 0.33 l bottle is on the shelf in a given Munich store, and at what price (MVP: one store per job; several stores per job is roadmap, ADR-16) |
| **Exporter** (example from Helmut: a producer in South America that wants to introduce a product into the German market) | Customer | Roadmap persona (product-roadmap.md) | Understand shelf prices, competitors and positioning in German stores before committing to the market |
| **Operator** (a teammate with the admin token) | Dashboard, admin | MVP | Run demos, override (labelled), reconcile payouts |

Name, company and country of the exporter are not defined: *decide Friday* whether the pitch uses a fictional exporter at all (Katharina stays the spine, `storyline.md` rule).

## 2. Worker app (`/w`)

### 2.1 Jobs to be done

- When I have ten spare minutes near a supermarket, I want to see tasks nearby with the reward, so I can decide fast.
- When I take a task, I want unambiguous instructions and a one-time code, so my photo is accepted the first time.
- When my photo is rejected, I want to know exactly why, so I can fix it without losing the task.
- When my photo passes, I want to see the payout and a verifiable receipt, so I trust that I will be paid.

### 2.2 Journey

1. Open `/w` (QR code or link). A random `workerId` is created in local storage (contracts.md section 0). **Sign in with wallet** (screen W0): on a browser with a CIP-30 wallet (`window.cardano`), "Connect wallet" reads the payout address; otherwise paste a preprod address (or scan its QR). No signature, no password: the address is the identity and payout target; address ownership is not proven (the risk is the worker's own). Whether mobile wallet browsers expose CIP-30 on the venue phones: *verify Friday*; paste is the guaranteed path.
2. First run: display name, a short privacy rule (shelves only, no people), and the location permission explanation (city feed, then the shot).
3. Feed (W1): open tasks in the worker's city, live. When a new job arrives all workers in Munich see it at once (SSE `task_opened`); when someone else claims it, it disappears from every other feed (`task_closed`) with a short fade, and a worker who taps late sees "Another worker was faster." First claim wins (ADR-17).
4. Tap a task for detail (W2), then "Take this task" (`POST /api/tasks/{id}/claim`). The challenge code and countdown appear (W3, TTL 300 s). The claim holds the task for that time; if it expires the task returns to every feed.
5. Write the code on paper (mode `handwritten`) or take a printed card (mode `card-pool`). Go to the shelf.
6. Two ways to finish, both from W3 and from the camera sheet: the primary path "Open camera" for the price photo, and the clear secondary action **"Product not on the shelf"** that switches the sheet to out-of-stock framing (empty spot, shelf label, code).
7. Camera sheet (W4): live camera only, no gallery or file option anywhere. The sheet shows the code and countdown, a location status line (reading, accurate, weak signal), and the shutter. On shutter the page reads a fresh location fix and sends photo and location together (`POST /api/tasks/{id}/submissions`). Over HTTP (no secure context) the sheet is replaced by a notice to open the secure link; the worker cannot submit from there.
8. Location precheck result comes back immediately: too far from the store or fix too weak -> the sheet stays open with the reason and the distance, no fee, no attempt used; the worker can step closer or wait for a better fix and shoot again with the same code (up to 3 tries).
9. Wait for verification (state `VERIFYING`, queue position shown). Poll `GET /api/submissions/{id}` every 2 s.
10. Result: PASS (payout state moves QUEUED, SENDING, SUBMITTED, CONFIRMED, with explorer link; out-of-stock shows its own wording, W6b) or FAIL (reason in plain words, attempts left, "Try again" gets a new claim and a new code).
11. Back to the feed.

### 2.3 Screens (wireframes, mobile 360 px)

**W0 Sign in with wallet**
```
+--------------------------------+
| Shelfie                        |
|                                |
| Get paid for photos            |
| that prove the shelf.          |
|                                |
| [ Connect wallet ]             |
| or paste a preprod address     |
| [ addr_test1...            ]   |
| Name (shown to you only)       |
| [ Anna                     ]   |
|          [ Continue ]          |
| Shelves only. No people.       |
+--------------------------------+
```

**W1 Task feed (live)**
```
+--------------------------------+
| Tasks in Munich       addr..a9 |
+--------------------------------+
| Example Pale Ale 0.33 l        |
| Store A, Street 1              |
| 3 tADA          12 min left  > |
|--------------------------------|
| Other Product 0.5 l            |
| Store B, Street 2              |
| 3 tADA           9 min left  > |
+--------------------------------+
| New tasks appear here. When    |
| someone else takes one, it     |
| leaves your list.              |
+--------------------------------+
```
Empty state: "No tasks in Munich right now. New ones appear here as they arrive." Location off: "Allow location to see tasks in your city." with a button.

**W2 Task detail**
```
+--------------------------------+
| < Tasks                        |
| Example Pale Ale 0.33 l        |
| Store A, Street 1, Munich      |
|                                |
| 1  Find the product            |
| 2  Write the code on paper     |
| 3  Hold it next to the price   |
|    tag                         |
| 4  Take one photo with the     |
|    in-app camera               |
| No product there? You can      |
| report the empty shelf spot.   |
|                                |
| Reward 3 tADA   Attempts 3     |
|                                |
|     [ Take this task ]         |
+--------------------------------+
```

**W3 Claimed: code**
```
+--------------------------------+
| Your code            04:32     |
|                                |
|          K7Q - 4XM             |
|                                |
| Write it on paper and hold it  |
| next to the price tag.         |
|                                |
|       [ Open camera ]          |
|   Product not on the shelf     |
|        Give task back          |
+--------------------------------+
```
The code is shown here but the photo must contain the paper; the phone that shoots cannot show its own screen. "Product not on the shelf" is a text-weight secondary action, never the same weight as the primary button, never hidden.

**W4 Camera sheet (full-height sheet over W3)**
```
+--------------------------------+
| Cancel      Price photo        |
|  [live camera preview]         |
|   +------------------------+   |
|   |  frame: tag + paper    |   |
|   +------------------------+   |
| Code K7Q-4XM        04:10      |
| (o) Location ok - 22 m from    |
|     the store                  |
|        (  shutter  )           |
| Product not on the shelf       |
+--------------------------------+
```
No upload button. The location line reads: "Getting location...", "Location ok", "Weak signal, wait or go outside" (shutter stays enabled; the engine decides), "Location off. Allow it in the browser" (shutter disabled: location is required). In out-of-stock mode (`Cancel      Empty shelf spot`) the frame guide shows "label + empty spot + paper", with the hint "Show the shelf label and the empty space above it."

**W5 Result, fail**
```
+--------------------------------+
|  Not accepted                  |
| We could not read the code     |
| K7Q-4XM in your photo. Hold    |
| the paper closer and try again.|
| Attempts left: 2               |
|   [ Try again (new code) ]     |
|   [ Back to tasks ]            |
+--------------------------------+
```
Text comes from `verdict.workerMessage`. A location refusal is shown in the camera sheet (W4), not here, because no attempt was used.

**W6 Result, pass and payout**
```
+--------------------------------+
|  Verified                      |
| Price read: 2.49 EUR           |
| Payout 3 tADA                  |
| Status: SENDING -> CONFIRMED   |
| Tx: 1a2b...9f  [View on        |
|      explorer]                 |
|        [ Next task ]           |
+--------------------------------+
```
tADA has no market value (storyline units note); never show a EUR equivalent in the demo.

**W6b Result, out of stock accepted**
```
+--------------------------------+
|  Verified: not on the shelf    |
| Label read: Example Pale Ale   |
| Payout 3 tADA (same as a       |
| price photo)                   |
| Status: SENDING -> CONFIRMED   |
| Tx: 1a2b...9f  [View on        |
|      explorer]                 |
|        [ Next task ]           |
+--------------------------------+
```
Out-of-stock failure uses W5 with the O-gate messages (verifier-rules.md section 2a), for example "A product is visible at this spot. If it is there, use the normal price photo."

### 2.4 Endpoints per screen

| Screen | Endpoints (contracts.md) |
|---|---|
| W0 | none (local storage); optional CIP-30 read in the browser |
| W1 | `GET /api/config` (labels, explorer base, challenge mode, `secureContext` hint), `GET /api/tasks?status=OPEN&lat=&lon=`, `GET /api/tasks/stream` (SSE `task_opened` / `task_closed`, polling fallback 3 s) |
| W2/W3 | `POST /api/tasks/{id}/claim`, `POST /api/claims/{id}/release` |
| W4 | `POST /api/tasks/{id}/submissions` (photo, `outcome`, `location`, `captureMode: getUserMedia`) |
| W5/W6/W6b | `GET /api/submissions/{id}` (poll; SSE not specified for submissions) |

### 2.5 States and errors to show

| Situation | Source | UI |
|---|---|---|
| Empty list | no OPEN tasks | "No tasks right now" with refresh |
| Task taken by someone else | 409 `task_not_open`, SSE `task_closed` | Task leaves the feed; late tap: "Another worker was faster." |
| Second active claim | 409 `claim_already_active` | "Finish or give back your current task first" |
| Too far from the store | 422 `location_mismatch` | In the camera sheet: "You are about {distanceM} m from the store. Move closer and shoot again." No attempt used |
| Weak location fix | 422 `location_inaccurate` | "Weak location signal. Wait a few seconds or step outside, then shoot again." |
| Not a live capture | 422 `capture_mode_not_allowed` | Should not occur in the app; "Use the in-app camera" |
| No secure context | `isSecureContext` false | Read-only notice: "Open the secure link to take the photo." No upload alternative |
| Bad payout address | 422 `invalid_payout_address` | Inline field error, explain preprod address |
| Rate limited | 429 `rate_limited` | "Too many requests, wait a moment" |
| Claim expired | 409 `claim_expired` | "Claim expired, take the task again" |
| Location denied or missing | 403 `location_required` | "Allow location (city level) to take this task"; explain it is only used to check the city |
| Worker in another city | 403 `wrong_city` | "This task is in Munich; you appear to be elsewhere" |
| Claim window closed | 409 `claim_window_closed` | "Too late to start this task" |
| Already submitted | 409 `already_submitted` | Show the existing result |
| Image too large / not decodable | 413 `image_too_large`, 422 `image_not_decodable` | Retake; client resize first |
| Duplicate image | 422 `duplicate_image` | "This photo was already used" |
| Verifier queued | `VERIFYING` with `queuePosition` | "Queued for verification, position N" (verification can take 20 to 60 s, domain-model section 4) |
| Verifier or engine down | 503 `dependency_unavailable` | "Service busy, your task is kept; try again" |
| Payout delayed | payout `QUEUED`/`SENDING`/`UNKNOWN` | Neutral wording: "Payment pending"; never claim failure while `UNKNOWN` |
| Camera denied | browser | Explain how to allow the camera in the browser settings; there is no upload alternative |

### 2.6 Accessibility, i18n, privacy

- Accessibility: tap targets at least 44 px; text contrast AA; countdown also as text, not colour only; camera screen has a visible non-gesture shutter; result states announced with `aria-live`; works in portrait with one hand.
- i18n: English strings in MVP; all strings come from `GET /api/config` pack labels or one message catalogue so German is cheap to add; Spanish later (needed for South American users and customers). Server `workerMessage` is English in MVP; localised reason codes are roadmap (*inference*: map `reasonCode` to catalogue keys client-side).
- Privacy rules shown to the worker and enforced as far as the design allows: shelves and price tags only, no people in frame (advisory `peopleVisible` flag only warns, it does not gate; verifier-rules section 3); do not photograph staff or customers; ask a store employee if unsure; photos are kept on the hub during the event and deleted after (verifier-rules). The worker app stores only `workerId`, display name and payout address locally. Browser location is read twice, coarsely for the city feed and precisely at the shutter; the engine keeps only the distance and the pass/fail, not coordinates (contracts.md section 1.3), and the page says so. The code proves freshness, not location; the location check is a soft deterrent.

## 3. Customer app, shelf-check job (MVP)

### 3.1 Jobs to be done (Katharina)

- When I have launched a product in a chain, I want to know within the hour whether it is on the shelf and at what price, so I can act the same day.
- When a check fails, I want not to pay for it, so I can trust the bill.
- When I show the data to my boss or the buyer, I want a report and a receipt for each store, so the data is defensible.

### 3.2 Journey

1. Open `/b`, sign in with the brand access code (tab memory only), select a product and several stores from the Munich catalog, optionally filtering stores by chain. No free-text order fields and no file inputs.
2. Place `POST /api/orders`. Intake runs for every store before any Sokosumi call. Shelfie buys one Task per store with its own account and bounded credits (ADR-20, amended Helmut 2026-10-30).
3. Watch the order's per-store statuses through authenticated `GET /api/orders` and `GET /api/orders/{id}` (3 s polling). The order form shows the credit ceiling per store and for the order, the latest recorded price and the escrow refund rule (B-17); each store row shows its outcome (passed with the photo price, failed with reason, timed out, refunded) and links to the timeline and report; Overview and Profile show credits paid/refunded and check counts (`GET /api/brand/summary`), Orders lists the brand's own on-chain transactions (`GET /api/brand/transactions`), all hashes linked to the preprod explorer. The brand wallet balance is not shown (informational address, ADR-21). A pending Task has no engine job until the shell picks it up; the fake client creates it immediately through the same `Engine.createJob` path.
4. Open a linked job for its existing timeline, payouts, receipts and report. Deliver means a passing price or out-of-stock observation; withhold means no passing observation. Settlement/refund is shown only when observed.
5. Operator-only demo job and override stay in a collapsed **Operator** section, gated by the operator token. Stage mode hides that section.

### 3.3 Screens

**C1 New order**: a product dropdown, chain filter and native multi-select of stores from `GET /api/catalog` (including the demo shelf and REWE). Read-only price information when available; unknown price is explicit. The brand access code sits outside the catalog-only form and is never stored in browser storage. Submit sends `{productEan, storeIds}`. After success, the order list shows each store's status and a link to the existing job timeline/report. Fake orders are labelled as rehearsals with no real escrow. Brand ordering lives in the brand app at `/b` (ADR-21); the operator dashboard has no order form.

**C2 Job progress with live per-store status**
```
+----------------------------------------------------------------+
| Job job_01  COLLECTING  passed 0/1  need K=1   window 08:12    |
| Escrow: LOCKED (tx 9c1..)   Verification spend 4 tADA          |
+------------+----------+------------------+---------+-----------+
| Store      | State    | Price read       | Verdict | Payout    |
+------------+----------+------------------+---------+-----------+
| Store A    | OPEN (2nd| -                | FAIL    | -         |
|            | attempt) |                  | code    |           |
| (after the retry: PAID, 2.49 EUR, PASS, payout tx link)        |
+------------+----------+------------------+---------+-----------+
| [FAKE PAYMENTS] banner / [OVERRIDE] badge when applicable      |
+----------------------------------------------------------------+
```

**C3 Report**
```
+----------------------------------------------------------------+
| Report job_01     Decision: DELIVER (1 of 1)              |
| Store | Price | Verdict | Evidence tx | Payout tx              |
| ...                                                            |
| Result hash: sha256 ...     [Download .md]                     |
| On WITHHOLD: "Result withheld, escrow refunds" + refund tx     |
+----------------------------------------------------------------+
```
Rendered from `reportMd` of the decision (contracts 1.1); the table columns come from the pack `report.columns`. For an out-of-stock result the row reads "Not on the shelf at Store A, 14:32" with the photo of the empty spot as evidence; the escrow settles like any delivered result (layout: ui-design.md B4).

**C4 Payments ledger with explorer links**
```
+----------------------------------------------------------------+
| Ledger (live)         seq | time | kind | detail | tx [open >] |
|  14 | 10:42:07 | VERIFY_PAID    | sub_03 | 7ad.. [open]        |
|  15 | 10:42:09 | PAYOUT_SUBMITTED| tsk_03| 3f2.. [open]        |
| Wallets: W-VBUY 48 tADA  W-PAY 120 tADA  queue 0               |
+----------------------------------------------------------------+
```

### 3.4 Endpoints per screen

| Screen | Endpoints |
|---|---|
| C1 | `GET /api/catalog` (dropdowns), `POST /api/jobs` (needs `X-Shell-Token` or `X-Admin-Token`; fine for operator, not for public customers) |
| C2 | `GET /api/jobs`, `GET /api/jobs/{id}`, `GET /api/ledger/stream` (SSE, polling fallback every 3 s), `GET /api/health`, `GET /api/config` |
| C3 | `GET /api/jobs/{id}` (includes `decision`, `settlement`), `GET /api/jobs/{id}/decision` for `reportMd` |
| C4 | `GET /api/ledger?afterSeq=`, `GET /api/ledger/stream`, `GET /api/payouts?jobId=`, `GET /api/health`, `GET /v1/price` on the verifier (dashboard shows the verification price) |
| Operator tools | `/api/admin/*` (override, reconcile, finalize, reset) behind `X-Admin-Token`; hidden unless the token is entered |

Whether `GET /api/jobs/{id}` already exposes `reportMd` is not stated; contracts 1.1 lists it on the decision endpoint. *Verify Friday*, or use `/decision`.

### 3.5 States and errors

Job states: RECEIVED, COLLECTING, DECIDING, DELIVERABLE, DELIVERED, SETTLED, WITHHELD, REFUNDED, CANCELLED, REJECTED_INPUT (domain-model 2.1). Task states: OPEN, CLAIMED, SUBMITTED, VERIFYING, ACCEPTED, PAID, FAILED, EXPIRED. Show: red banner if `fakes.*` is true or a balance is under `MIN_WALLET_LOVELACE`; badge for `demoOverride`; "reconnecting" when SSE drops (switch to polling); 401 on admin actions; 422 `input_schema_violation` with zod issues on C1; empty state "No jobs yet".

### 3.6 Accessibility, i18n, privacy

Status never by colour alone (icon plus text); table is a real `<table>` with headers; stage layout has a large-font mode; explorer links open in a new tab with visible destination text. English in MVP; German next (Katharina), Spanish later (exporter). Customer pages never show worker payout addresses or display names beyond what the report needs; photos are evidence for disputes, not published; shelves only. Worker identity stays out of the report by default (*proposal*).

## 4. Customer app, exporter (market-entry brief): roadmap

The exporter (for example a South American producer) needs a market analysis for entering Germany: shelf prices, costs, competitors, marketing and positioning in German stores. The hackathon MVP does not build this. It reuses what the MVP produces (verified shelf price and placement observations) and adds aggregation and desk research. Facts about the market are not provided here; any number in a real brief must come from a source or from verified shelf data.

### 4.1 Jobs to be done

- When I consider entering Germany, I want to see what comparable products cost on the shelf, by store type and city, so I can set a viable price.
- I want to see who the competitors are, how they are placed and presented, so I can choose positioning.
- I want to know the landed-cost and margin structure at those shelf prices, so I can decide go or no-go. (Desk research, not shelf data: customs, logistics, retailer margin assumptions are outside the verifier.)

### 4.2 Journey (proposal)

1. Describe the product (category, pack size, target price idea, origin) and the target cities and store types in a "market entry brief" request.
2. Shelfie plans a field job: comparable products and competitor products to be photographed in N stores (extra task fields beyond the current pack; see open questions).
3. Workers return verified photos; the verifier extracts price, product and (new) shelf facts.
4. Desk research and analyst/LLM synthesis is added, with each claim tagged shelf-verified or desk-researched.
5. The customer reads the report and downloads the evidence appendix.

### 4.3 Screens (proposed, not in contracts yet)

**E1 Market entry brief request**
```
+--------------------------------------------------------+
| Market entry brief                                      |
| My product   [Yerba mate 0.5 l]  Category [Drinks v]    |
| Origin       [Argentina]   Target retail price [ ? EUR] |
| Cities       [Munich] [+]  Store types [Discounter v]   |
| Compare with [Competitor products: name/EAN list]       |
| Questions    [x] shelf prices  [x] competitors          |
|              [x] placement/facings  [ ] promotions      |
|              [ ] desk research: costs and regulation    |
| Budget / number of store checks  [ 30 ]                 |
|                         [ Request quote ]               |
+--------------------------------------------------------+
```
Example values are placeholders, not market claims.

**E2 Report outline** (what the brief contains; sections marked S come from shelf data, D from desk research)
1. Summary and caveats (what is verified, what is not).
2. Shelf price landscape (S): observed prices per product, store type and city, with count of observations, min, median, max, and photo evidence links.
3. Competitor map (S plus D): products found next to or instead of the exporter's category, brand, pack size, price per litre or kg, facings if captured.
4. Positioning and presentation (S, D): packaging, claims, placement (shelf height, adjacency), promotion tags seen in stores.
5. Price corridor and margin sketch (S plus D): scenarios based on observed shelf prices and sourced cost assumptions; assumptions listed.
6. Regulatory and logistics notes (D only; sourced, flagged unverified until checked).
7. Evidence appendix: ledger and tx links, observation table, method and limits (freshness proven, location not).

### 4.4 Endpoints

None exist for this flow. Proposed (not in contracts yet): `POST /api/briefs` (create brief and its field jobs), `GET /api/briefs/{id}`, `GET /api/briefs/{id}/report`, `GET /api/observations?...` (aggregated shelf observations). The existing `POST /api/jobs` with `packId: "shelf-check"` would be reused per store group.

## 5. Customer routes and APIs

| Proposed | Purpose | Needs |
|---|---|---|
| `/b` | Brand places and follows shelf requests (Overview, Orders, Profile) | `X-Brand-Token` from sign-in; POST/GET `/api/orders`, GET `/api/orders/{id}`, GET `/api/brand/me`, `/api/brand/summary`, `/api/brand/transactions`; contracts Orders |
| `/dashboard` | Operator views behind the operator token gate | `X-Admin-Token`; `GET /api/admin/ping` as the gate; `/api/jobs`, ledger (no brand order form) |
| `/dashboard/jobs/:id` | Deep link to one job | none beyond existing GETs |
| `/dashboard/jobs/:id/report` | Printable report | `reportMd` rendering |
| `/dashboard/ledger` | Full-screen ledger | existing ledger endpoints |
| `/dashboard/entry-brief` | Exporter request and report | new endpoints in 4.4, extended pack (comparison products, extra extraction fields) |
| Customer login | Separate customers' data | auth model; contracts have none |
| Localisation switch | DE/EN/ES | message catalogue |

Rule: do not add any of these to the engine without updating `contracts.md` in the same commit (repo-layout section 3 and core contract rule).

## 6. MVP (Fri-Sat) vs roadmap

| Capability | MVP (hackathon) | Later |
|---|---|---|
| Worker app: list, claim, code, capture, result, payout link | Yes | Accounts, reputation, onboarding, push notifications |
| Worker i18n | English | German, Spanish |
| Customer dashboard: job progress, ledger, report view | Yes (stage layout) | Customer auth, job history, filters |
| Customer places order | Dashboard; Shelfie account places one Sokosumi Task per store (ADR-20) | Customer accounts and payment |
| Per-store status with live updates | Yes (SSE plus polling) | Map view, notifications |
| Task dispatch | Feed to all workers in the city, first claim wins | Assignment by distance, reputation, push notifications |
| Out-of-stock observation | Yes (secondary action, separate gates, same payout) | Second-worker sampling, per-worker OOS ratio flag |
| Request input | Dropdowns from the catalogs, ids only | Self-service catalog growth |
| Report | Markdown table from pack | PDF, CSV, API export, branded |
| Market-entry brief for exporters | No | Yes, section 4 |
| Aggregated shelf price database | No | Yes (product-roadmap.md) |
| Location proof | Soft browser-geolocation: city at claim, geofence distance at capture (default 150 m); freshness by code; no proof | Store-owned QR codes |
| Photo source | Live camera only (`getUserMedia`); no gallery; LAN HTTP is read-only | Attested capture (platform attestation, native app) |
| Stores per job | One (N=1, K=1, ADR-16) | Several stores with K-of-N (product-roadmap.md section 4a) |
| Customer i18n | English | German, Spanish |

## 7. Open questions, decide Friday

1. Does the pitch mention the exporter persona at all (one slide line, roadmap) or stay with Katharina only?
2. Does the demo include a customer-facing "new job" form, or only the operator button (recommended: operator only; time budget of D)?
3. Does `GET /api/jobs/{id}` return `reportMd` or only the decision endpoint (C3)?
4. (Resolved by ADR-17.) The live cheat: aim the live camera at an old photo or printout of the tag (or shoot a wrong code); no upload path exists.
5. SSE for `GET /api/submissions/{id}` or polling only (polling is in contracts).
6. Localised worker messages: only English in MVP, confirm.
7. Reward and price display: show tADA only, never EUR equivalents (confirm with storyline units note).
8. For the exporter later: which extraction fields must the shelf pack add (competitor brand, price per unit, facings, promotion tag), and how do they affect gates G3 to G5 (not designed).
9. Does the worker app need an explicit privacy acknowledgement on first run (proposal: yes, one screen)?
10. Does the Sokosumi hire form support option/select fields in the Coworker input schema (*verify Friday*, A)?
11. Do CIP-30 wallets inject `window.cardano` in the venue phones' browsers (*verify Friday*, D)? Paste stays the default.
12. Geolocation accuracy indoors at the demo store and at the venue: is 150 m plus accuracy enough, or is a larger demo radius needed (*verify Friday*, C and D)?
