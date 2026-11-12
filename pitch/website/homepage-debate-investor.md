# Homepage plan: investor and judge position paper

Reviewer role: startup investor and Cardano-track judge ("Agentic Commerce on Cardano"), 2026-10-30 night. Inputs: `homepage-ia.md`, `homepage-content-tech.md`, `homepage-market-research.md`, `../archive/homepage-brief.md`, `../ideas/decision.md`, `../review/pitch-jury-2026-10-30.md`, `/story/index.html`. No other files changed. Copy at the end is a proposal; every number in it comes from `homepage-market-research.md` with its status.

## 1. Positions

**T1, separate `pitch.html`: agree, and build it first.** The pitch screen is what gets scored on Saturday; the home is what judges open during Q&A and on Devfolio. Order of work tonight: `pitch.html` (six screens, frozen by 09:30 for rehearsal 3), then home, then subpages. No `?pitch` mode on the home: hidden-content logic on stage is avoidable risk.

**T4, 13 pages: disagree. Ship 6 files tonight.**

| Ship | Holds |
|---|---|
| `index.html` | the scroll story, all home sections |
| `pitch.html` | six screens of the brief |
| `market.html` | both problems in depth, field-check deep dive, sources table, ROI, TAM/SAM/SOM, unit economics |
| `technology.html` | one anchor per technology, architecture, full receipts table, limits (absorbs `trust.html` and `how.html`) |
| `imprint.html` | Impressum (legally needed if public in Germany) |
| `privacy.html` | camera, location, no cookies, retention |

Cut: `how.html` (home section is enough; edge cases go to `technology.html#failures`), `trust.html` (merge), `roadmap.html` (home strip is enough), `developers.html` (link to the GitHub README, which builders already maintain), `terms.html` and `license.html` (footer links to `LICENSE` on GitHub plus one "Prototype, test money, no warranty" line). Every cut page is a sentence in the footer, not a broken link. If time remains after 09:30, add `developers.html` first.

**Hero numbers: lead with cost per check, not with trillions.** The VC judge already scored us down for top-down market numbers. `$1.7T inventory distortion` is all of retail, mostly overstock and returns that a photo does not fix; on the home it reads as padding. Lead with what the buyer pays today: German test purchase from about EUR 50, US audit visit $30-45, Shelfie about EUR 12 (illustrative). Second, the spend that makes field checks matter: about 20% of CPG revenue goes to trade promotion (McKinsey, 2019). Third, the gap: brands believed about 70% in-store compliance, audits measured about 40% (Shop!, 2016, US displays).

**Are McKinsey / Shop! / Kimberly-Clark strong enough?** McKinsey 20%: yes, label "McKinsey, 2019, global". McKinsey 59% lost money: true but about promotion ROI, not execution; using it next to "who checks the shelf" implies a causal link we cannot show. Keep it off the home; on `market.html` only with the ROI wording. Shop! 70/40: usable with the full label "Shop! study 2016, US displays, as quoted by Roamler"; it is our best gap number. Kimberly-Clark 15-50%: one brand, 2013 audits; anecdote on `market.html` only. Beroe $6B: market card with "estimate, single publisher". Every stat caption carries publisher, year and scope; no totals added across sources.

**Home order (first three screens decide).** Screen 1: H1, subline, two CTAs and a one-line status strip ("Cardano preprod · Masumi escrow · x402"), visible without scrolling. Shorten the pinned cart room from 400vh to about 200vh; four beats are fine, but an investor must not scroll four screens to learn the customer. Screen 2: the two problems. Screen 3: cost per check (bars). Then how it works, market, ROI, why trust, receipts, roadmap, team, developers, FAQ, CTA.

**Receipts honestly.** Say it before the table: "Five real transactions from separate test runs. No single job has yet run end to end with a real photo; that is our next milestone." Each row gets a status pill: `Real run` (payout), `Real payment, stub verdict` (x402), `Test run, synthetic photo` (lock, settle), `Test run, no photo` (refund). Judges reward stated limits; they punish discovered ones. If a full run lands before 11:00, replace the rows and the sentence.

**ROI block: one example, 50 stores a month,** only sourced comparators plus our illustrative price. Drop the "EUR 120,000 of promotion money buys nothing" exposure calculation: it stacks a 2016 US display study on a hypothetical EUR account. Drop "76% saving" as a headline: scope differs. Show the numbers and the scope caveat, then unit economics (EUR 7.80 gross per check, about 65%, hypothesis) on `market.html`.

**TAM/SAM/SOM.** TAM $6-6.2B (Beroe, estimate), Europe more than $1.2B (derived). Drop the 5% SAM: it is an invented share. Replace SOM with "Pilot math": 20 brands x 50 stores x 12 months = 12,000 checks = EUR 144,000 a year at EUR 12, all assumptions. Smaller, but defensible in Q&A.

**Risky claims to drop or fix:** `$1.1T` and "trillion-dollar problem" (derived, wrong scope); "paid per visit, usable or not" (unsourced); "separate verifier agent" (say "separate service, today we run it; the brand can swap its URL"); "Take checks and get paid" (test ADA has no value: "Try a check, test ADA"); "Order ... a Munich store" without "in the demo" (Shelfie places orders on the brand's behalf); any "agreed prices" (resale price maintenance is illegal in the EU: say "promotions you paid for", "what the shelf tag says"); any lead time, "within 24 hours" or "10x cheaper"; consent text naming OpenAI (only Google is configured).

**"Check a foreign market without knowing anyone."** The real request already is this story, seen from the other side: a drinks maker abroad who knows nobody in Germany. Munich is his foreign market. Phrase: "Built for brands that need eyes in a market where they know nobody. We start in Munich, where we can walk the stores ourselves." Never claim other cities or countries; "any city" is roadmap.

## 2. Proposed copy

**Hero**
- H1: Paid only when the photo is true.
- Subline: Verified shelf checks for brands without a field team. A person nearby photographs the shelf, an agent checks the photo, and Cardano escrow releases the fee only if it passes.
- CTA 1: See how it works
- CTA 2: Try a check (test ADA)
- Status line: Prototype on Cardano preprod · test money · prices illustrative

**Problem (2 cards)**
- *A market where you know nobody.* A drinks maker abroad asked us for photos of German shelves. He had no one to ask, no way to trust a stranger's photo, and an AI can't see a shelf.
- *Field teams to check one shelf.* Brands pay agencies or their own reps to confirm the product is there, the tag is right and the paid promotion ran. They pay per visit, booked in advance.

**Market (4 stats)**
- ~20% of CPG revenue goes to trade promotion. *McKinsey, 2019, global*
- ~70% vs ~40%: in-store compliance brands believed vs what audits measured. *Shop! study, 2016, US displays*
- $6B a year in in-store merchandising services. *Beroe, 2023 estimate*
- EUR 50+ for one German test purchase; $30-45 for a US audit visit. *mystery.agency; T-ROC, 2026*

**ROI: 50 stores, one month**

| Option | Cost |
|---|---|
| German test purchases | from EUR 2,500 |
| US audit visits | $1,500-2,250 |
| Shelfie, pay per passed check | EUR 600 |

Caption: Illustrative price of EUR 12 per check, charged only when the photo passes. A test purchase does more; a Shelfie check proves presence and the shelf price, nothing else.

**Why trust: the blockchain**
- Headline: Proof first, payment second.
- Sub: The money moves by contract rules on Cardano, not by our promise. Every step leaves a public receipt.
- *Locked before work starts.* The brand's fee sits in Masumi escrow on Cardano. We cannot spend it while the job runs.
- *Released only on a pass.* A passing photo settles the escrow. No passing photo in time: the brand is refunded automatically.
- *Every check is a receipt.* The verifier is paid per photo over x402, pass or fail, as its own on-chain payment.
- *The verifier is swappable.* Today we run it; a brand can point the job at its own verifier URL.
- Limit line: Test network only. The hand sign proves a photo is fresh, not where it was taken.

**Roadmap**
- Now (built, preprod): one product, one Munich store, one photo per job · escrow with automatic refund · x402 pay-per-check verifier · one-time hand sign, live camera only, out-of-stock path
- Next (weeks): one full job end to end with a real photo · pilot with a handful of Munich brands · multi-store jobs and check bundles · store-owned QR codes for location proof
- Later: payouts without crypto friction · brand-chosen independent verifiers · new checks beyond shelves: deliveries, opening hours, accessibility · mainnet after a security audit and legal review

Vision line under the roadmap: Agents will need eyes in the physical world. We make those eyes verifiable and paid.
