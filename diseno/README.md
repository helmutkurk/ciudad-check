# Shelfie design package

Design documents only. No source code exists yet and none may be written before the build window opens (hackathon FAQ: the core build must happen during the hackathon). Everything here is meant to be implemented from Friday 09:00 by four people in parallel, without meetings.

Context: [../ideas/decision.md](../ideas/decision.md) (chosen idea and the adaptability rule), [../investigacion/tracks-oficiales-2026-10-29.md](../investigacion/tracks-oficiales-2026-10-29.md) (Cardano track rules), [../investigacion/cardano/masumi-runbook.md](../investigacion/cardano/masumi-runbook.md), [../investigacion/cardano/x402-runbook.md](../investigacion/cardano/x402-runbook.md), [../investigacion/cardano/team-plan.md](../investigacion/cardano/team-plan.md) (roles A-D, milestone ladder; written for the earlier ShopScout idea, re-mapped to Shelfie in repo-layout.md).

## One-paragraph summary

Shelfie is a **verified micro-task engine** with one **domain pack** loaded: shelf checks. A brand hires the lead agent on Sokosumi (fee in Masumi escrow). Brands pick city, store and product from catalog dropdowns (ids only), and an intake filter backs this up for other paths; the engine plans one task per store (MVP: one store, one photo per job, ADR-16), the task is shown to all workers in the city and the first to claim it gets it; that person takes the photo with the live in-app camera (no gallery) next to a one-time challenge code, with browser location checked against the store at the shutter (or photographs the empty shelf spot if the product is not there, verdict OUT_OF_STOCK), a **verifier service** (sold per check via x402) runs a deterministic gate, passing photos trigger an on-chain payout to the human, and the job's result is delivered (escrow settles) only if the photo passes; otherwise (no passing photo by the window end) the result is withheld and the escrow refunds. Multi-store K-of-N jobs are roadmap.

## Reading order

| Order | File | Read it if you are | What it settles |
|---|---|---|---|
| 1 | [architecture.md](architecture.md) | everyone | Components, deployment, sequence diagrams, domain-pack concept, Plan B |
| 2 | [domain-model.md](domain-model.md) | everyone | Entities, state machines, idempotency keys, payout queue |
| 3 | [contracts.md](contracts.md) | everyone (skim), owner of each endpoint (read) | HTTP endpoints, x402 price, env var names, pack config shape |
| 4 | [repo-layout.md](repo-layout.md) | everyone | Folders, owners, starters, conventions, tests, milestone definitions of done |
| 5 | [verifier-rules.md](verifier-rules.md) | C (owner), B, D | Gate spec, vision contract, thresholds, 20-photo evaluation |
| 6 | [decisions.md](decisions.md) | everyone, before arguing about a choice | ADRs with alternatives and consequences |
| 7 | [webapps.md](webapps.md), [ui-design.md](ui-design.md) | D (owner), A for the endpoints | Worker and brand app flows; visual system and screen layouts (Apple-like, tokens, components) |
| 8 | [security.md](security.md) | everyone (section 4 for the controls you build), A, B, C, D by threat owner | Assets, trust boundaries, STRIDE threat table with owners and tests, scaffold controls (auth, upload, headers, secrets, tunnel, supply chain, GDPR). Checklist: [../preparacion/security-scaffold-checklist.md](../preparacion/security-scaffold-checklist.md) |
| 9 | [glossary.md](glossary.md) | everyone, new teammates and agents first | Definitions of actors (brand, worker, operator), agents and services, work units from order to payout, checks, wallets, platforms and process terms |

## Who reads what first (Friday 09:00)

- **A** (shell, engine): architecture, domain-model, contracts sections 0-1, repo-layout.
- **B** (payments, x402): architecture, domain-model (payout queue), contracts sections 3-4, decisions.
- **C** (verifier, pack): verifier-rules, contracts section 5-6, domain-model (Submission, Verdict).
- **Everyone, Friday 09:00:** security.md section 4 and the scaffold checklist before the first feature commit.
- **D** (web, evidence, pitch): webapps.md and ui-design.md, contracts sections 0-1, repo-layout (milestones, evidence), architecture (sequence diagrams for the demo).

## Conventions used in these files

- "verify Friday" marks something not confirmed from sources; the owner confirms it in the first hours and records the answer in `docs/verified.md` in the repo (a short table: item, answer, who, evidence).
- "Inference" marks our own reading, as in the runbooks.
- Amounts are in lovelace in contracts and ADA in prose. Network is Cardano preprod everywhere.
- Names: wallets are `W-SELL` (verifier receives x402 fees), `W-VBUY` (engine pays the verifier), `W-PAY` (engine pays workers), `W-MPS` (Masumi seller wallet), plus workers' own preprod addresses.
- IDs: prefixed strings (`job_`, `tsk_`, `clm_`, `sub_`, `vdt_`, `pay_`, `stl_`, `evd_`).

## Open items that block nothing but must be answered early

1. Can the Cardano SDK in the x402 template send plain transfers (payout)? Verify Friday, B, first 90 minutes. Fallback in decisions.md ADR-04.
2. Which vision model, and does it read small price tags reliably? C decides from the 20-photo run.
3. Do conference networks allow phones to reach laptops (client isolation)? D tests at the venue; tunnel is the default (ADR-06); the LAN is read-only (no camera submission over HTTP, ADR-17) unless a secure LAN option works.
6. Does the Sokosumi hire form support option/select fields (catalog dropdowns, ADR-17), and do CIP-30 wallets exist in the venue phones' browsers? Intake filter and pasted address are the fallbacks.
4. Can Masumi escrow timeouts be shortened, and how does the starter withhold a result without a hash? A and B ask in the Masumi 1:1.
5. Is template code (x402-express, tum-hackathon-quickstart) acceptable in the repo? Both are the organisers' own starters; confirm in Telegram.
