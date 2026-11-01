# Shelfie

Verified shelf checks, paid only when the photo is true. A brand requests a catalog
product at a Munich store; a worker photographs the shelf; a verifier gates the
worker payout and report delivery. Built at the TUM Blockchain & AI Hackathon 2026:
**second place in the Cardano track (€2,000)**, reported by Helmut on 2026-11-01.
Cardano **preprod**, test ADA only; prototype, no mainnet or real payments.

**Start with [docs/STATE.md](docs/STATE.md): current availability, domains,
evidence limits and next work.** The web remains on Vercel; the backend is
intentionally offline. API-dependent features do not work until reactivation.

Team: Helmut (D), Isabel (A), Fernando (B), Lorenz (C), “Los Curiosos”.

| Need | Read |
|---|---|
| Current state | [STATE](docs/STATE.md) |
| Clone and run locally | [Team entry](docs/START-HERE-TEAM.md), [monorepo commands](codigo/README.md) |
| Deployment and reactivation | [deploy.md](docs/deploy.md), [deployment scripts](scripts/deploy/) |
| Contribution and agent rules | [CONTRIBUTING](CONTRIBUTING.md), [AGENTS](AGENTS.md), [Claude adapter](CLAUDE.md) |
| Architecture, contracts and security | [Design index](diseno/README.md) |
| Recorded transactions and evaluations | [Evidence](codigo/docs/evidence/README.md), [verified facts](codigo/docs/verified.md), [eval](codigo/eval/README.md) |
| Decisions and history | [Repo ADRs](docs/adr/README.md), [design ADRs](diseno/decisions.md), [AI log](docs/ai-log.md) |
| Cleanup and homepage audit | [2026-11-01 audit](docs/cleanup-2026-11-01.md) |
| Pitch | [Pitch index](pitch/README.md) |

`codigo/` contains the npm workspace apps, packages, tests and evaluation runner.
`investigacion/` retains research and catalogs used by the code. `diseno/` retains
specifications and decisions; dated milestone plans are historical. `equipo/`
retains component and task records. Remaining `preparacion/` and `review/` material
is reference material, not a live event schedule.

During this phase Helmut maintains `main` directly and keeps `dev` equal to it
([ADR 0008](docs/adr/0008-post-hackathon-operation.md)). GitHub protection remains
active and is for the team to decide. Agents need explicit publishing authorization.

## License

Shelfie is source-available under [BUSL-1.1](LICENSE), permitting non-production
use, including evaluation, education, research and hackathon judging. The Change
License is Apache-2.0, with Change Date 2030-10-31 (subject to BUSL's earlier
four-year conversion rule). See [NOTICE](NOTICE) for third-party exclusions,
[AUTHORS.md](AUTHORS.md) for the team, and the [draft IP agreement](docs/ip-agreement.md)
for proposed parameters pending confirmation by all four members.
