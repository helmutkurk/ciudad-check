# Story-first ideation: Agentic Commerce on Cardano

Claude (Sonnet 5.5). Angle: start from the moment the jury remembers, then work back to a product. Constraints used: x402 = fast, per request, own tx hash. Masumi escrow = per job, at least 60 min per paid cycle, so the live stage never waits on it (pre-run, show the explorer link). Pay-on-result = withhold the result, so the buyer is refunded automatically. Jury wants: clear customer, pay tied to result, agents hiring agents or acting in the world, live tx in the explorer.

Notation: x402 = per request; Escrow = per job (Masumi/Sokosumi).

## 12 ideas

**1. PretzelRun.** Story: an office agent orders 20 pretzels for the jury room from a real Munich bakery. Demo: pretzels arrive while we pitch; payment releases when a photo is verified. Customer: offices and student groups ordering local food. x402: bakery-agent menu/price lookup, vision-check calls. Escrow: the order. Result: release only if a vision agent confirms item count in the delivery photo. Hires: order agent hires bakery-agent (a human with a Telegram bot) and verifier agent. Feasibility: low-medium; needs a real bakery partner, fallback is a teammate as "baker". Risk: logistics outside our control.

**2. Behörde Brief Decoder.** Story: an international TUM student gets a German Ausländerbehörde letter and panics. Demo: a juror hands over a real envelope; 60 seconds later: plain-language summary, deadlines, reply draft. Customer: roughly 10,000+ international students and expats. x402: OCR agent and legal-glossary agent, per page/lookup. Escrow: the whole decoding job. Result: paid only if every date and amount in the letter appears in the output (check against extracted entities); otherwise result withheld, refund. Hires: lead agent hires OCR, German-law glossary, translator. Feasibility: high. Risk: looks like "LLM summary" unless the payment chain is visible.

**3. Ground Truth (agents pay humans).** Story: AI cannot see the shelf in the shop next door, so it hires people. Demo: jurors scan a QR, get a throwaway preprod wallet in the browser, photograph a price tag in the room, and receive ADA on their own phone seconds later. Customer: shop owners, brands, researchers who need physical-world data. x402: each verified photo task, paid to the human. Escrow: the shop's research job that buys the bundle. Result: a photo is paid only if the verifier agent can read price and product and the location matches; bad photos earn nothing. Hires: research agent hires verifier agent, which gates payouts to humans. Feasibility: medium (browser wallet, QR, vision check). Risk: jurors who will not play; fallback is the team and volunteers.

**4. The Caller.** Story: the agent phones a real restaurant in German and books a table for the team. Demo: speakerphone, a human on the other end says "Ja, gerne". Customer: anyone avoiding phone calls; later clinics, craftsmen. x402: speech and TTS calls per minute. Escrow: the booking job. Result: pay only on a spoken confirmation plus confirmation code in the transcript. Hires: planner agent hires voice agent and transcript-checker. Feasibility: low (telephony, German TTS/STT, live latency). Risk: a live call can fail on stage; legal and annoyance concerns.

**5. Bahn Refund Hero.** Story: a train delayed 90 minutes; nobody files for the 25% refund. Demo: delay ticket in, a complete Fahrgastrechte claim out, filled live. Customer: commuters, TUM students. x402: timetable/delay-data agent and form-filler agent per call. Escrow: the claim job, success-fee logic. Result: paid only if the claim form passes a completeness and delay-threshold check. Hires: claim agent hires data agent and form agent. Feasibility: medium; we cannot verify actual payout from the Bahn in 30 h, so the check is "claim valid", not "money arrived". Risk: overpromise.

**6. Wohnungs-Dossier.** Story: Munich flat hunting; 400 applicants per listing. Demo: paste a listing, get a landlord-ready application pack (cover letter, document checklist, summary) in 90 seconds. Customer: students and newcomers. x402: listing parser, tenant-law/checklist agent per call. Escrow: dossier job. Result: paid only if the pack passes a checklist (documents named, no missing fields, matches listing requirements). Hires: dossier agent hires parser, letter writer, checker. Feasibility: medium-high. Risk: generic; the check is weaker than a number.

**7. Newsroom of Agents.** Story: during the pitch, a story about the hackathon is commissioned, reported, fact-checked and published to a real URL. Demo: refresh the page, the article is live with per-claim sources and a payment ledger. Customer: Vereine, local blogs, company comms. x402: reporter agents per paragraph, source-fetcher per request. Escrow: the commission. Result: each paragraph is paid only if every claim links to a fetched source that contains it. Hires: editor agent hires reporters and fact-checker. Feasibility: medium-high. Risk: buyers are vague.

**8. Shoebox Bookkeeper.** Story: a freelancer's receipt shoebox becomes books in minutes. Demo: dump 30 photos of the team's hackathon receipts. Customer: freelancers and small shops. x402: receipt OCR per receipt. Escrow: monthly books job. Result: objective, paid only if the extracted totals reconcile with the bank CSV to the cent. Hires: bookkeeper hires OCR agents and a category agent. Feasibility: high. Risk: low wow.

**9. Agent Warranty (guarantor).** Story: "who pays when an agent gets it wrong?" A guarantor agent stakes ADA on another agent's output. Demo: a bad result triggers payout to the buyer from the stake, on-chain. Customer: builders of agents and marketplaces. x402: guarantee quote and check calls. Escrow: the insured job. Result: the stake pays out if the independent checker fails the output. Hires: guarantor hires checker agents. Feasibility: low-medium (staking logic, likely needs a script or contract). Risk: infrastructure story with no end user; strong for "impact", weak for Cardano's "customer journey".

**10. ShopScout (baseline from team plan).** Story: a Munich shop owner needs a price recommendation. Demo: hire, escrow, x402 data purchase, report, gate. Customer: independent shops. Result: report check (sources, competitors). Hires: lead agent hires price specialist. Feasibility: high. Risk: the least memorable; many teams will pitch "research agent".

**11. Lost Bike Bounty.** Story: your bike is stolen in Munich; you post a bounty, agents search listings, you pay only when the match is verified. Demo: a staged listing page contains our teammate's bike; the scout agent finds it, the bounty releases. Customer: cyclists, insurers, bike shops. x402: each listing scan and image comparison. Escrow: the bounty, released only on a verified match (frame number or distinctive features). Hires: bounty agent hires scout agents and a verifier. Feasibility: medium; use a staged listing (scraping real marketplaces breaks their terms). Risk: staged data looks fake if we are not transparent.

**12. Altklausur Marketplace.** Story: a student pays for exam solutions only if they match the official key. Demo: a past exam solved by a solver agent, graded live against the key. Customer: TUM students (our own). x402: solver calls per question. Escrow: the exam set. Result: objective grading against the answer key, payment per question. Hires: tutor agent hires solver agents and a grader. Feasibility: medium-high. Risk: academic-integrity optics, niche.

## Weighted scores

Scores 1-10. Weights: Customer 20, Pay-on-result 15, Agent-hires/real-world 15, Demo wow 15, Originality 10, Feasibility 15, Impact 10.

| # | Idea | Cust | Pay | Hire | Wow | Orig | Feas | Imp | Weighted |
|---|---|---|---|---|---|---|---|---|---|
| 3 | Ground Truth | 7 | 8 | 9 | 10 | 9 | 6 | 7 | **7.95** |
| 2 | Behörde Brief Decoder | 8 | 8 | 7 | 8 | 6 | 8 | 8 | **7.65** |
| 5 | Bahn Refund Hero | 8 | 7 | 7 | 8 | 6 | 6 | 8 | 7.20 |
| 11 | Lost Bike Bounty | 6 | 9 | 8 | 9 | 7 | 6 | 5 | 7.20 |
| 8 | Shoebox Bookkeeper | 8 | 9 | 6 | 5 | 5 | 8 | 8 | 7.10 |
| 9 | Agent Warranty | 6 | 9 | 8 | 5 | 9 | 5 | 9 | 7.05 |
| 6 | Wohnungs-Dossier | 8 | 7 | 7 | 7 | 5 | 7 | 7 | 7.00 |
| 7 | Newsroom of Agents | 5 | 8 | 9 | 8 | 7 | 7 | 5 | 7.00 |
| 12 | Altklausur Marketplace | 7 | 9 | 7 | 6 | 6 | 7 | 6 | 6.95 |
| 4 | The Caller | 6 | 7 | 9 | 10 | 7 | 4 | 5 | 6.90 |
| 10 | ShopScout (baseline) | 7 | 8 | 7 | 6 | 4 | 8 | 7 | 6.85 |
| 1 | PretzelRun | 5 | 7 | 8 | 10 | 7 | 5 | 4 | 6.60 |

Scores are our judgment, not measured. Ground Truth is a mechanism as much as a product: it can be bolted onto ShopScout (the "price specialist" becomes humans in the room), which makes it the cheapest upgrade of the current plan.

## Top 3 in depth

### A. Ground Truth: "AI hires humans, per photo, on chain"

Product: a shop owner asks "what do competitors charge for oat lattes within 1 km?". The research agent (hired via Sokosumi, escrow held) breaks the job into micro-tasks, posts them to a task page, and pays humans per verified photo via x402. A verifier agent reads each photo and approves or rejects. The report is delivered only if enough verified data points exist, otherwise the result is withheld and the shop is refunded.

Arc:
- Hook (0:00): "Everything AI knows is on the internet. The price of a coffee at the café 200 m from here is not."
- Tension (0:20): shop owners decide prices blind; agencies cost thousands; scrapers see only websites.
- Reveal (0:45): the agent hires you. Jurors scan the QR in the video/live room; their phones show "photograph a price tag, earn ADA".
- Proof (1:15): photo uploaded, verifier approves, x402 payment lands on the juror's phone, tx in Cardanoscan. A blurry photo is rejected, earns nothing. Then the escrow job: report delivered, settlement link (pre-run).
- Vision (2:00): any physical fact becomes a priced task: shelf stock, menus, queue lengths, damaged signage; agents become employers of people, paid per verified result.

Risks:
- Wallet UX for jurors: use a browser-generated throwaway preprod wallet (no extension); fund the agent beforehand; pre-fund a fallback team-only run.
- Fraud (reused photos): hash plus EXIF location check, rate limit; admit that it is a prototype.
- The 60-minute escrow cycle: run it beforehand; live part uses x402 only.
- Ethics or "gig economy" objection: pay fairly, state that workers choose tasks.
- Preprod ADA has no value, so a juror may find payment unimpressive: make the live ledger and the verifier rejection the wow, not the amount.

### B. Behörde Brief Decoder: "Pay only if it caught every deadline"

Product: upload a photo of a German official letter; the lead agent hires OCR, translation and glossary specialists (x402 per call), assembles a plain-language summary, deadlines and a reply draft. A deterministic check compares dates and amounts in the output against entities extracted from the letter; if one is missing, the result is withheld and escrow refunds.

Arc:
- Hook: a juror's own letter (or ours) read aloud, in German officialese.
- Tension: a missed deadline means a lost residence permit or a fine; students pay for advice or ignore the letter.
- Reveal: 60 seconds later, a clear summary with the deadline circled, and the ledger showing three specialist agents paid by x402.
- Proof: a doctored run where the agent drops a date: no payment, refund link.
- Vision: the same pattern for tax, insurance, landlord letters; "paid per correct understanding".

Risks:
- Looks like an LLM wrapper: put the payment chain and the quality gate at the centre of the UI.
- Legal advice liability: disclaimer, "decoder, not lawyer".
- Letter privacy: use staged or consented letters only on stage.
- The entity check may be noisy; keep it to dates, amounts and reference numbers.

### C. Lost Bike Bounty: "Pay only when your bike is found"

Product: the owner posts a bounty with photos and frame details into escrow. Scout agents scan a feed of listings (x402 per scan and per image comparison); a verifier agent confirms the match; the bounty releases only on a verified match, otherwise it stays refundable.

Arc:
- Hook: a real stolen-bike story from the team (if one exists; otherwise label it as a scenario).
- Tension: police do not search; marketplaces are noisy.
- Reveal: scouts compete; the verifier flags one listing: same scratches, same sticker.
- Proof: bounty release tx; a decoy listing correctly rejected.
- Vision: bounties for any lost or hard-to-find item; insurers pay per recovered asset.

Risks:
- Data: a staged listing feed must be disclosed as such; scraping real marketplaces breaches terms.
- Image matching reliability on stage: pre-test with fixed photos.
- Narrow customer; weaker business case than A or B.

## Recommendation

Top pick: **Ground Truth** (7.95), because it is the only idea in which the audience takes part, an agent hires people, and every pay-on-result rule is visible within seconds (a bad photo earns nothing). Fall back to **Behörde Brief Decoder** (7.65) if the team does not trust the live-wallet interaction; it is the safest 30 h build. Either can reuse the ShopScout skeleton (lead agent, x402 specialist, check, escrow); decide at the Cardano workshop.
