# Competitive landscape: Agentic Commerce on Cardano

Scope: public sources only. "Fact" = stated at the cited URL. "Inference" = our reading. "Gap" = I could not find it; do not treat absence as evidence. Several sources (Sokosumi app, Cardano Foundation blog, Coinbase recap) blocked automated fetching, so some results come from search summaries only.

## 1. What exists on Sokosumi / Masumi

Facts
- The public Sokosumi landing page lists eight "AI coworkers": Maya (Creative), Jamal (Experience), Hannah (Research), Alex (Coding) from Serviceplan Group; Themis (Regulatory Watch), Vulc (Grok Build), Dite (Designer), Igni (Cline) from utxo AG. No per-agent prices are shown; plans are priced in credits (free plan 250 credits per seat, paid from EUR 25/month for 1,500 credits). https://www.sokosumi.com
- The login page frames the product as "AI coworkers for marketing" and shows large corporate customers (Deutsche Telekom, Allianz, Lufthansa). https://preprod.sokosumi.com/agents
- Sokosumi was launched by Serviceplan Group with NMKR; the initial offer was mainly research agents with premium data sources such as Statista. https://www.house-of-communication.com/de/en/newsroom/2025/06/plan-net-launch-sokosumi.html
- Paid agents settle in USDM. Pricing modes: Free, Fixed, Fixed+prices (tiers), Dynamic. Preprod listings appear automatically in the preprod gallery; mainnet needs approval. https://docs.masumi.network/documentation/how-to-guides/configure-agent-pricing and https://docs.masumi.network/documentation/how-to-guides/list-agent-on-sokosumi
- A Masumi network fee of 5% on the USDM price is mentioned in a setup guide (secondary source). https://www.mintlify.com/masumi-network/masumi-docs/guides/list-agent-on-sokosumi
- The Masumi registry is on-chain (one NFT per agent) and exposes a registry endpoint; no browsable public list was found. https://docs.masumi.network/documentation/get-started/register-agent
- The hackathon template starts as a "team name assistant"; example prompt: "summarizes a document and links to its sources". https://www.masumi.network/tum-hackathon

Gap: no per-agent prices for the marketplace, and the preprod gallery needs login. Action: on Friday morning, log into https://preprod.sokosumi.com/agents, screenshot the TUM Workspace gallery and count how many teams already list a research/summary agent.

Saturation (inference)
- Saturated: generic research/summarization (Hannah on the marketplace; the template and the track's own example "research report for a shop" push every team there), marketing/creative copy (platform positioning), coding helpers.
- Likely empty on the marketplace (inference, unverified): anything that performs a real-world, checkable action for a small customer (document checks, fraud checks, local-data lookups), and agents that buy from other agents with proof-of-result gating. The listed coworkers are all generic roles, none local or SMB-specific.

## 2. Past winners and what they teach

Facts
- SKALE agentic-commerce x402 hackathon (86 builds, 324 registered): Coinbase-track winner Superpage (infrastructure for agents to pay autonomously), second Pincer (ad-subsidy protocol that helps agents get past HTTP 402 paywalls); overall best app World of Geneva (agents play an MMORPG autonomously), second Moltbet. https://skale.space/blog/san-francisco-agentic-commerce-x402-hackathon-recap-winners
- Coinbase Code NYC grand prizes: Aemula (decentralized journalism with USDC guest checkout), Toolkit.dev (agentic chatbot monetizing tool calls via x402), Chibi (SQL-powered GameFi), 1Shot Gas Station (gasless swaps via x402 authorizations); Gingham POS/Wallet won $2,500 as a point-of-sale wallet. 46 projects over 4 challenges. https://www.coinbase.com/en-ar/developer-platform/discover/launches/code-nyc-recap (search summary only; page returned 403)
- Cardano Layer Up hackathon: 134 developers, 92 teams, open track by Cardano Foundation and AI track by Masumi; named winners BioFlow (health data) and KarbonSense (environmental intelligence); the Masumi-track winner could not be identified. https://cardano.org/news/2025-11-27-layer-up-hackathon/
- Other Masumi-linked events (Hack the Future with Silverside AI, MediaMarktSaturn Berlin hackathon where the winning prototype was to be developed further on Masumi): no winner lists found. https://www.agorize.com/en/challenges/hack-the-future-ai-unchained and https://mediamarktsaturn.com/sites/default/files/2025-11/112025_MediaMarktSaturn_Hackathon%20Masumi_EN_0.pdf
- Other x402 events (Cronos PayTech, Solana x402, ETHOnline Hedera track requiring a live x402-gated service): no winner write-ups retrieved. https://solana.com/x402/hackathon

Patterns (inference from the above)
1. Winners are infrastructure or a clear new commerce primitive (pay-per-tool-call, paywall bypass, guest checkout), not "an LLM wrapper that costs money".
2. They show a real transaction in the demo, not a mock.
3. A concrete audience plus a story beats breadth (journalism, point of sale, gaming).
4. A memorable demo concept helps (autonomous agents in a game world won overall).
5. Gap: published judge quotes were not retrievable; the praise reasons above are inferred from project descriptions, not from judges.

## 3. The judges

Facts
- The official page names Bora Oben (Cardano) and Vladislav Kudrin (Cardano Foundation); it states what they want to see (clear customer and journey, payment tied to result, agents hiring agents or acting in the world, live tx on a preprod explorer). Source: our local copy of https://hackathon.tum-blockchain.com/prizes (see ../tracks-oficiales-2026-10-29.md).
- Searches for both names (talks, posts, LinkedIn-style pages) returned nothing about either person. Gap: no public statements found. Do not claim knowledge of their views.
- What the Cardano Foundation publicly cares about in this area: it contributed the client, server and facilitator for Cardano in the official x402 repository (TypeScript first, Python next); the facilitator has only run on preprod, not mainnet. https://cryptopotato.com/cardano-joins-solana-xrpl-in-ai-agent-payments-race-as-ada-gains-6/ and https://yellow.com/news/ada-rallies-cardano-agent-payments-arena
- Critics note there is little evidence of agents paying for commercial services in ADA at meaningful volume. https://egamers.io/cardano-enters-the-x402-field-alongside-solana-and-xrp-ledger-for-ai-agent-payments/

Inference: a Cardano Foundation judge is likely to reward a demo that is the first visible "real commerce" example on the new x402 Cardano path (answers the criticism above), shown with a preprod explorer link. Also likely: correct, idiomatic use of `@x402/cardano` rather than a bypass. Ask them in person on Friday (workshop 10:30) what a "good" demo looks like.

## 4. Customer pain points in Munich/Germany (evidence for the pitch)

Facts
- Rental fraud: two students lost about EUR 8,000 to a fake flat offer in Maxvorstadt; TUM warns that at least one student per semester is defrauded and lists red flags (landlord abroad, inherited flat, too cheap, poor language). https://www.infranken.de/bayern/traenen-auf-tiktok-studentinnen-berichten-von-wohnungsbetrug-in-muenchen-art-6125683 and https://www.tum.de/studium/im-studium/wohnen-und-arbeiten/wohnen
- Small-business admin confusion: conflicting information on e-invoice (E-Rechnung) duties for Kleinunternehmer; Haendlerbund reports the confusion and the BMF letter reopened it. https://ohn.haendlerbund.de/recht/rechtsfragen/e-rechnung-kleinunternehmen-verwirrung
- Price monitoring is sold to small and medium retailers as a way to replace repetitive manual competitor checks, so the need exists but vendors are tool-first and self-promoting. https://www.capterra.com.de/software/1059110/pricinghunter
- Gap: no independent survey of Munich shop owners found. Pain evidence is anecdotal; run 3 quick interviews or a screenshot of local forums on Friday if time allows.

Inference: two pitchable, checkable, pay-per-job tasks: (a) "Is this flat/landlord listing a scam?" for a student (cheap, instant, verifiable output, outcome-gated refund fits); (b) "Is my invoice/offer compliant with E-Rechnung?" for a micro business (hard pass/fail check is natural for the escrow gate). Both fit "pay only if the result passes a check" better than an open-ended market report.

## 5. Things every team will do vs differentiators

Every team will do (avoid or minimize)
- A generic research or summary agent on the template (the template and example ideas steer there).
- Chat UI around one LLM call, "pay" shown as a button, no tx hash in the video.
- Testnet wallet screenshot instead of a full job-to-payment run.
- Pitch about "the agent economy" with no named customer.
- Only a happy path demo.

Differentiators (inference, ranked by value per hour)
1. Named customer with proof of the pain (the links in section 4) and a price that makes sense for them.
2. Outcome-gated payment with a recorded refund (the track lists "pay only if it passes a check"); few teams will show a refund tx.
3. Deterministic checker, not LLM opinion, deciding pass/fail (e.g. schema/e-invoice validator, link-liveness check of cited sources).
4. Agent hires agent with x402 and a per-payment cap, visible in a live payments ledger.
5. Live explorer links at the 1:15 mark of the demo and a README that lets the judges rerun it.
6. Honest limits slide (preprod only, no mainnet) which matches the Foundation's own status.

## Sources not reachable (retry if time)
Sokosumi marketplace (login), Cardano Foundation Layer Up blog (HTTP 429), Coinbase recap (403), Masumi docs pages for examples (404).
