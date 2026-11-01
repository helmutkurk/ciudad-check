# Shelfie — TUM Blockchain & AI Hackathon, Cardano track

Shelfie lets a brand check what its products really cost on shelves. An agent offers the job to people in Munich; one of them photographs the price tag with the live in-app camera; a verifier runs deterministic gates on the photo and only a passing photo triggers the payout. If no photo passes, the result is withheld and the brand is refunded. Built in about 30 hours at the TUM Blockchain & AI Hackathon 2026 on Cardano **preprod** (test ADA only) with Masumi, Sokosumi and x402. Status: prototype; no real money, no mainnet. The repo also contains the design, research and agent-collaboration notes behind it.

**Team:** Helmut (D) · Isabel (A) · Fernando (B) · Lorenz (C) ("Los Curiosos"). Pairs: Isabel + Fernando, Lorenz + Helmut
**Track:** Cardano, *Agentic Commerce on Cardano* (1st €3,000 · 2nd €2,000 · 3rd €1,000)
**Product:** **Shelfie, verified shelf checks, paid only when the photo is true.** A brand hires the Shelfie agent on Sokosumi with Masumi escrow. The agent hires people to photograph shelves in Munich stores; a verifier agent, paid per check via x402, gates every payment; the brand is refunded if not enough stores pass.

> **Rule:** the FAQ says the core build must happen during the hackathon (starts Friday 09:00; starter templates allowed). Preparation was docs/config only; the boilerplate in `codigo/` was written during the event on Friday 2026-10-30. Real paid integrations remain to verify.

## Start here

**Team build handoff:** [docs/START-HERE-TEAM.md](docs/START-HERE-TEAM.md) — first 30 minutes, role tasks and milestone times. [Run the apps](codigo/README.md).

> **Base context for the whole hackathon:** the organisers' official agent prompt, filled in for Shelfie, is in [investigacion/cardano/official-agent-prompt.md](investigacion/cardano/official-agent-prompt.md). Start every coding-agent session (Claude Code / Codex) from it.

| If you are…                     | Read                                                                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anyone, first 10 minutes        | [ideas/decision.md](ideas/decision.md) → [diseno/README.md](diseno/README.md) → [investigacion/cardano/official-agent-prompt.md](investigacion/cardano/official-agent-prompt.md) |
| Learning the concepts from zero | [basic-knowledge/main.pdf](basic-knowledge/main.pdf)                                                                                                                             |
| Setting up Thursday evening     | [preparacion/thursday-evening-checklist.md](preparacion/thursday-evening-checklist.md)                                                                                           |
| Building on Friday              | [preparacion/friday-runbook.md](preparacion/friday-runbook.md) · [diseno/repo-layout.md](diseno/repo-layout.md) · [diseno/contracts.md](diseno/contracts.md)                     |
| Pitching                        | [pitch/storyline.md](pitch/storyline.md) · [pitch/market-pricing.md](pitch/market-pricing.md) · [pitch/director-script.md](pitch/director-script.md) · [pitch/live-pitch.md](pitch/live-pitch.md) · [pitch/video-script.md](pitch/video-script.md) · [pitch/qa-prep.md](pitch/qa-prep.md) · [pitch/README.md](pitch/README.md)    |
| Submitting                      | [preparacion/submission-checklist.md](preparacion/submission-checklist.md) · [pitch/devfolio-description.md](pitch/devfolio-description.md)                                      |

## This repository

Public team repo (ADR 0003: public from the first push) and single source of truth for people and coding agents (Claude Code and Codex).

Everyone pushes directly to `dev` (agents peer-review each other's commits, `scripts/peer-review.sh`); `main` receives only the release PR from `dev` after check and smoke pass and approval by the three other teammates (ADR-0006).

| Need | File |
|---|---|
| Rules for every agent and person | [AGENTS.md](AGENTS.md) (Claude Code loads it through [CLAUDE.md](CLAUDE.md)) |
| Set up Claude Code or Codex on your machine | [docs/playbook/agent-setup.md](docs/playbook/agent-setup.md) |
| Branches, peer review, release PR | [CONTRIBUTING.md](CONTRIBUTING.md) · [docs/adr/0006-direct-push-to-dev-peer-review-by-agents.md](docs/adr/0006-direct-push-to-dev-peer-review-by-agents.md) |
| Launch the GitHub repo (Fri morning) | [docs/github-setup.md](docs/github-setup.md) |
| Pre-push audit for the public repo | [docs/public-release.md](docs/public-release.md) (`scripts/export-public.sh` is a deprecated fallback) |
| Both web apps (workers, customers) | [diseno/webapps.md](diseno/webapps.md) · [diseno/product-roadmap.md](diseno/product-roadmap.md) |
| Who is doing what, extra bots and scripts | [equipo/](equipo/README.md) · [equipo/components.md](equipo/components.md) |
| Open-source libraries we may use | [docs/open-source-libraries.md](docs/open-source-libraries.md) |
| License, authors and draft team IP agreement | [LICENSE](LICENSE) · [NOTICE](NOTICE) · [AUTHORS.md](AUTHORS.md) · [docs/ip-agreement.md](docs/ip-agreement.md) |
| Auto-deploy and public test URLs (Vercel + tunnel) | [docs/deploy.md](docs/deploy.md) |
| Decisions and daily log | [docs/adr/](docs/adr/) · [docs/ai-log.md](docs/ai-log.md) |

## Real mode and evidence (2026-10-30)

Shared deployments (dev/api-dev, later app/api) run real Gemini vision and real preprod payments, not fakes (decision by Helmut, evening of 2026-10-30); fakes stay only for local development and CI. Status: the Gemini key is being set; payment secrets are not yet in the hub env (tasks A-21, A-22, B-14). Details and switches: [docs/START-HERE-TEAM.md](docs/START-HERE-TEAM.md), [codigo/README.md](codigo/README.md), [docs/deploy.md](docs/deploy.md); store runbook: [preparacion/field-test-supermarket.md](preparacion/field-test-supermarket.md).

On-chain evidence is in [codigo/docs/evidence/tx-hashes.md](codigo/docs/evidence/tx-hashes.md): M1, M2, M4 and M5 have real preprod transactions. Missing: a full real cycle through the deployed engine with a store photo (B-14, T-27). Timers (worker execution window, job window, claim TTL, gesture window) are being lengthened by Lorenz (C-17); re-read them from code.

## License

Shelfie is source-available under [BUSL-1.1](LICENSE), permitting non-production
use, including evaluation, education, research and hackathon judging. The Change
License is Apache-2.0, with Change Date 2030-10-31 (subject to BUSL's earlier
four-year conversion rule). See [NOTICE](NOTICE) for third-party exclusions,
[AUTHORS.md](AUTHORS.md) for the team, and the [draft IP agreement](docs/ip-agreement.md)
for proposed parameters pending confirmation by all four members.

## Folders

| Folder | Contents |
|---|---|
| `investigacion/` | Official tracks and rules (`tracks-oficiales-…md`; the saved `prizes.html` copy stays local, git-ignored), earlier track analysis, the original README (`readme-inicial.md`), `cardano/`: Masumi and x402 runbooks with exact commands, competitive landscape, original team plan |
| `ideas/` | Two independent ideation rounds (27 ideas, weighted scoring) and the **decision** |
| `diseno/` | Architecture, domain model and state machines, API contracts, verifier rules, repo layout + milestones M1–M6 with acceptance criteria, ADRs |
| `preparacion/` | Thursday checklist, Friday/Saturday runbooks, demo props, risk register, mentor questions, evidence log, submission checklist |
| `pitch/` | Storyline, market pricing analysis (`market-pricing.md`), ≤2:30 video script, live pitch + demo choreography, Q&A prep, Devfolio text, `slides/` (LaTeX beamer deck, build with `latexmk -xelatex shelfie.tex`) |
| `review/` | Cross-file consistency report |
| `codigo/` | Monorepo skeleton: READMEs per app/package only; source code from Friday 09:00 |
| `equipo/` | Current state per person (focus, branch, components) and the registry of extra bots/scripts |
| `docs/`, `.claude/`, `.github/`, `scripts/` | Playbook, ADRs, AI log, agent config and guardrail hooks, CODEOWNERS, CI |
| `invoice/`, `downloads-blockchain-website/` | Personal receipts and third-party downloads: git-ignored, never committed |

## Designed to change

Shelfie runs on a generic **verified micro-task engine**: `Job → Tasks → Worker (human | agent) → Verifier → Settlement`. The shelf check is one **domain pack** (task template, verifier rules, report template). To pivot, swap the pack; Plan B (official-letter decoder) is sketched in `diseno/architecture.md`. Deck facts live in `pitch/slides/facts.tex`; changing a name, number or tx hash is a one-line edit.

## Key times

Fri 09:00 hacking starts · 10:30 Cardano workshop · 11:00 API3 · 11:30 BSV · 22:00 escrow go/no-go · Sat ~13:00 last escrow cycle · **Sat 15:00 Devfolio deadline** · 15:00–17:00 live judging · 17:30 winners.

## Deposit

All four deposits paid; team confirmed by the organisers. Refund requires check-in on day one, attendance on all three days and a submitted project.
