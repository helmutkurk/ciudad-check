# Shelfie storyline

The narrative spine for the video, the live pitch and the Devfolio text. Every other pitch file must stay consistent with this one. Facts about the product come from `../ideas/decision.md`; anything not verified is marked.

## The real request (replaces the fictional persona)

An acquaintance of Isabel's father wants to bring a beverage to Germany. He asked Helmut and Isabel whether they could go to a few shops and photograph comparable products: what they cost and whether they are on the shelf. It is a real request, not a customer: say "a real request", never "our customer", "pilot" or "validated". Isabel tells it in first person (wording: [pitch-plan.md](pitch-plan.md) section 2).

- **Customer type:** a brand entering a market without a field team. Before launch it needs competitor prices and availability in specific stores. Each job buys one verified data point: one store, one product, one photo (ADR-16); a study needs many, multi-store bundles are roadmap.
- **What we prove:** price and presence (or the empty spot). Never claim placement, facings, share of shelf or "market research".
- **Privacy:** never name the person, the drink, the brand or the country of origin. Tell the story in public only with his consent (asked via Isabel's father); without it say "an acquaintance of my father" and show no message screenshot.
- **Facts from Isabel:** when the request came, stores and photos actually done, time spent, usable photos. Real numbers only. [ISABEL]
- His options today: walk the stores himself or ask friends (he is abroad and cannot check the photos), or book a field-marketing agency or mystery-shopping panel, paid per visit whether or not the photo is usable. A quick merchandising audit visit costs about $30-45 (US vendor rate card), a German Testkauf about EUR 50-260 per visit (agency price lists); see [market-pricing.md](market-pricing.md). Lead time: [SOURCE NEEDED].

## The spine

| Beat | Line / idea | What the judge sees |
|---|---|---|
| Hook | Isabel: "A friend of my father's wants to bring a drink to Germany. He asked Helmut and me to photograph the competitors in a few shops." | One of their real shelf photos (brands blurred, no people) |
| Tension | He is abroad and cannot check their photos; they would walk for hours; an agency bills every visit, usable or not. An AI can write him a report; it cannot see the shelf. | A blurry or wrong-shelf photo from their own walk |
| Reveal | "Shelfie: an agent that hires people to look, and pays them only if the photo is true." | Sokosumi task: "the question he asked us": one comparable drink, one Munich store |
| Proof | Escrow locks the fee. A person in a store opens the camera, which only then shows a one-time hand sign (2-5 fingers, left or right of the tag, 90 s); they photograph the tag with that hand beside it; a verifier agent (paid per check over x402) reads price, product and sign; green = payout tx on preprod; an old photo without the sign = red, no payment. (Fallback if ADR-19's kill criteria trigger: a printed code card.) | Real screens, real tx hash on preprod.cardanoscan.io |
| Result | If the photo passes, the report is delivered and escrow settles. If no photo passes in time, the brand is refunded automatically. | Report table, then (or alternatively) refund tx |
| Vision | "Anything an AI needs to know about the physical world can be bought this way: proof first, payment second." Next: store-owned QR codes for location, other domain packs (deliveries, outages, accessibility). | One line, homepage section below the close |
| Callback | Isabel: "Next time he doesn't call us. He posts a job. Cardano escrow makes sure nobody pays for a photo that isn't true." | Homepage close section |

Demo order on stage: the cheat first (red, no money), then the true photo (green, payout tx). Run of show: [live-pitch.md](live-pitch.md).

## Hook line (first 28 seconds)

The real request, told by Isabel (word for word in [live-pitch.md](live-pitch.md)), ending on: "An AI can write a report, but it can't see a shelf. So we built an agent that hires a person, and pays only if the photo is true."

## The 3 phrases judges must remember

1. **"Paid only when the photo is true."** The product in one breath; ties payment to result.
2. **"The sign in the photo."** The one-time hand sign (ADR-19) is the memorable mechanism (freshness proof, visible in the demo). In `card-pool` fallback mode it becomes "The code in the photo."
3. **"Cardano escrow makes sure nobody pays for a photo that isn't true."** The closing line: payment tied to result, with the explorer receipts as proof (replaced "the blockchain pays the bill" after the jury review, `../review/pitch-jury-2026-10-30.md`).

Rule: these three appear verbatim in the video, in the live pitch and in the Devfolio text. Do not paraphrase them.

## The one number (business case)

> **Target: EUR 12 per verified store check, charged only when it passes: about a third of the cheapest agency audit visit (about $30-45), a quarter of the cheapest German Testkauf (from about EUR 50).** Agency visits are booked in advance and paid regardless of usable output. For 10 store checks: EUR 120 with Shelfie vs about $300-450 for audit visits or EUR 500+ for mystery shops.

Full benchmarks, Shelfie cost build-up, sources and open items: [market-pricing.md](market-pricing.md). Summary (Shelfie numbers are hypotheses; do not show a number on screen that is not marked as an estimate):

| Item | Value |
|---|---|
| Shelfie price | EUR 12 per verified check pay-as-you-go; EUR 399/month for 50 checks; EUR 5-6 at volume later |
| Payout to the person per passed check | EUR 3.50 |
| Verifier cost / escrow fee | well under EUR 0.10 / about 5% |
| Margin per pay-as-you-go check | about EUR 7.80 (65%) |
| Market: US audit visit / German Testkauf | $30-45 / EUR 50-260 per visit |

Positioning caveat: agencies also fix the shelf, do resets and write long reports. Shelfie replaces only the "is it there and at what price" check. Say so before a judge does.

Units, kept apart on purpose: the EUR figures above are **illustrative product pricing** for the pitch, not what the demo moves. The preprod test amounts are tADA with no market value: verifier fee 1 tADA per check, worker payout 3 tADA per passed task (`diseno/contracts.md`), and the escrowed job fee is 1 test USDM (shown as 100 Sokosumi credits; M4 lock row in `../codigo/docs/evidence/tx-hashes.md`). Never put a tADA amount next to a EUR amount as if they were equivalent. The verifier cost "well under EUR 0.10" is an estimate of real model cost, not the 1 tADA x402 floor.

Terminology: the **three payment gates** (photo gate pays the human, job gate settles the escrow, fallback refunds) are not the verifier's internal checks G1-G7 in `diseno/verifier-rules.md`; the photo gate is made of those checks.

One-sentence version for the video: "A verified check costs about twelve euros, a fraction of an agency visit, and you pay only for checks that pass."

## Market (one homepage section, one sentence)

Pain number, TAM, neighbour market and vision ladder, with sources and the framings not to use: [pitch-plan.md](pitch-plan.md) section 4. Rules: say "loss" or "revenue" with every figure, never add markets up, mark forecasts as forecasts, re-check each figure at its source before it goes on a slide.

## Positioning line

"Shelfie is retail-execution proof for small brands: the speed of an app, the audit trail of an escrow, and a payment that only happens when the evidence checks out."

Against the field (from the competitive scan): most teams will ship a research/summary agent with a pay button; Shelfie ships an agent that buys evidence from the physical world, with a deterministic gate, an on-chain payout and a refund path.

## Name and tagline options

Keep **Shelfie**. It is short, visual, pun lands in English and German, and the product literally is a shelf selfie. Only change if the domain/handle is taken or a judge reads it as a selfie app.

| Option | Verdict |
|---|---|
| **Shelfie** | Keep. |
| Shelfie Verify | Acceptable subtitle if "Shelfie" alone is too playful for a business jury. |
| ShelfProof | Clearer on "proof", but less memorable. Backup. |
| Ground Truth | Strong concept name, generic and already used widely. Use only as a phrase in the vision beat. |

Taglines (pick one, use it everywhere; full list by audience, German versions and the recommendation in [archive/slogans.md](archive/slogans.md)):

1. **"Paid only when the photo is true."** (recommended, equals phrase 1)
2. "Eyes on the shelf, paid on proof."
3. "Agents that hire eyes."
4. "Don't trust the report. Trust the shelf."

## Tone rules

- Neutral, concrete, no hype words ("revolutionary", "disrupt"). Numbers marked as estimates.
- Always say what is real (preprod, our own printed price tags, teammates as shoppers, one real request but no brand interviews yet) and what is roadmap (mainnet, location proof, onboarding of strangers).
- Say "preprod" out loud at least once; the Foundation judges will check.
