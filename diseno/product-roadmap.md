# Product roadmap: from hackathon MVP to a business

Status: proposal and inference, written 2026-10-29. Nothing here is a decision, a validated market claim or a commitment. No market numbers are given; every figure needed later is marked "source needed". Helmut may keep the project closed and run or sell it after some months; this file keeps that option open. Facts about the current product: `ideas/decision.md`, `contracts.md`, `architecture.md`. Screens for both apps: [webapps.md](webapps.md).

## 1. Customer segments (inference)

| Segment | Who | Need | MVP status |
|---|---|---|---|
| **Brands / field sales** | Small consumer-goods brands with a regional listing (persona Katharina Brandl, fictional) | Is my product on the shelf, at what price, today | In the MVP (shelf-check job) |
| **Exporters entering Germany** | Producers from outside Germany, for example South America (Helmut's example) | Shelf prices, competitors, positioning and price corridor before entering the market | Roadmap; uses the same shelf data plus desk research |
| **Agencies** | Field-marketing, mystery-shopping or retail-execution agencies | Capacity and proof for their own clients, white label | Roadmap; unvalidated |

Each segment needs interviews before it counts as a segment. Today none has been interviewed.

## 2. Offer per segment (proposal)

| Segment | Offer | Pricing logic (hypothesis) |
|---|---|---|
| Brands | Shelf check: MVP one store and one verified photo per job, report with evidence, pay per passed check; later N stores with K-of-N (section 4a) | Per verified check (storyline illustrates EUR 5; unsourced) |
| Exporters | Market-entry brief: field study of comparable and competitor products in chosen cities and store types, plus sourced desk research, report and evidence appendix | Per brief (scope-based) plus per check; no price proposed |
| Agencies | Capacity API and evidence layer | Per check or subscription; not designed |

The deterministic gate (pay only for a passing photo) is the common promise. The market-entry brief changes what is asked per store (more products, more fields), not the payment logic.

## 3. What the shelf network produces

| Data | Source today | Notes |
|---|---|---|
| Observation: product, store, shelf price (EUR), timestamp, photo | Verified submissions (verdict extraction) | Freshness proven by the code, location not proven (soft city check at claim only) |
| Evidence: tx hashes, hash-chained ledger | `packages/evidence` | Audit trail for customers |
| Quality signals: pass/fail per gate, attempts | Verifier | Input for tuning, private |
| Aggregates over time: price by product, store type, city | Not built | Needs enough observations; the value for exporters depends on coverage we do not have |
| Placement, facings, promotions, competitor products | Not extracted today | Would need extra extraction fields and rules (webapps.md open question 8) |
| Desk research: costs, regulation, logistics | Not produced by the system | Human or model research with sources; tagged separately from shelf data |

## 4. Phases (proposal)

| Phase | Goal | Scope | Exit signal (hypothesis) |
|---|---|---|---|
| 0 Hackathon (Fri-Sat) | Working, evidence-backed demo on Cardano preprod | Shelf-check pack, worker app, dashboard, verifier, payouts, escrow cycle where it works | Submission with tx hashes and video |
| 1 Pilot in Munich | Real customers and real workers in a small area | A handful of brands or one exporter, small worker group, human review on top of the gate, legal and store-permission checks | Customers accept the report and the price; checks pass at an acceptable rate |
| 2 Germany | More cities and chains | Worker onboarding and payout without crypto friction, customer accounts, aggregated data, repeat checks | Repeat customers, stable unit economics |
| 3 Marketplace | Third parties post and fulfil tasks; other domain packs | Multiple customers and agents, domain packs beyond shelves (deliveries, outages, accessibility) | Packs that run without us |

Chain choice later (preprod now, mainnet or fiat payouts) is open; see the risks.

### 4a. Job model extensions (moved here by ADR-16, 2026-10-29)

| Extension | MVP | Later | Why it waits |
|---|---|---|---|
| Stores per job | One store, one product, one photo, one worker (N=1, K=1) | N stores with a K-of-N rule (for example K = ceil(0.6 N)); the rule is already a pack field (`settlement.kDefault`, `jobInput.maxStores`), so it returns without engine redesign | Partial delivery: some photos pass, workers are already paid, the job misses K and is refunded, which is a Shelfie loss; also a longer, riskier demo |
| Partial payment for partial results | Not offered | Pay the brand price pro rata per passed store (needs per-store escrow or a partial-settle mechanism; verify what Masumi supports) | Escrow is all-or-nothing in the stock flow (verify Friday) |
| Intake catalogs | Seeded list of known Munich stores and products | Self-service catalog growth (new chains, cities, products) with review; live store lookup | Allowlist keeps impossible jobs out; growing it needs moderation |
| Worker location | Soft browser-geolocation: city at claim, geofence distance at capture (ADR-17) | Store-owned QR codes, attested capture | Browser location is spoofable; real proof needs store cooperation |
| Dispatch | Task shown to all workers in the city, first claim wins | Assignment by distance and reputation, push | Needs a worker pool and reputation data |
| Out-of-stock observation | Accepted outcome with its own gates, same payout | Second-worker sampling of out-of-stock reports, per-worker ratio flags, shelf-gap and facing counts | Needs volume to calibrate fraud signals |

## 5. Key risks (inference)

| Risk | Why it matters | Mitigation idea |
|---|---|---|
| Customer demand unproven | No interviews, no sourced pricing | Interviews with brands and exporters in the pilot; get 2 price sources (storyline) |
| Photo authenticity and location | Code proves freshness only | Store-owned QR codes; sampling by humans |
| Workers need payout addresses | Friction for non-crypto workers | Fiat payout option or custodial onboarding (roadmap) |
| Legal | Photographing in stores, worker status (gig work), data protection, tax | Legal advice before the pilot; store permission; shelves only, no people |
| Data coverage for exporters | A useful brief needs many stores and repeats | Start with a narrow category and city |
| Price and unit economics | Verifier cost per check and failed checks are paid; margin unverified | Measure in the build, model with real costs |
| Dependence on Masumi/Sokosumi/x402 | External stack and terms | Keep the pack and engine independent of the shell |
| Competition | Crowd-audit and mystery-shopping providers exist | Benchmark them (storyline source list) |

## 6. What stays private vs could be open source (proposal)

| Item | Proposal | Reason |
|---|---|---|
| Worker network, worker identities, payout addresses, reputation | Private | Core asset, personal data |
| Verifier thresholds, prompts, eval set and labels, anti-cheat details | Private | Make gaming easier if published |
| Collected shelf data and customer reports | Private | Product and customer confidentiality |
| Customer lists, pricing | Private | Business |
| Engine skeleton, state machines, payout queue idempotency, evidence ledger format | Could be open source | Generic; builds trust; low moat |
| Domain-pack interface and an example pack | Could be open source | Enables the marketplace phase |
| Design docs | Mixed | Public at submission per repo rules; later release is a decision |

Hackathon constraint: the repo is public at submission (repo-layout section 3). Whatever is private later must not be committed now; an export script for a later public repo is a separate task.

## 7. Open questions

1. Open or closed after the hackathon, and who decides (team vs Helmut)?
2. Is the exporter segment pursued in the pilot or only mentioned?
3. Payment rails beyond the chain: fiat payouts and invoicing.
4. Team commitment after Saturday (unknown).
