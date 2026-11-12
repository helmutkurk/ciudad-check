# Ideation via business-model frameworks and judging-criteria fit (Cardano track)

Claude, framework angle. Sources: the official brief, team-plan.md (ShopScout), and the two runbooks. Scores are my judgment; items marked (verify) are not confirmed by any runbook.

## Constraints that shape every idea

- x402: fast, per request, hosted preprod facilitator, headless buyer. It pays BEFORE the result, so it cannot gate on quality. Best for agent-to-agent purchases of inputs.
- Masumi escrow: per job, heavy setup, at least 60 min per paid cycle (payout about 46 min after submission, refund about 30 min after the submit deadline). Pay-on-result works only by withholding the result, which triggers the auto-refund.
- Consequence: the quality gate must run BEFORE submission and be mostly deterministic (schema, arithmetic, URL liveness, reproduction), so it can be shown and defended in 30 seconds.
- Two legs per idea: customer -> lead agent (escrow, gated) and lead -> helpers (x402 or direct tx).

## 1. Divergent phase: 15 ideas

Technique tags: SCAMPER (S), inversion (I), jobs-to-be-done (J), analogy (A), constraint-as-feature (C).

1. **CancelBot** (J, A: Kuendigungsbutton). Customer lists subscriptions they want gone; the agent emails the providers with a correct cancellation, tracks replies, and is paid only when a written confirmation arrives. Real-world action. Gate: confirmation email parsed (provider, end date).
2. **Mietwaechter** (J, A: legal-tech contingency). Tenant uploads a rent-increase letter; the agent checks it against the local rent index and statutory caps (verify the figures), drafts an objection, and sends it after one human tap. Chain: letter parser -> rent-index lookup specialist (x402) -> drafter. Gate: every number reconciles with the cited table.
3. **Eyes on Ground** (I: the agent hires humans). A brand pays for verified shelf prices or stock in physical Munich shops. The lead agent posts micro-bounties; humans with a phone web page send a photo; a vision verifier agent (hired via x402) checks timestamp, location and the price tag; the human is paid on pass. Real-world, chain, vivid.
4. **RFQ Auction** (A: procurement reverse auction). A small business posts a request for quote; three supplier agents bid live (each bid fee paid by x402); the lead picks the cheapest bid that passes a spec check on a sample. Chain with visible competition.
5. **Verified Findings** (A: bug bounty, C). A shop owner pays for accessibility and broken-link findings on their site. Finder agent crawls; two independent verifier agents (x402) reproduce each finding during the escrow lock; only reproduced findings are in the delivered report. Pay-on-result by construction.
6. **Locale Gate** (S: Combine with back-translation). An indie app developer sends string files; the agent translates, a glossary specialist and a back-translation verifier (x402) check placeholders, length limits and meaning drift. Deterministic gate.
7. **Termin-Sniper** (J, C: the wait is the product). The customer escrows a fee; the agent watches a scarce public appointment portal for a window of an hour or more, books the first slot that fits, and delivers the confirmation. No slot, no result, auto-refund. The escrow lock duration is the monitoring window. Real-world action.
8. **Tender Radar** (A: procurement). Finds public tenders matching an SME and extracts requirements. Twist: gate checks every tender link is live and the deadline is in the future. Research-clone risk.
9. **Spend Guard** (S: Eliminate trust). A policy proxy in front of x402 payments: per-agent budget, allowlist, human approval by a button. Demo: the agent tries to overpay a rogue seller and is blocked. Infrastructure, weak pay-on-result.
10. **Claim Agent** (A: no-win-no-fee, flight-delay claims). Files a compensation claim by email; fee only on payout. Perfect business model, but the outcome takes weeks, so the demo is simulated.
11. **Allergen Auditor** (J). Restaurant uploads a menu; chain: menu parser -> ingredient specialist -> compliance checker; gate: all 14 mandatory allergen fields filled per dish and consistent with ingredients.
12. **Listing Agent** (J). Photos in, listing published and buyer questions answered; success fee on sale. Real-world publishing, but sale latency kills the demo.
13. **Belegagent** (J). Receipts in; OCR specialist -> tax-category specialist -> export. Gate: net + VAT = gross on every line and totals reconcile. Useful, but a back-office clone.
14. **Fresh-or-Cached Market** (C, S). A data seller prices each x402 call by data freshness; buyer agents with a budget decide whether to pay for fresh data. Vivid price ticker, no human customer.
15. **Guarantor Agent** (A: insurance, bonding). A third agent stakes collateral behind a worker; if the worker's check fails, the buyer is compensated. Original but needs contract logic we do not have.

Coverage check: real-world action = 1, 2, 3, 7, 10, 12; agent-hires-agent chains = 2, 3, 4, 5, 6; vivid demo moments = 3 (human photo lands, payment appears), 4 (live bidding), 7 (booking confirmation arrives); escrow latency as feature = 5 (verification window), 7 (watch window).

## 2. Scoring (1-5 per criterion, harsh on feasibility)

Weights: Customer and business case 20%, Pay-on-result 15%, Hire/act 15%, Demo 15%, Originality 10%, Feasibility 15%, Beyond-hackathon 10%.

| # | Idea | Cust | Pay | Hire/act | Demo | Orig | Feas | Impact | Total |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 3 | Eyes on Ground | 4 | 4 | 5 | 5 | 5 | 3 | 4 | **4.25** |
| 7 | Termin-Sniper | 4 | 5 | 4 | 5 | 4 | 2 | 3 | **3.90** |
| 5 | Verified Findings | 4 | 5 | 4 | 3 | 3 | 4 | 3 | **3.80** |
| 1 | CancelBot | 4 | 4 | 4 | 4 | 3 | 3 | 4 | **3.75** |
| 2 | Mietwaechter | 5 | 3 | 4 | 3 | 4 | 2 | 4 | 3.60 |
| 4 | RFQ Auction | 3 | 3 | 5 | 4 | 3 | 3 | 3 | 3.45 |
| 6 | Locale Gate | 3 | 4 | 4 | 3 | 2 | 4 | 3 | 3.35 |
| - | ShopScout (reference) | 3 | 4 | 4 | 3 | 2 | 4 | 3 | 3.35 |
| 11 | Allergen Auditor | 4 | 3 | 4 | 2 | 3 | 3 | 4 | 3.30 |
| 10 | Claim Agent | 4 | 5 | 3 | 2 | 2 | 2 | 4 | 3.20 |
| 9 | Spend Guard | 3 | 1 | 3 | 4 | 4 | 3 | 4 | 3.05 |
| 14 | Fresh-or-Cached Market | 2 | 1 | 4 | 4 | 4 | 4 | 2 | 2.95 |
| 13 | Belegagent | 3 | 3 | 4 | 2 | 2 | 3 | 3 | 2.90 |
| 8 | Tender Radar | 3 | 3 | 3 | 2 | 2 | 3 | 4 | 2.85 |
| 12 | Listing Agent | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 2.85 |
| 15 | Guarantor Agent | 2 | 4 | 3 | 3 | 5 | 1 | 3 | 2.85 |

Feasibility reasoning for the harsh scores: Termin-Sniper needs a scrapable target and gets ToS and bot-defense risk (we would demo against a mock portal, which weakens "real world"); Mietwaechter needs correct legal data and carries liability; Eyes on Ground needs a working photo upload page, a vision check, a second wallet leg and willing humans, but all are plain TS and a vision API call; Guarantor needs on-chain logic nobody on the team has.

## 3. Deep dives on the top four

### 3.1 Eyes on Ground

- **Persona:** the category manager of a small consumer-goods brand in Bavaria (or a shop owner like ShopScout's) who needs to know what products really cost and whether they are on the shelf in 10 specific Munich shops this afternoon. Today: an agency or a mystery-shopping panel, days of delay, flat fees regardless of quality.
- **Pitch:** "Order a verified shelf check in Munich; an agent hires local people for photos, and every payment, to the human and to the verifier, happens only after the photo passes."
- **Money shot:** a teammate standing in a shop (or the room) takes a photo on a phone; on the main screen the verifier agent highlights the price tag, the check turns green, and a payment to the teammate's wallet appears with an explorer link, within the pitch. The failing case follows: a blurry or old photo is rejected, no payment.
- **Agent chain:** Customer -> Lead agent (Sokosumi Coworker, escrow) -> Dispatcher (turns the request into micro-tasks) -> Human photographers (web page, CIP-30 or pasted address) -> Verifier agent (vision plus metadata, bought via x402) -> report compiler -> Lead.
- **Payment split:**
  - Customer -> Lead: Masumi escrow for the whole report (needs at least one full cycle recorded early).
  - Lead -> Verifier: x402 per photo checked (cheap, fast, many txs for the demo ledger).
  - Lead -> Human: direct preprod payment from the lead's wallet after the verifier passes (verify that the SDK in the runbook can send plain transfers; if not, run the human as a tiny x402 seller whose endpoint returns the photo, and accept that this leg pays before the check).
- **Quality gate:** photo timestamp within the window, geolocation within a radius of the shop (or a shop QR code scanned in the photo), price tag legible by the vision model, product matches the requested one, and the price is within a sanity range of the model's prior. If fewer than N of M shops pass, the compiler withholds the result and the customer is refunded.
- **Risks:** humans must have wallets (mitigate: teammates only for the demo, honest framing as pilot with a payout address field); vision accuracy (use printed price tags we control for the demo, real shops for the video); GPS spoofing is trivially possible (say so; roadmap: shop-owned QR codes); photos of shops raise privacy questions (no people in frame).
- **Fallback if escrow fails:** drop Masumi, keep x402 for verifier and a direct payment for humans, and show the pay-on-pass logic in the app. The customer leg then becomes "pay-per-verified-photo" via x402 (pay-before-delivery caveat stated) while escrow is presented as the next step. Core demo survives.

### 3.2 Termin-Sniper

- **Persona:** a TUM international student who needs a residence-registration or ID appointment at a city office where slots vanish in seconds. Today: refreshing the page for days.
- **Pitch:** "Pay a fee into escrow; the agent watches the portal until a slot appears, books it, and only then gets paid."
- **Money shot:** the escrow lock is shown, the mock portal releases a slot live, the agent books within seconds, and the confirmation PDF appears in the app. The refund case: the window ends with no slot, no result is submitted, the refund tx is shown.
- **Agent chain:** Customer -> Lead (escrow) -> Watcher agent (polls portal) -> CAPTCHA/availability specialist is out of scope; instead a Calendar-fit agent (checks the customer's free times, bought via x402) -> Booker.
- **Payment split:** escrow for the whole job (the lock duration IS the monitoring window, the natural fit with the latency); x402 only for the calendar-fit and notification helpers, which is thin.
- **Quality gate:** booking confirmation page contains the customer's name, an office, a date within the customer's accepted range, and a reference number.
- **Risks:** real portals forbid bots and use CAPTCHAs; a mock portal is honest but weakens the real-world claim; only one helper leg makes the chain weak; the wait is boring unless the mock fires on stage. Highest feasibility risk of the four.
- **Fallback:** demo with a mock portal and label it plainly; if escrow fails, x402 pay-per-booking with the refund shown as simulated.

### 3.3 Verified Findings

- **Persona:** the owner of a small shop with a web shop who wants to know what is broken on the site (dead links, missing alt text, cart errors) but cannot judge a freelancer's findings.
- **Pitch:** "You pay only for problems that two independent agents could reproduce."
- **Money shot:** a deliberately broken demo shop; the finder lists 12 issues; verifiers strike 3 as not reproducible; the report shows 9, with a reproduction screenshot per finding and a payment ledger per verification.
- **Agent chain:** Customer -> Lead (escrow) -> Crawler/finder -> Verifier A and Verifier B (separate agents, bought per finding via x402) -> compiler.
- **Payment split:** escrow for the report; x402 per verification (many small txs, good ledger).
- **Quality gate:** a finding is in the report only if both verifiers reproduce it; the report is submitted only if at least K findings survive; else withheld and refunded.
- **Risks:** looks like a "technical audit tool" that judges may find less emotional; the customer is real but small; originality moderate (bug bounty analogy). Easiest to build of the four.
- **Fallback:** drop escrow; x402-only flow with the verification pass shown in the UI.

### 3.4 CancelBot

- **Persona:** a student or freelancer with five forgotten subscriptions in Germany.
- **Pitch:** "We cancel your subscriptions; you pay only when the provider confirms in writing."
- **Money shot:** a real cancellation email goes out and the confirmation lands in the inbox on stage; the parser extracts the end date and releases the result.
- **Agent chain:** Customer -> Lead (escrow) -> Provider-lookup specialist (cancellation address and legal wording, via x402) -> Email sender -> Inbox watcher/parser.
- **Payment split:** escrow for the cancellation job; x402 per provider lookup.
- **Quality gate:** confirmation email from the provider domain with a cancellation reference and end date; else result withheld.
- **Risks:** real providers answer slowly and rarely within the demo; we would use a cooperative test provider (our own mailbox), which is honest but staged; email deliverability and spam filters; legal wording must be correct.
- **Fallback:** demo with a controlled provider mailbox and show a pre-recorded real round trip.

## 4. Recommendation

**Pick Eyes on Ground, built on the ShopScout plumbing.**

Why it beats ShopScout (3.35 vs 4.25):
- Originality and demo: ShopScout is a "research agent" with a refund; Eyes on Ground has a physical, live, human moment that no other team will have, and it covers the judges' "act in the real world" and "agents hire" lines at once (the agent hires people AND a verifier).
- Pay-on-result is richer: two gated payments (customer and human) instead of one, and the gate is visible (photo accepted or rejected).
- Business case: shelf and price audits are an existing paid service with a clear buyer; the same buyer as ShopScout's persona, so the pitch story carries over.

Why it is riskier: it adds a web page for photos, a vision check, and a second wallet leg, which ShopScout does not have. Three mitigations:
1. Keep ShopScout's milestones M1-M5 as the base. The specialist price API stays as the fallback data source: if the human leg is not ready, the lead agent buys web prices via x402 and the product degrades to ShopScout without changing the pitch.
2. Fix scope to 3 shops, 3 products, teammates as photographers. Record the failing photo case first because it needs no human.
3. Decide at the 12-hour mark: if no photo has passed the gate end to end, ship ShopScout with the "ground truth" leg shown as roadmap.

Runner-up if the team dislikes the human leg: Verified Findings (easiest, escrow window used as a feature).

Open items to verify with Masumi mentors: can the lead agent send plain transfers with the x402 SDK wallet, and can escrow timeouts be shortened for a live demo.
