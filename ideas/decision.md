# Idea decision — Shelfie

Inputs: [ideation-frameworks.md](ideation-frameworks.md) (15 ideas, business-model frameworks), [ideation-story-first.md](ideation-story-first.md) (12 ideas, demo-moment first), [../investigacion/cardano/competitive-landscape.md](../investigacion/cardano/competitive-landscape.md), the two runbooks in `../investigacion/cardano/`. Scores are the agents' judgement; the synthesis below is Claude's.

## Convergence

Two independent rounds, with different methods, ranked the **same concept first**: an agent that hires people on the street to photograph shelf prices, with a verifier agent that gates every payment ("Eyes on Ground" 4.25/5; "Ground Truth" 7.95/10). ShopScout scored 3.35/5 in the same rubric. The competitive scan adds one lesson: escrow-with-refund works best when the gate is a **deterministic pass/fail**, not an opinion about report quality.

## The chosen idea: **Shelfie** — verified shelf checks, paid only when the photo is true

**Customer:** the field-sales or category manager of a small consumer-goods brand (e.g. a Bavarian craft drinks or snack brand) who needs to know, this afternoon, whether its product is on the shelf in a given Munich store and at what price (MVP: one job = one store, one photo; ten stores = ten jobs, bundles are roadmap). Today this is "retail execution" work: field-marketing agencies or mystery-shopping panels, booked days ahead, paid per visit whether or not the data is usable. *(Inference: per-visit costs and delays to be backed with 1–2 sources in the pitch.)*

**Job:** "Check product X in this Munich store." (MVP scope, 2026-10-29, `diseno/decisions.md` ADR-16: N=1, K=1; multi-store K-of-N is roadmap.) An **intake filter** accepts only stores and products from seeded Munich catalogs. The brand hires the **Shelfie lead agent** on Sokosumi; the fee is locked in **Masumi escrow**.

**Agent chain:**
1. **Lead agent** (Sokosumi Coworker) validates the job against the catalogs (intake), turns it into one micro-task and posts the bounty.
2. **Humans** in the city see the task in a mobile web page; the first to claim it gets it (soft city check), and takes the photo with the live in-app camera only (no gallery), with browser location checked against the store at the shutter (ADR-17). If the product is not on the shelf, the worker photographs the empty spot with its shelf label instead (verdict OUT_OF_STOCK, same pay, the brand gets an out-of-stock report).
3. **Verifier agent** (separate service, paid **per check via x402**) runs a deterministic gate:
   - **Freshness:** the photo must show the task's **one-time hand sign** (2-5 raised fingers left or right of the tag), revealed only when the worker opens the camera and answered within 90 s; a photo of a screen is rejected. No pen or paper (ADR-19; printed or hand-written codes stay as a fallback mode). This proves the photo is new and for this task: Shelfie's signature anti-fraud trick.
   - **Readability:** a vision model extracts product name and price → both parse.
   - **Match:** the product matches the requested EAN/name.
   - **Sanity:** the price is within a plausible range.
   - **Timing:** server-side timestamp inside the task window.
4. **Pass →** the lead pays the human **on-chain right away** (preprod), and the row lands in the brand's report. **Fail →** no payout, and the task is reopened.
5. **Delivery:** if the photo passes, the report is submitted and the escrow settles. Fail → the worker may retry with a new hand sign; no passing photo by the window end → the result is withheld → **automatic refund** to the brand.

**Why it wins on the Cardano rubric (inference):**

| Judges want | Shelfie |
|---|---|
| Clear customer and journey | Brand manager, concrete job, real industry (retail execution) |
| Payment tied to result | Three gates: verifier pass → human payout; passing photo → report delivered and escrow settles; else refund |
| Agents hire agents / act in the real world | Lead hires a verifier agent (x402) **and** humans in physical stores |
| Live paid task + explorer tx | A photo is taken on stage → green check → payout tx appears live |
| Originality | Agents as employers of people, with a one-time hand sign as freshness challenge; nothing similar visible on Sokosumi |
| Beyond the hackathon | Retail audits, then generalises to any "proof-of-real-world" micro-task (deliveries, outages, accessibility checks) |

**Live moment:** one teammate stands up holding a product with a price tag. The hand sign appears on their phone; they hold up the fingers and shoot; the verifier highlights the price; it goes green; the payout tx shows on Cardanoscan. Then a "cheat" attempt (the live camera aimed at a laptop showing an old photo, or the wrong hand sign; there is no gallery path) is rejected live with no payment. Optional bonus: invite a judge to do it.

## Why not the others

- **ShopScout:** solid but generic, and its "report quality" gate is subjective. Its plumbing (lead agent + x402 specialist + escrow) is fully reused by Shelfie.
- **Behörde Brief Decoder** (7.65): safest build, but a document pipeline, with a weaker real-world/hire story. **Kept as Plan B:** it reuses the same architecture (task → worker → verifier → settlement) with an OCR worker instead of humans.
- **Termin-Sniper / CancelBot:** great business models, but bot-protected portals or long outcome latency → mock-only demos.
- **Verified Findings:** easiest, least emotional.

## Main risks and mitigations

| Risk | Mitigation |
|---|---|
| Escrow cycle ≥ 60 min | Run the escrow job early Saturday; on stage show the lock tx + the settlement/refund from earlier runs; the live part is the x402 + payout leg |
| Human payout is a plain transfer, not x402 | Pay from the lead's own wallet with the Cardano SDK (verify Friday morning); fallback: the human's phone page is a tiny x402 seller |
| Vision misreads tags | Demo uses price tags we print; the video uses real stores; the gate also accepts manual override **for the demo only**, clearly labelled |
| Location spoofing | Be explicit: the hand sign proves freshness, not location; roadmap: store-owned QR codes |
| Privacy in stores | No people in frame; shelves only; ask store permission for the video, or use our own shelf |
| Humans need wallets | Demo: teammates' preprod wallets; product: payout address or custodial-free wallet onboarding as roadmap |

## Adaptability rule

The system is built as a generic **verified micro-task engine**: `Job → Tasks → Worker (human | agent) → Verifier (rules) → Settlement`. Shelf checks are one **domain pack** (task template + verifier rules + report template). If judges' feedback or a sponsor talk changes the plan, swap the domain pack (e.g. Plan B: letters → OCR worker → date/amount checks) without touching payments, the agent shell or the UI frame.
