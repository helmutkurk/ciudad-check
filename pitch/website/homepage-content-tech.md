# Homepage content: technical, trust, roadmap, developer and legal parts

Status: draft for the /homepage builders, written 2026-10-30 night (Claude Sonnet 5.5 for the pitch side). English, no emojis. Every technical claim was checked against `diseno/`, `codigo/` and `codigo/docs/evidence/tx-hashes.md`; sources are named in brackets. Anything not built is labelled **Roadmap**. Hashes are copied from `tx-hashes.md`; never retype them. Network label everywhere: "Cardano preprod, test ADA, no monetary value".

Builder notes (from `codigo/vercel.json`, binding for the page):
- The site CSP is `default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'`. No inline script or style, no external fonts, scripts or images, no live calls to explorers. Explorer links as plain `<a href>` are fine (navigation is not restricted by this CSP).
- Referrer-Policy is `no-referrer`; outbound links should carry `rel="noopener"`.
- Hosting is Vercel (static `apps/web/dist`); `/api/*` is proxied to the engine on a team machine behind a Cloudflare tunnel. The homepage must not depend on `/api`.

---

## 1. Why trust Shelfie: the blockchain

**Headline:** Proof first, payment second, and the receipts are public.

**Subline:** Shelfie runs on Cardano preprod, the public test network. Every payment below is a real transaction with test money, and anyone can open it.

**Card 1: Funds are locked before the work starts.**
The brand's fee goes into a Masumi escrow contract on Cardano when the job is ordered. Neither Shelfie nor the brand can touch it while the job runs. [architecture.md, glossary.md "Escrow"]

**Card 2: Released only on a passing result.**
If a photo passes the verifier, the report is submitted and the escrow settles to Shelfie. If no photo passes before the window ends, Shelfie submits nothing and the escrow refunds the brand automatically. [ADR-11]

**Card 3: The verifier is paid per check, in public.**
Shelfie's engine pays the verifier agent 1 test ADA per photo over x402 (HTTP 402). Each check is its own on-chain payment, pass or fail, so the cost of verification is visible and cannot be hidden. [ADR-02]

**Card 4: Why not just a database?**
A database is a record the operator can edit. Escrow and receipts on a public ledger can be checked by the brand without trusting Shelfie, and funds move by contract rules, not by our promise. Shelfie's own ledger is also hash-chained, but the chain is the part we cannot rewrite. [ADR-01 evidence ledger, ADR-11]

**Card 5: Honest limits.**
This is a prototype on a test network: no mainnet, no real money. The payout address is public on the ledger. The hand sign proves a photo is fresh, not where it was taken; the location check is a deterrent, not proof. In the demo we run both sides of the verifier payment ourselves; a production verifier should be run by an independent party (ADR-18). [AGENTS.md, ADR-12, ADR-17, ADR-18]

What is on-chain and what is not (small table for the page):

| On-chain (Cardano preprod) | Off-chain |
|---|---|
| Escrow lock, result submission, settlement or refund | The photo and its gate results (stored on Shelfie's server, deleted after the event) |
| x402 verifier fee per check | Vision model reading (Google Gemini) |
| Worker payout (plain transfer, metadata label 674) | Location check (browser location, coordinates not stored) |
| Masumi agent registration | Hash-chained evidence ledger (Shelfie server) |

---

## 2. Receipts: real transactions on Cardano preprod

Source: `codigo/docs/evidence/tx-hashes.md`. Network: Cardano preprod, test ADA. Open each link on Cardanoscan. Times are as recorded (UTC). Short form: first 8 and last 6 characters.

**Read this before the table.** No single job has yet gone through the full chain with a verified real photo (lock, x402 check, payout, settlement on one Task). Each row is a real transaction from a separate test run, labelled as such. Do not present the settle or refund rows as the outcome of a verified photo [review/pitch-tech-check-2026-10-30.md, point 1].

### Main rows (five for the page)

| Step | Short hash | Honest label | Explorer URL |
|---|---|---|---|
| Escrow lock | `8415ae7d...cdd081` | Earlier test run. Fee locked in Masumi escrow (1 test USDM + 4.47 tADA collateral), job through the bridge, engine on fakes | https://preprod.cardanoscan.io/transaction/8415ae7d015d981ac14605f796b46ac58da61cf9150f3e710bfa0fd728cdd081 |
| x402 verifier fee | `cbc9cb5d...78474d` | Real payment, 1 tADA from the engine's buyer wallet to the verifier's wallet. The verdict came from a stub reader, so the check itself is not evidence | https://preprod.cardanoscan.io/transaction/cbc9cb5d4d70bbfbc4a43e8817570db610b61cace150696107eab4734d78474d |
| Worker payout | `1abef825...e510d8` | Real run, no fakes: 3 tADA from the payout wallet to a team member's demo wallet through the engine's payout queue (no double pay on re-enqueue or restart) | https://preprod.cardanoscan.io/transaction/1abef82575d1bfa75e64d9f0d9e40e733fe964e9bc6c9cee333e23a994e510d8 |
| Escrow settlement | `0614b337...b752d0` | Escrow settlement under the Shelfie agent registration, engine on fakes (synthetic photo). An escrow settlement, not the settlement of a verified real photo | https://preprod.cardanoscan.io/transaction/0614b337065b50701df9589d47e5c205a43b409c057eeb109d043042b0b752d0 |
| Escrow refund | `ca8f5de9...7fa1d6` | Escrow test run, no photo: engine decided WITHHOLD, no result submitted, buyer refunded about 30 minutes after the lock | https://preprod.cardanoscan.io/transaction/ca8f5de9d66a6aa4657d9f8dbf64670f7bbd7e9b66c61355a816ad8ae47fa1d6 |

### Further rows (optional "all receipts" list)

| Step | Short hash | Label | Explorer URL |
|---|---|---|---|
| Escrow lock (first paid Task) | `5a1bb0bb...1312b5` | Earlier test run under the organisers' starter agent registration | https://preprod.cardanoscan.io/transaction/5a1bb0bb5fc6f2a520228ec819a97681855331193498a1c785e2479bc81312b5 |
| Result submitted (same Task) | `f7fad4e5...3d1726` | Same earlier run, starter registration | https://preprod.cardanoscan.io/transaction/f7fad4e57b3f24c89f5e296308aef1e2d22914b246f4f1c32360f8f5253d1726 |
| Settlement (same Task) | `b3e38993...1b2746` | Earlier test run, starter registration "Hackathon Team Name Finder", before Shelfie was registered; 1 test USDM to the seller wallet, collateral back to buyer | https://preprod.cardanoscan.io/transaction/b3e38993fbda017a2d24ada72474825b8d1afbb91ffce149610b0063f21b2746 |
| Escrow lock (Shelfie registration) | `c6147b08...e3efd2` | Task created by a direct REST call to Sokosumi (ADR-20 phase 0), engine on fakes | https://preprod.cardanoscan.io/transaction/c6147b082bf4553ee421c735b8a7670bbb7150af4a39978b772ef69b95e3efd2 |
| Result submitted (same Task) | `1c505e4c...44d0ce` | Shelfie registration, engine on fakes | https://preprod.cardanoscan.io/transaction/1c505e4c66b02745888d5507a806931a1c08201c5ed52116550b26018e44d0ce |
| x402 fee, first run | `1547a4a7...bb955a` | Real payment; buyer timed out after 120 s waiting for confirmation, so no receipt was printed; hash read from the chain, exactly one transaction | https://preprod.cardanoscan.io/transaction/1547a4a767e2963f35cd7b03547c66f3c52beaeb13f451c0e6501bd6fdbb955a |
| Worker payout, plain SDK transfer | `60d49a3a...e7b6e7` | Real run, no fakes: 2 tADA, metadata `shelfie:payout-once-...` | https://preprod.cardanoscan.io/transaction/60d49a3a5e17919834460f3bb9ad13d5f092a128c5e69590c576bc92d2e7b6e7 |
| Agent registration "Shelfie" | `40160269...89db56` | Masumi registry entry, RegistrationConfirmed, fee 0.27599 tADA | https://preprod.cardanoscan.io/transaction/40160269be813ddf067efb62bee296738b6893d70b1593e97caeec4af589db56 |

Short forms are first 8 and last 6 characters of the full hash; builders should generate them in code (`hash.slice(0, 8) + "..." + hash.slice(-6)`). The full hashes and URLs are authoritative.

Setup transactions (faucet funding, internal wallet transfers) are in `tx-hashes.md` and are not shown on the page.

---

## 3. Read more: deep dives

### 3.1 Cardano, eUTxO and preprod
Cardano records value as unspent transaction outputs (UTxOs). A transaction consumes whole outputs and creates new ones; its result is known before it is submitted, so fees and outcomes are predictable. The "extended" UTxO (eUTxO) model lets an output carry a script and data, which is how escrow contracts such as Masumi's are built: the script decides when the locked funds may be spent. Shelfie uses the preprod network only: it is Cardano's public test network, with the same rules as mainnet but free test ADA (tADA) from a faucet. Amounts in Shelfie are integer lovelace (1 tADA = 1,000,000 lovelace). Mainnet is refused by the code on purpose; the network guard runs at startup of every service. Preprod payments settle in seconds to a minute or two: one x402 settlement waited about 96 seconds for one confirmation before the team switched to a zero-confirmation policy for the verifier [verified.md]. [glossary.md, `.claude/rules/security.md`]
Links: https://docs.cardano.org/ · https://developers.cardano.org/ · https://docs.cardano.org/cardano-testnets/tools/faucet (builder: confirm the eUTxO explainer page on docs.cardano.org before linking it directly)

### 3.2 Masumi escrow and the agent registry
Masumi is the payment and registry layer under Sokosumi. An agent is registered on-chain (we did this for "Shelfie", tx `40160269...89db56`), and each paid Task locks the buyer's funds in a Masumi smart contract (V2) through the Masumi Payment Service. The seller then submits a result hash. If the result arrives, the funds can be withdrawn by the seller after an unlock time; if not, the buyer can reclaim them. Shelfie maps this to its own rule: a passing photo means the engine decides DELIVER and the shell submits the result; no passing photo means WITHHOLD and no result is submitted, so the refund applies. Measured on preprod: settlement came about 46 minutes after the payment request (36 minutes unlock plus polling), a refund about 32 minutes. Say "30 to 45 minutes" [verified.md, pitch-tech-check point 6]. The Masumi fee in tests was about 1 test USDM (shown as 100 Sokosumi credits). In the demo, Shelfie places the order on the brand's behalf, so the buyer and seller side are both ours (ADR-20).
Links: https://www.masumi.network/dev · https://www.masumi.network/tum-hackathon/agent-guide.md · https://github.com/masumi-network/tum-hackathon-quickstart

### 3.3 x402: HTTP 402 payments, and how the verifier is paid per check
x402 is an open standard that uses the HTTP status 402 "Payment Required": a server answers a request with the price, the client signs a payment and retries, the server serves the result. Cardano has its own scheme (`@x402/cardano`), with a hosted facilitator run by the Cardano Foundation that checks and relays the wallet-signed transaction without holding keys or funds. In Shelfie the verifier exposes `POST /v1/verify`, priced at 1 tADA. The engine's buyer wallet signs the payment under a spend cap per payment and per run; the verifier only knows the seller address and holds no key. The fee is paid for every check, pass or fail, and the transaction hash is written to the evidence ledger as `VERIFY_PAID`. The engine rejects location failures before calling the verifier, so those cost no fee. Packages are pinned: `@x402/*` 2.26.0 and `@evolution-sdk/evolution` 0.5.14. Latency per verdict is planned at 12 to 15 seconds including settlement. [ADR-02, ADR-08, verified.md, tx rows `cbc9cb5d...78474d`, `1547a4a7...bb955a`]
Links: https://developers.cardano.org/x402/ · https://docs.x402.org · https://www.x402.org · https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_cardano.md

### 3.4 Sokosumi: how a brand hires the agent
Sokosumi is an agent marketplace built on Masumi. The Shelfie agent is listed there as a Coworker. A brand creates a Task for it (product and one Munich store, chosen from our seeded catalog; free text is rejected by the intake filter), pays in Sokosumi credits, and Masumi locks the fee in escrow. Our shell, a thin fork of the organisers' starter, picks up the Task and creates one engine job. Today there are two entry paths: the Sokosumi interface, and the order form on our own dashboard, which places the same Sokosumi Task through Sokosumi's REST API with Shelfie's own account (ADR-20; verified once by a direct REST call, `POST /v1/tasks`, 201 in 0.58 s). The order API is not public: it needs an access code and is capped per order and per day because it spends Shelfie's credits. In production the brand would pay with its own account; that is Roadmap. One job is one store and one photo (N=1, K=1). [ADR-16, ADR-20, verified.md]
Links: https://www.sokosumi.com · https://preprod.sokosumi.com/signup (preprod, test credits)

### 3.5 The verifier gates G1 to G7 and the out-of-stock path
A vision model only reads the photo; plain code decides. All gates are evaluated and reported, and the photo passes only if every gate passes. In plain words: G1 the image is usable (decodable, large enough, not blank); G2 the one-time hand sign in the photo matches the one issued; G3 price and product text are readable; G4 the product matches the order (barcode or fuzzy name match); G5 the price is plausible for that product; G6 the photo arrived inside the time window (server clock, not the phone's); G7 the photo is not a duplicate or near-duplicate. A further gate, commonly listed as G8 (`not_screen`), rejects a photo of a screen. If the product is not on the shelf, the worker photographs the empty spot with the shelf label instead; a separate gate set checks that the label is readable, it matches the product, and the slot is empty. That pays the same and the brand gets an out-of-stock report. A different product in the slot is rejected on purpose, because a misplaced item cannot be told apart from a fake. [verifier-rules.md sections 2 and 2a; AGENTS.md says G1-G7, glossary and ADR-19 add G8]
Links: https://github.com/helmutkurk/shelfie/blob/dev/diseno/verifier-rules.md (builder: confirm the branch the repo is published on before linking)

### 3.6 The one-time hand sign and the live camera
To prove a photo is new and made for this task, the worker's app shows a hand sign (2 to 5 raised fingers, left or right of the price tag) only when the camera opens, and the photo must arrive within 90 seconds. There are 8 possible signs, so a blind guess passes this one gate with probability 1 in 8; the other gates and the location check still apply. Photos come only from the live in-app camera (`getUserMedia`); there is no gallery path. The sign is hidden from the verification model and from rejection messages, so a throwaway photo cannot reveal it. A worker has at most 3 attempts per task. Honest limit: a printout of the tag plus the right fingers would pass, and the sign does not prove location. A fallback mode with printed code cards exists as configuration (`CHALLENGE_MODE`), in case hand reading proves unreliable. [ADR-19, pitch-tech-check "Confirmed by the code"]

### 3.7 Location check (geofence) and its limits
The app reads the phone's location twice: at claim, to check the worker is in the store's city, and at the shutter, to check the distance to the store (default radius 150 m, with the reported accuracy considered). The check runs before the verifier is called, so a photo taken elsewhere is refused with no fee. Exact coordinates are not stored; only the result (distance, accuracy, within or outside) is kept. Browser location can be spoofed, so this is a deterrent, not proof. Roadmap: store-owned QR codes or attested capture, which need store cooperation. [ADR-17, security.md D2, product-roadmap.md 4a]

### 3.8 Vision models: Gemini primary, OpenAI fallback, and why fixed rules decide
The verifier sends one downscaled, re-encoded photo (no metadata) to a vision model and asks for strict JSON: price text, product text, barcode digits, hand sign, shelf-label and slot fields, and an advisory flag for screens. Gemini through its OpenAI-compatible endpoint is the primary provider (`gemini-3.5-flash-lite` plus a Gemini backup in the shared deployment; mean 8.5 s, p95 13.2 s in our test run). An OpenAI adapter exists as a fallback; it is not configured or verified in the current deployment. The model never sees the expected hand sign, product or price, so it cannot confirm what it is told to expect. Its output is untrusted data: our code parses numbers itself and decides pass or fail with fixed thresholds. We chose this because a refund or a payout must rest on a rule that can be explained, not on a model's opinion. The model is replaceable through configuration. [verifier-rules.md 3, ADR-07, verified.md]
Links: https://ai.google.dev/gemini-api/docs/openai

### 3.9 Architecture overview (text diagram for the builder to turn into a figure)

```
Brand ──orders──> Sokosumi / Masumi ──fee locked in escrow (Cardano)
                        │
                        ▼
                  Shell (Coworker bridge)
                        │ creates job (ids only)
                        ▼
   Worker phone ◄──► Engine ──── Evidence ledger (hash-chained JSONL)
   (web app /w:      │  │
    live camera,     │  └── Payments: W-VBUY (x402 buyer), W-PAY (payouts)
    location)        │            │                       │
                     │            │ x402 paid POST        │ plain transfer
                     │            ▼ /v1/verify            ▼ + metadata
                     │        Verifier ── Vision model   Worker wallet
                     │        (gates G1-G8)  (Gemini)
                     ▼
        Decision: DELIVER ──> result submitted, escrow settles
                  WITHHOLD ─> no result, escrow refunds the brand
        Brand dashboard (/dashboard): orders, verdicts, ledger, tx links
```

Layers: web (worker app and dashboard, Vercel), engine (state machines, intake, dispatch, decisions), verifier (separate x402 service), payments (wallets, queue, idempotency), evidence (ledger and explorer links). Engine, verifier and shell currently run on team machines; the web app is on Vercel and the engine is exposed through a Cloudflare tunnel. [architecture.md, glossary.md]

---

## 4. For developers

- **Repository:** https://github.com/helmutkurk/shelfie (git remote `origin`; working branch `dev`, release branch `main`). Public from the first push (ADR 0003).
- **License:** Business Source License 1.1 (BUSL-1.1), licensors: the four team members. Allowed: copying, modifying, redistributing and non-production use, with an Additional Use Grant for evaluation, education, research and judging of the TUM Blockchain & AI Hackathon 2026. Production use needs separate permission. On 2030-10-31 (or the fourth anniversary of a version's first public release, whichever is earlier) the code converts to Apache License 2.0. It is source-available, not OSI open source, and grants no trademark rights. Third-party dependencies and the organisers' starter and x402 template code keep their own licenses [LICENSE, NOTICE, ADR-0004]. Parameters are pending the team IP agreement.
- **Stack:** TypeScript monorepo (npm workspaces, Node 24); engine on Express; verifier is an x402 Express seller; web app in React (Vite); shell is a fork of the Masumi hackathon starter (plain JavaScript); `@x402/*` 2.26.0 and `@evolution-sdk/evolution` 0.5.14 for Cardano; Vitest, ESLint, Prettier; Vercel for the web app, Cloudflare tunnel for the engine; Google Gemini for vision.
- **Tests:** the last recorded run of `npm run check` (typecheck, lint, tests) reported 435 + 29 tests passing (the 29 are the shell bridge's `node --test` suite) [docs/ai-log.md, 2026-10-30 21:45]. Rerun before publishing the number.
- **Run locally (fakes, no money):** from `codigo/`: `npm ci`, `npm run check`. Then start `FAKE_PAYMENTS=1 VERIFIER_PAYMENT=off npm run start -w @shelfie/engine`, `VERIFIER_PAYMENT=off VERIFIER_MODE=stub npm run start -w @shelfie/verifier`, `npm run dev -w @shelfie/web`. Web at `http://127.0.0.1:5173/w` and `/dashboard`. Smoke test: `npm run hub-up -- --fake` then `npm run smoke`. [codigo/README.md]
- **API entry points that exist in code** (`apps/engine/src/http/app.ts`, `apps/verifier/src/app.ts`):
  - Engine, public reads: `GET /api/health`, `GET /api/config`, `GET /api/catalog`, `GET /api/tasks`, `GET /api/tasks/stream` (SSE), `GET /api/jobs`, `GET /api/jobs/:jobId`, `GET /api/jobs/:jobId/decision`, `GET /api/payouts`, `GET /api/ledger`, `GET /api/ledger/stream`, `GET /api/submissions/:submissionId`.
  - Engine, worker flow: `POST /api/tasks/:taskId/claim`, `POST /api/claims/:claimId/challenge`, `POST /api/claims/:claimId/release`, `POST /api/tasks/:taskId/submissions`.
  - Engine, brand orders (access code in `X-Brand-Token`, rate limited, capped): `GET /api/orders`, `GET /api/orders/:orderId`, `POST /api/orders` (with an `Idempotency-Key` header).
  - Engine, shell or admin only: `POST /api/jobs`, `POST /api/jobs/:jobId/settlement-events`, `POST /api/jobs/:jobId/cancel`, and `/api/admin/*`.
  - Verifier: `POST /v1/verify` (x402, 1 tADA), a dry-run route `/v1/verify-dry`, and `GET /health`.
  - Do not document `/api/auth/*`: the wallet sign-in flow is in the design only; confirm before listing.
- **Docs:** `diseno/` (architecture, contracts, verifier rules, decisions), `docs/adr/`, `codigo/docs/verified.md` (facts checked during the build), `codigo/docs/evidence/` (receipts).

---

## 5. Build process

**Window:** Friday 2026-10-30 09:00 to Saturday 2026-10-31 15:00 (Devfolio deadline); feature freeze Saturday 11:00; last paid escrow cycle started by Saturday 13:00. Preparation before Friday 09:00 was docs and configuration only; the code was written during the event, on top of the organisers' starter templates (listed with pinned commits in `verified.md`). [AGENTS.md]

| Milestone | Plan | Status at time of writing (2026-10-30 night) | Evidence |
|---|---|---|---|
| M1 paid x402 request | Fri 11:30 | Done (Fri afternoon, CET): two real payments, 1 tADA each. Verdict from a stub reader | `1547a4a7...bb955a`, `cbc9cb5d...78474d` |
| M2 agent pays agent, agent pays human | Fri 15:00 | Payment legs done on real preprod: x402 fee, plain SDK payout, engine payout queue (idempotent). A full run through the deployed engine with a real store photo is not yet logged | `60d49a3a...e7b6e7`, `1abef825...e510d8` |
| M3 hired via marketplace (unpaid) | Fri 13:00 | Done: unpaid Sokosumi Tasks completed through the bridge, engine on fakes | `verified.md` (Task ids) |
| M4 paid escrow for a job | Fri 20:00 | Done as an escrow cycle (lock, result, settle) with the starter registration, and again under the Shelfie registration with the engine on fakes | `5a1bb0bb...1312b5`, `f7fad4e5...3d1726`, `b3e38993...1b2746`, `c6147b08...e3efd2`, `1c505e4c...44d0ce`, `0614b337...b752d0` |
| M5 withhold and refund | Fri night | Done: no photo, WITHHOLD, refund about 30 minutes after the lock (engine on fakes) | `8415ae7d...cdd081`, `ca8f5de9...7fa1d6` |
| M6 front end and live ledger | Sat 11:00 | In progress: worker app, dashboard and homepage built; a full real cycle with a store photo through the deployed engine is open (B-14, T-27) | `docs/ai-log.md` |

Update this table from `tx-hashes.md` and `ai-log.md` before the page is frozen.

**How we worked with AI agents.** Each team member worked with a coding agent (Claude Code or Codex) under one shared rule file, `AGENTS.md`, and a mandatory context check before any change. Everyone pushed to the `dev` branch; each person's agent peer-reviewed the commits of the others (`scripts/peer-review.sh`), and `main` changes only through a release pull request with three approvals. Design and repository decisions are written as ADRs (`diseno/decisions.md`, `docs/adr/`), facts checked against reality go in `codigo/docs/verified.md`, and every session is logged in `docs/ai-log.md` with what was done, what is open and the handoff. A technical review in the last hours checked every pitch claim against the code and corrected several [review/pitch-tech-check-2026-10-30.md].

---

## 6. Roadmap

Nothing below Now is built. Source file in brackets. Not commitments.

**Now: built at the hackathon (Cardano preprod)**
- Verified shelf check: one product, one Munich store, one photo, per job (N=1, K=1) [ADR-16]
- Escrow with refund through Masumi and Sokosumi; x402 pay-per-check verifier; on-chain worker payout [ADR-02, ADR-04, ADR-11]
- Hand-sign freshness proof, live camera only, location precheck, out-of-stock path [ADR-17, ADR-19]
- Hash-chained evidence ledger, worker app, brand dashboard with orders [ADR-20, architecture.md]

**Next: weeks**
- Move the backend from a team laptop to a cloud VM; the shared deployment still runs on a team machine [README.md, docs/START-HERE-TEAM.md]
- Brands order through Sokosumi REST with per-order and per-day caps, real credits, many stores [ADR-20, verified.md]
- Store-owned QR codes for stronger location proof [ideas/decision.md, product-roadmap.md 4a]
- Multi-store jobs with a K-of-N rule (already a pack field) and bundles of checks [ADR-16, product-roadmap.md 4a]
- Pilot in Munich with a handful of brands, human review on top of the gates, legal and store-permission checks [product-roadmap.md phase 1]
- Measure finger-count reliability on a real photo set; second-worker sampling of out-of-stock reports [ADR-19, product-roadmap.md 4a]

**Later: vision**
- Worker onboarding and payout without crypto friction (payout address, wallet onboarding or fiat payout) [ideas/decision.md, product-roadmap.md 5]
- Brand pays with its own account; independent verifier chosen by the brand; multi-verifier agreement for large jobs [ADR-18]
- Generalise the engine beyond shelves: deliveries, opening hours, accessibility checks, outages, as new domain packs [ideas/decision.md, product-roadmap.md phase 3]
- Pay per passed store for partial results, if Masumi supports it [product-roadmap.md 4a]
- Mainnet only after a security audit and legal review. This is a proposal in this document, not an existing repo decision; the code refuses mainnet today [glossary.md, `.claude/rules/security.md`]
- Marketplace where third parties post and fulfil tasks [product-roadmap.md phase 3]

**Vision line:** Agents will need eyes in the physical world; we make those eyes verifiable and paid.

---

## 7. FAQ

**Is this real money?**
No. Shelfie runs on Cardano preprod, a public test network. All amounts are test ADA or test USDM with no monetary value. The EUR figures on the story page are illustrative.

**What happens if the photo fails?**
Nothing is paid to the worker. The worker can retry with a new hand sign, up to 3 attempts. If no photo passes before the window ends, the result is withheld and the escrow refunds the brand, about 30 to 45 minutes later on preprod.

**Can a worker fake a photo?**
There is no gallery path, the hand sign is revealed only when the camera opens and must match within 90 seconds, a photo of a screen is rejected, and duplicates are rejected. It is not perfect: a printout of a tag plus the right fingers could pass, and a blind guess passes the hand-sign gate 1 time in 8. We list these limits openly.

**Does the location check prove the worker was in the store?**
No. It checks browser location against the store, which can be spoofed. It is a deterrent. Store-owned QR codes are on the roadmap.

**Why does the verifier get paid even when the photo fails?**
The verifier does the work either way, so it is paid per check, pass or fail. A verifier paid only on a pass would be tempted to approve bad photos. In the demo we operate both sides ourselves and say so; a production verifier should be independent.

**Why a blockchain and not a normal payment provider?**
The escrow rule (release on a result, refund otherwise) runs as a contract that neither side controls, and every payment is publicly checkable. A normal provider would also work for payments; the point of this prototype is that agents pay agents and people without a trusted middleman. Whether a brand wants to deal in ADA is open, and fiat payout is on the roadmap.

**What data do you keep?**
The photo, the worker's payout address and a display name, for the event. Exact coordinates are not saved. Photos are deleted after the event. The payout address and transaction are public on the ledger and cannot be erased. See the privacy notice below.

**Is Shelfie open source?**
The code is public and source-available under BUSL-1.1: free for evaluation, education, research and judging; production use needs permission; it converts to Apache 2.0 on 2030-10-31 at the latest.

---

## 8. Legal drafts

> **Draft, not legal advice.** These texts were written by an AI assistant for a student hackathon project and have not been reviewed by a lawyer. Placeholders in square brackets must be filled by the team before publication. Do not invent or guess them.

### 8a. Impressum (§ 5 DDG, Germany)

Shelfie is a student project, not an official product of the Technical University of Munich (TUM) or of the organisers of the TUM Blockchain & AI Hackathon.

Provider (jointly, as natural persons, team "Los Curiosos"):
- Helmut Kurk Sierra
- [FULL NAME Isabel] (the story page shows "Isabel Sagastume"; `AUTHORS.md` still lists a placeholder, so the team must confirm)
- [FULL NAME Fernando] (story page: "Fernando Mayo"; confirm)
- [FULL NAME Lorenz] (story page: "Lorenz Hermannstädter"; confirm)

Postal address (a street address where documents can be served is required): [POSTAL ADDRESS]
Contact by email: [CONTACT EMAIL]
A second quick contact channel is required by § 5 DDG; an email address and a contact form or phone number usually satisfy it: [PHONE OR CONTACT FORM, optional if the legal advice allows email only]

Responsible for content under § 18 (2) MStV: [NAME AND ADDRESS, one of the four members]

No commercial activity, no VAT number. The service is a non-commercial prototype operating on a test network. Liability for content and links follows the general statutory provisions; external links are checked only at the time of linking.

### 8b. Privacy notice (DSGVO / GDPR)

**Controller.** The four team members named in the Impressum, jointly (Art. 4(7) and Art. 26 GDPR; the team should agree who handles requests). Contact: [CONTACT EMAIL]. No data protection officer has been appointed.

**What we process and why.**

| Data | When | Purpose | Legal basis |
|---|---|---|---|
| Phone location | At claim (city check) and at the shutter (distance to store) | Check that you are in the store's city and near the store | Art. 6(1)(a) consent (consent screen) |
| Photo of a shelf or price tag | When you submit | Verify the price tag and product; deliver the report | Art. 6(1)(a) consent; Art. 6(1)(b) to provide the check you took part in |
| Payout address (Cardano preprod), display name, an opaque worker id | When you register or claim | Send your test payment; identify your claim | Art. 6(1)(b) and Art. 6(1)(a) |
| Server and hosting logs | Each request | Operate and secure the service | Art. 6(1)(f) legitimate interest |

**Location.** Read in your browser only when you claim a task and when you take the photo. Exact coordinates are not saved or logged; only the outcome (distance, accuracy, inside or outside the radius) is kept.

**Photos and AI service.** Your photo is sent to our server and to an AI vision service, currently Google (Gemini); the design also allows OpenAI as a fallback. The photo is downscaled and re-encoded without metadata before it is sent. Both providers are located in the USA, so this is a transfer to a third country. [Transfer mechanism, e.g. EU-US Data Privacy Framework or Standard Contractual Clauses: team to confirm per provider.] Photograph shelves and price tags only. Do not photograph people; if a person is visible, the verifier records it as a note.

**Payout address on the ledger.** A payout is a Cardano transaction. It is public on the Cardano preprod ledger and cannot be deleted or changed by us or anyone else; the right to erasure cannot be fulfilled for on-chain data. Preprod addresses carry no real funds.

**Hosting and logs.** The web app is hosted on Vercel. The engine runs on a team machine and is reached through a Cloudflare tunnel. These providers process technical request data (such as IP address and time) as part of delivering the service, under their own terms. Our engine's request log is designed to store only method, route, status, duration and record ids, not request bodies, query strings or IP addresses [security.md 4.6]; confirm against the deployed configuration. No analytics, advertising or tracking tools are used.

**Cookies and local storage.** The current code sets no cookies [grep of `codigo/apps` and `codigo/packages`, 2026-10-30; design documents describe an HttpOnly session cookie that is not implemented, so recheck before publishing]. The worker app stores worker id, display name, payout address, consent version and a location hint in your browser's local storage on your device; you can delete it in your browser. Dashboard access codes are kept in memory only. Because nothing is stored for tracking, no cookie banner is planned; the legal reviewer should confirm.

**Retention.** Photos: kept on the team server until the end of the event (planned: Saturday 2026-10-31 evening) and then deleted; photos chosen for the pitch are kept only if no person is visible and the author agreed. Payout address and worker records: until seven days after the event, then deleted from our store [security.md 4.9, planned]. On-chain data: permanent. Consent text shown in the app: "Photos are deleted after the event."

**Your rights.** Access (Art. 15), rectification (Art. 16), erasure (Art. 17, except on-chain data), restriction (Art. 18), data portability (Art. 20), objection to processing based on legitimate interest (Art. 21), and withdrawal of consent at any time (Art. 7(3)) with effect for the future. Contact: [CONTACT EMAIL]. Complaints: the competent supervisory authority for Bavaria is the Bayerisches Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, https://www.lda.bayern.de (team to verify the address before publishing).

**Declining.** If you decline on the consent screen, the worker app stays read-only and nothing is submitted.

### 8c. Terms for checkers (short draft)

1. Shelfie is a prototype for a hackathon. It runs on the Cardano preprod test network.
2. Payments are test money (test ADA) with no monetary value and no promise of any payout in real currency.
3. Taking a check is not employment and creates no employment, freelance or other work relationship with the team or with TUM.
4. Photograph shelves and price tags only. Do not photograph people, staff, customers, or anything private. Delete nothing from the store and do not move products except as the task describes.
5. Respect the rules of the store: ask for permission where required, and stop if staff ask you to. Do not trespass and do not take risks to complete a task.
6. Use only the live in-app camera and your own location. Do not fake photos, locations or hand signs. We may refuse or reverse a payout for abuse, and we may remove a worker from the app.
7. A payout happens only if the photo passes the automatic checks. A failed photo is not paid, even if you acted in good faith.
8. We may change or stop the service at any time. The service is provided "as is".
9. German law applies. [Place of jurisdiction: team to decide with legal advice; for consumers statutory rules apply.]

### 8d. License and IP note

Shelfie's code, design documents and pitch material are licensed under the Business Source License 1.1 (see `LICENSE`), with the four team members jointly as licensor, copyright 2026. Non-production use is allowed, including evaluation, education, research and hackathon judging; production use needs separate permission; the license converts to Apache License 2.0 on 2030-10-31 or earlier as the license text provides. The license grants no trademark rights in the name Shelfie or the logo. Third-party dependencies, the organisers' starter (`masumi-network/tum-hackathon-quickstart`) and code derived from the Cardano x402-express template keep their own licenses and notices; their exact license terms are marked "verify" in `NOTICE`. The team's ownership arrangement is a draft pending written confirmation (`docs/ip-agreement.md`); full legal names are still placeholders in `LICENSE`, `NOTICE` and `AUTHORS.md`. Team photos and the logo on the story page were supplied by the team.

---

## 9. Claims in the current story page that need correction

Checked `codigo/apps/web/public/story/index.html` against the repo:
1. "Order: A brand picks one product and a Munich store ... The fee is locked in Masumi escrow." Accurate for the Sokosumi path. The dashboard order form is gated by an access code, and the real-REST engine path has not yet been run end to end through the engine (needs `SOKOSUMI_CLIENT=real`); in the demo Shelfie places the order on the brand's behalf. Soften or add "in the demo".
2. Closing buttons "Order a verified shelf check, or earn by taking one" and "Take checks and get paid": workers receive test ADA with no value, and the orders and dashboard need an access code. Use "Try a check (test money)" or similar.
3. "Already running: Real transactions on Cardano preprod" with the receipt rows removed: the preprod statement is correct, but the section now shows nothing to back it. Add the receipts table above, with its honest labels.
4. "Verify: fixed rules decide pass or fail" is accurate. "Photo passes: the person is paid on-chain and the report is delivered" is accurate, but "paid" happens at verifier pass and the escrow settles later (30 to 45 minutes); say so if timing is shown.
5. "A hand sign ... proves the photo is new": correct; add that it does not prove location.
6. Full team names on the page (Isabel Sagastume, Lorenz Hermannstädter, Fernando Mayo) are not in `AUTHORS.md` or `LICENSE`, which still hold placeholders; confirm before they appear in the Impressum.
7. The consent text says photos go to "Google or OpenAI"; only Google is configured and verified today.
