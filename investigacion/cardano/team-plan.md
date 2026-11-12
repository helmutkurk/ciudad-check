# Cardano track — team plan

> **Update:** the product is now **Shelfie** (see [../../ideas/decision.md](../../ideas/decision.md)); the working plans are in [../../preparacion/](../../preparacion/). The text below is the earlier ShopScout plan, kept for history. Milestone IDs M1-M6 and roles A-D still apply, but their definitions were re-mapped for Shelfie: see [../../diseno/repo-layout.md](../../diseno/repo-layout.md) sections 2 and 5 (M2 now also includes the human payout and its target is Fri 15:00; M5 is the K-of-N withheld result; role A also owns the engine, role C is the verifier). Times of M1, M3, M4, M6 and the Friday 22:00 escrow go/no-go are unchanged.

Claude, 2026-10-29. Built on [masumi-runbook.md](masumi-runbook.md) (Codex) and [x402-runbook.md](x402-runbook.md) (Sonnet). Official rules: [../tracks-oficiales-2026-10-29.md](../tracks-oficiales-2026-10-29.md). Commands live in the two runbooks; this file is the plan. Roles are A–D until names are assigned. Durations are estimates.

## What the runbooks changed (inference)

1. **x402 is the fast, low-risk way to qualify.** There is a hosted preprod facilitator, a headless buyer that signs from a mnemonic, and a template that runs seller and buyer with `npm run demo`. One paid request = the track's only hard requirement.
2. **Masumi paid escrow is heavy.** It needs our own Masumi Payment Service (Node 24.22.x, pnpm 10.30.2, Postgres, seeded wallets), on-chain agent registration, and **≥60 min per paid cycle**. A payout is eligible roughly 46 min after submission; a refund roughly 30 min after the submit deadline. Plan around that latency and start it early.
3. **"Pay only if the report passes a check" is feasible, but only one way.** If the agent submits *any* result hash, including the text "failed", the seller gets paid. A rejected report must therefore **withhold the result**, so the buyer's no-result auto-refund kicks in. That makes a good escrow demo, but the refund shows up only after the timeout: record it on Friday and show the explorer link on Saturday.
4. **Sokosumi credits ≠ x402.** The lead agent hiring a Sokosumi agent pays in credits; paying a specialist API with x402 is a separate on-chain payment. We use **x402 for agent-to-agent payments** because it produces a tx hash we control.

## Product (one sentence)

**ShopScout:** a small shop hires a research agent on Sokosumi with payment held in Masumi escrow. The agent buys competitor-price data from a specialist agent per request via x402, and it delivers the report only if the report passes a quality check. Otherwise the shop is refunded automatically.

Customer for the pitch: an independent Munich shop owner (e.g. a bike or coffee shop) deciding whether to stock a new product and at what price. Input: product + city + up to 5 competitor URLs. Output: a 1-page report with a price range, competitor table with source links, and a recommendation.

## Milestone ladder (stop at any rung and still have a valid submission)

| # | Milestone | Proves | Target |
|---|---|---|---|
| M1 | x402 template: seller + headless buyer, 1 paid request on preprod, tx on Cardanoscan | **Track qualified** | Fri 11:30 |
| M2 | Specialist "price API" behind x402 returns real data; lead agent (TS) calls it via `fetchWithPayment` with a per-payment cap | Agent pays agent | Fri 15:00 |
| M3 | Masumi starter: unpaid Coworker task `COMPLETED` on Sokosumi preprod with our report | Hired via marketplace | Fri 13:00 |
| M4 | Masumi Payment Service up, agent registered, 1 paid task with settled receipt + tx hash | Escrow per job | Fri 20:00 |
| M5 | Quality gate: failing report withholds its result → refund on-chain | Pay on result | Fri night (record) |
| M6 | Simple front end: shop owner journey + live "payments ledger" with explorer links | UX + demo | Sat 11:00 |

If M4 is not working by Fri 22:00, freeze it: demo M1–M3 + M6, and present escrow as the roadmap. M1/M2 already satisfy the requirement.

## Roles

- **A — Sokosumi/Masumi operator:** CLI, Vendor/Coworker, worker, TUM Workspace; owns M3 and keeps the single worker running (one worker per Coworker, machine awake).
- **B — Payments:** x402 seller/buyer and wallets (M1/M2), then the Masumi Payment Service and registration (M4), and the refund proof (M5). The most technical role.
- **C — Agent logic:** prompt, `buildReport()`/`checkReport()` in the starter's `client.mjs` path, specialist price API, quality rubric (M2 logic, M5 gate).
- **D — Product & pitch:** customer story, front end (M6), README, Devfolio text, 2.5-min video, live demo script; also tracks every tx hash in one evidence file.

## Tonight (Thu 29) — setup only, no project code

Everyone:
- [ ] Join the hackathon Telegram; sign up at https://preprod.sokosumi.com/signup and request the TUM Workspace invite (Masumi guide).
- [ ] Have `git` and `mise` (or nvm) ready; installing Node 24 next to newer versions is fine. x402 needs Node ≥22, Masumi needs 24.
- [ ] Watch nothing, build nothing: just read the brief and your runbook section.

Per role:
- **A:** install `@masumi_network/sokosumi@1.0.4` under Node 24; `sokosumi --preprod auth login` / `whoami`; check that the OS secret store works (Linux: gnome-keyring is running on Helmut's laptop).
- **B:** Blockfrost **preprod** project key; read the x402 runbook end to end; get test ADA from the faucet and tADA/tUSDM from the Masumi dispenser (email code from the Masumi registration); prepare Postgres for later (Helmut's laptop has only the `psql` client: use `docker run postgres:15`).
- **C:** write the agent brief, report template and quality rubric **on paper/markdown** (e.g. ≥3 competitors, every price has a source URL, price range consistent with the table).
- **D:** pick the concrete shop + product for the demo, list 5 public competitor pages, draft the 30-second pitch.
- **Team:** choose the LLM provider and who pays (Masumi template expects `ZAI_*` variables; another provider means adapting `agent/agent.ts`).

**Ask the organizers (Telegram):** is environment setup (accounts, keys, Postgres, cloning starters) before Fri 09:00 allowed? Our README limits *project code* before the window.

## Friday 30

| Time | A | B | C | D |
|---|---|---|---|---|
| 09:00 | Clone Masumi starter, Coworker + worker, smoke task | Clone x402-express, `npm run wallet`, fund, `npm run demo` → **M1** | Specialist price API (plain HTTP first) | Repo, README skeleton, evidence log, UI mock |
| 10:30 | Workshop Cardano (A + D); book Masumi 1:1 | — | — | Workshop |
| 11:30 | Swap in our prompt/report → **M3** | Put specialist API behind x402 | Lead agent calls it via x402 → **M2** | Front end on real data |
| 14:00 | Help B | Masumi Payment Service + registration | `checkReport()` gate | Front end |
| 18:00 | Paid task cycle → **M4** | | Failing case → withheld result → **M5** | Record demo takes |
| 22:00 | **Go/no-go on escrow** | | | |

## Saturday 31

- By 11:00: M6 done; create the Devfolio project and add everyone.
- By 13:00: last paid cycle (settlement needs ~1 h); freeze code.
- By 14:30: video ≤ 2.5 min uploaded, repo public, all tx hashes in the description. **Submit before 15:00.**
- 15:00–17:00: live demo to the Cardano judges (and others, if entered).

## Demo script (2.5 min)

1. 0:00 Customer and problem (shop owner, pricing decision, no time for research).
2. 0:25 Business case: pay per report, refund if it is not good enough; competitors are agencies or hours of the owner's time.
3. 0:45 Live: the shop hires ShopScout on Sokosumi → escrow lock shown.
4. 1:15 The agent buys price data from the specialist via x402 → tx on Cardanoscan.
5. 1:45 Report delivered → settlement tx. Cut to the earlier failing run → withheld result → refund tx.
6. 2:15 What's next: real data sources, more specialist agents, mainnet.

## Devfolio description draft

**ShopScout — market research agents that only get paid when the report is good.**
Small shop owners need quick, sourced answers ("what should I charge for X in Munich?") but can't afford an agency. ShopScout is a Coworker on Sokosumi: the shop hires it per report, and the payment waits in Masumi escrow on Cardano. To do the job, ShopScout buys competitor-price data from a specialist agent, paying per request via x402. Before delivering, it checks its own report (sources for every price, enough competitors, consistent numbers). If the check fails, it withholds the result and the shop is refunded automatically. Built with Masumi, Sokosumi, x402 (`@x402/cardano`), Blockfrost and TypeScript on Cardano preprod. Tx hashes: … (fill in).

## Open questions for the Masumi 1:1 / mentors

- Can we shorten the escrow timeouts (pay-by/submit/unlock) on preprod for a live demo?
- Is there a hosted Masumi Payment Service for the hackathon, so we don't have to run our own?
- Recommended way for a headless agent to pay into Masumi-escrow x402 (`/x402/start_job`)?
- Faucet/dispenser limits; which tUSDM token is the right one.
- Can one project win in several tracks?
