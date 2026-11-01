# Glossary: who and what is who in Shelfie

One line per term, linked to the canonical design for details. Code names in `backticks`. If a definition here and a design file disagree, the design file wins; fix this glossary in the same commit.

## 1. People (actors)

| Term | Definition |
|---|---|
| **Brand** (customer) | The company that wants to know whether its product is on the shelf in a store and at what price, e.g. a field-sales or category manager of a small consumer-goods brand (persona Katharina Brandl, [webapps.md](webapps.md) 1). Places **orders** and receives **reports**. Pays only when the photo passes. |
| **Worker** | A person in the city who claims a **task**, goes to the store and photographs the shelf price tag (or the empty shelf spot) with the in-app camera. Gets a **payout** in tADA when the photo passes. Identified by an opaque `workerId` and a preprod payout address. |
| **Operator** | A team member running the **hub**: starts services, watches the dashboard, resolves alerts (unclear payments, stale payouts, orders needing reconciliation). Uses the `X-Admin-Token`. Never a customer role. |
| **Judge / tester** | Someone trying the worker app during the event; treated like a worker (consent screen, no personal data kept after the event). |

## 2. Agents and services

| Term | Definition |
|---|---|
| **Shelfie agent** (lead agent) | Our agent listed on Sokosumi as a **Coworker**. Receives a paid **Sokosumi Task**, turns it into a **job** through the **shell bridge**, and delivers the report (or withholds it). The seller in the Masumi escrow. |
| **Engine** | `codigo/apps/engine`: the core service. Creates jobs and tasks, dispatches tasks to workers, checks location, sends photos to the verifier, decides `DELIVER`/`WITHHOLD`, queues payouts, writes the **evidence ledger**. Also serves `/w` and `/dashboard` and the brand **orders** API. |
| **Verifier** (verifier agent) | `codigo/apps/verifier`: a separate service that sells one photo check per request over **x402** (1 tADA). Runs vision extraction and the deterministic **gates**; returns a **verdict**. Neutral by design: paid pass or fail ([decisions.md](decisions.md) ADR-18). |
| **Shell / shell bridge** | `codigo/apps/shell`: the organisers' Masumi **starter** (pinned, patched) plus our bridge. Polls Sokosumi for the coworker's Tasks, requests the Masumi payment, calls the engine (`POST /api/jobs`, `externalRef` = Task id) and submits or withholds the result. |
| **Vision provider** | The external model the verifier calls to read the photo (price, product, gesture, screen flag). Its output is untrusted data; decisions are made by the gates in code. |
| **Facilitator** | The hosted x402 service that checks and submits the buyer's signed payment on Cardano preprod. |
| **Masumi Payment Service (MPS)** | The Masumi service that holds the seller wallet (`W-MPS`) and manages the escrow lock, result submission and settlement for paid Sokosumi Tasks. |
| **Web apps** | `codigo/apps/web`: the **worker app** (`/w`, phone, camera) and the **dashboard** (`/dashboard`, brand orders, live job status, operator tools). Hosted on Vercel; `/api` calls are proxied to the engine. |

## 3. Work units (from order to payment)

| Term | Definition |
|---|---|
| **Order** | A brand's request in our web app (ADR-20): one product in one or more stores. The engine creates one **Sokosumi Task** per store. Id `ord_…`. |
| **Sokosumi Task** | The paid unit on Sokosumi. One per store. Creating it as `READY` makes the shell request the Masumi payment (credits). Its id becomes the job's `externalRef`. |
| **Job** | The engine's unit for one store check (MVP: N=1, K=1, ADR-16). Id `job_…`. States: `RECEIVED`, `COLLECTING`, `DECIDING`, `DELIVERABLE`, `DELIVERED`, `SETTLED`, `WITHHELD`, `REFUNDED`, `REJECTED_INPUT`, `CANCELLED`. |
| **Task** (engine task) | The micro-task shown to workers: one store, one product, one photo. Id `tsk_…`. States: `OPEN`, `CLAIMED`, `SUBMITTED`, `VERIFYING`, `ACCEPTED`, `PAID`, `FAILED`, `EXPIRED`. Not the same as a Sokosumi Task. |
| **Claim** | A worker's exclusive hold on a task for a limited time (`CLAIM_TTL_SEC`); first claim wins. Carries the **challenge**. States: `ACTIVE`, `USED`, `EXPIRED`, `RELEASED`. |
| **Submission** | One photo sent for a claim, with the capture location check. States: `RECEIVED`, `VERIFYING`, `VERIFY_RETRY`, `PASSED`, `REJECTED`, `ERROR_FINAL`. |
| **Outcome** | What the worker reports: `OBSERVED` (price tag photographed) or `OUT_OF_STOCK` (empty shelf spot with its label). Both pay the same. |
| **Verdict** | The verifier's answer for a submission: pass or fail, every gate result, the extraction, a message for the worker. A demo override creates a new superseding verdict (flagged, never evidence). |
| **Decision** | The engine's job result: `DELIVER` (a photo passed, the report is submitted and the escrow settles) or `WITHHOLD` (no passing photo by the window end, the brand is refunded). |
| **Report** | The Markdown result delivered to the brand (`reportMd`): store, price or out-of-stock, verdict, evidence and payout tx links. |
| **Payout** | The tADA transfer from `W-PAY` to the worker after a passing verdict. Id `pay_…`, idempotent per task (`payout:<taskId>`). States: `QUEUED`, `SENDING`, `SUBMITTED`, `CONFIRMED`, `UNKNOWN`, `FAILED_FINAL`. |
| **Settlement** | The Masumi escrow outcome of a paid Sokosumi Task: `PENDING`, `DELIVER`/`RESULT_SUBMITTED`, `SETTLED`, or `WITHHOLD`/`WITHHELD`, `REFUNDED`. |
| **Evidence ledger** | Append-only, hash-chained JSON log of everything that happened (jobs, verdicts, payments, overrides with flags). The proof behind the pitch; never reset. |

## 4. Proof and checks

| Term | Definition |
|---|---|
| **Challenge (hand sign)** | The freshness proof (ADR-19): 2-5 raised fingers left or right of the tag, revealed only when the worker opens the camera and answered within 90 s. Older modes: hand-written code, printed card. |
| **Gates G1-G8** | Deterministic checks on every price photo ([verifier-rules.md](verifier-rules.md)): G1 image ok, G2 challenge (code or gesture) match, G3 readable, G4 product match, G5 price sanity, G6 timing, G7 not duplicate, G8 not a screen photo. Pass only if all pass. Out-of-stock photos use their own gate set. |
| **Geofence / location precheck** | Before verifying, the engine checks the browser location at capture against the store (radius plus accuracy). A deterrent, not proof. Coordinates are never stored. |
| **Intake filter** | The engine refuses any order or job whose store or product is not in the seeded **catalog** (ADR-16/17). |
| **Catalog** | The seeded lists of Munich stores (id, chain, address, location) and products (EAN, name, plausible price range). Everything a brand can order. |
| **Demo override** | Operator-only switch to force a verdict on stage; off by default, flagged in the ledger, refused in evidence runs. |
| **Evidence run** | A real run whose transactions count as milestone evidence: no fakes, no stub, no override, checked by `evidence-preflight.ts`. |
| **Fakes / stub** | `FAKE_PAYMENTS=1`, `VERIFIER_MODE=stub`, `SOKOSUMI_CLIENT=fake`: rehearsal modes without money or a model. Never evidence. |

## 5. Money, platforms and wallets

| Term | Definition |
|---|---|
| **Cardano preprod** | The Cardano test network. The only network Shelfie uses; mainnet is refused everywhere. |
| **tADA / lovelace** | Test ADA, the preprod currency (free from the faucet). Amounts are always integer **lovelace** (1 tADA = 1,000,000 lovelace). |
| **Sokosumi** | The agent marketplace where the Shelfie agent is listed and paid Tasks are created. Accounts hold **credits**. |
| **Sokosumi credits** | Sokosumi's unit for paying Tasks (1 test USDM showed as 100 credits). Spent by the account that creates the Task. Not x402. |
| **Masumi** | The payment layer under Sokosumi: escrow per paid Task (lock, result, settle or refund). Pays the brand-to-Shelfie fee. |
| **x402** | HTTP payment protocol: a `402` answer asks for payment, the buyer retries with a signed payment. Used by the engine to pay the verifier, per request. |
| **Escrow** | Funds locked by Masumi until the result is submitted (settle to the seller) or not (refund to the buyer). |
| **Blockfrost / Koios** | Cardano APIs: Blockfrost (keyed) for balances and submits, Koios (public) for independent checks of tx hashes. |
| **`W-VBUY`** | Wallet that pays the verifier (x402 buyer). Spend caps per payment and per run. |
| **`W-SELL`** | Wallet that receives verifier fees (address only, no key on the verifier). |
| **`W-PAY`** | Wallet that pays workers (payout queue). Per-payout and daily caps. |
| **`W-MPS`** | Masumi seller wallet that receives the escrow fee for paid Tasks. |
| **Worker wallet** | A worker's own preprod address (the four team members have demo worker wallets, [evidence/wallets.md](../codigo/docs/evidence/wallets.md)). Receives only. |
| **Idempotency key** | A unique key per paid action (`verify:<submissionId>`, `payout:<taskId>`, order key) so the same action twice pays once. |
| **Unclear payment** | A payment that may have been signed or sent but whose result is unknown; frozen until an operator checks the explorer. Never re-sent automatically. |

## 6. Infrastructure and process

| Term | Definition |
|---|---|
| **Hub** | The laptop that runs the engine, verifier and tunnel for the demo (Helmut's laptop; the shell and MPS run on Isabel's). |
| **Tunnel** | Cloudflare tunnel exposing only the engine to the internet (`api.shelfieapp.fyi`, `api-dev.…`). `hub-up.sh --tunnel` is the quick-tunnel fallback. |
| **`dev` / `main`** | `dev` is the integration branch (direct pushes, agent peer review); `main` changes only through the release PR with three approvals (ADR-0006). |
| **Peer review** | Each person's coding agent reviews the commits others pushed to `dev` (`scripts/peer-review.sh`, ok / issue). |
| **Roles A-D** | A Isabel (engine, shell, core), B Fernando (payments, verifier wrapper, scripts), C Lorenz (verifier gates, vision, eval), D Helmut (web, evidence, pitch). Ownership means "knows best", not "only one who edits" (ADR-0006). |
| **Milestones M1-M6** | M1 paid x402 request; M2 verifier and worker payout end to end; M3 unpaid Sokosumi Task; M4 paid Sokosumi Task with escrow; M5 withhold and refund; M6 live demo on phones ([repo-layout.md](repo-layout.md) 5). |
| **ADR** | Architecture decision record: design decisions in [decisions.md](decisions.md), repo decisions in `docs/adr/`. |
