# AGENTS.md - shared rules for coding agents

Claude Code imports this file through `CLAUDE.md`; Codex reads it natively.

## The project in 5 lines
- CiudadCheck: verified photo evidence of street problems (accessibility, sidewalks, potholes, graffiti,
  open drains, broken street lights) in Guatemala and Colombia, with its limits stated.
- Citizens report for free with a live photo; customers order paid missions (confirm, measure, repair check
  with before/after) at any map point.
- A verifier checks place, freshness, duplicates and category per photo; a mission pays only when the photo passes.
- Payouts are simulated (`FAKE_PAYMENTS=1`, local ledger, GTQ or COP in integer centavos). No blockchain, no real money.
- Spanish UI (Guatemalan and Colombian variants), English code and docs. Team: Isabel, Fernando, Lorenz, Helmut.

## Current phase

Demo build. The repo started from the Shelfie monorepo (verified shelf checks, second place in the Cardano track
of the TUM Blockchain & AI Hackathon 2026). CiudadCheck is a new domain pack, `street-check`, reusing the engine,
the verifier and the web app. Legacy Shelfie modules (shell, Masumi/Sokosumi flow, Cardano payments, x402,
`domain-shelf`, brand orders) remain in the tree, unused by the street flow, pending a later cleanup. Do not extend
them for CiudadCheck. Decision 2 (pivot, added market or separate brand) is open in the team workspace.

Branches: `main` changes only through a pull request from `develop`. Feature branches start from `develop`:

| Branch | Owns |
|---|---|
| `feat/street-core` | `codigo/packages/domain-street`, `codigo/apps/engine`, `codigo/scripts/street-*` |
| `feat/street-verifier` | `codigo/apps/verifier`, `codigo/packages/vision`, `codigo/eval` |
| `feat/street-web` | `codigo/apps/web/src/street/**`, `deps.tsx`, `testing.ts`, street tests |
| `feat/street-site` | homepage and shell of `codigo/apps/web` (`src/site/**`, `styles/ciudad.css`, `index.html`, `main.tsx`, `App.tsx`, `lib/router.ts`) |

`codigo/packages/core` (including `src/street.ts`), workspace manifests, the lockfile and lint/test config belong
to the integrator on `develop`. Never force-push, never push to `main`, never rewrite shared history.

## Read before editing

1. This file, `diseno/street-contract.md` and the last entries in `docs/ai-log.md`.
2. `diseno/README.md`, `diseno/security.md` and the specification for your area.
3. Relevant `.claude/rules/` files. Shelfie-era documents (`docs/STATE.md`, `equipo/`, `investigacion/`, `pitch/`)
   are history; they do not override this file or the street contract.

State the purpose and the files read before changing files. Mark uncertainty explicitly.

## Rules and hooks

Security hooks (`guard-bash`, `protect-files`, `prompt-guard`), gitleaks, `commit-msg` purpose trailers and CI stay
in place. Install git hooks once per clone with `bash scripts/install-githooks.sh`. Never disable or route around a
blocking hook; report a legitimate block. Codex does not run the Claude hooks; follow these rules directly.

Purpose-defining paths: `AGENTS.md`, `CLAUDE.md`, `ideas/decision.md`, `diseno/**`, `.claude/**`, `.github/**`,
`.githooks/**`, `scripts/team.conf`. A commit touching them needs a trailer `Purpose-impact: ADR-<id>` or
`Purpose-impact: minor: <reason>`. Do not commit or push when the user asks for a diff only.

## Where the truth lives

| What | Where |
|---|---|
| Street contract | `diseno/street-contract.md`, `codigo/packages/core/src/street.ts` |
| Street pack (thresholds, instructions, prompts) | `codigo/packages/domain-street` |
| Design and security | `diseno/` |
| Decisions | `docs/adr/`, `diseno/decisions.md` |
| History | `docs/ai-log.md` (append only) |

Strategy, budget, customers and interview notes stay in the team workspace, never in this public repo.
If code and an active specification disagree, reconcile them in the same change.

## Conventions

TypeScript strict, ESM, Node 24. npm workspaces in `codigo/`. Run `mise exec node@24 -- npm run check` there before
every push. Pinned dependencies and the lockfile; ask before adding a dependency; never edit lockfiles manually.
Prettier defaults, 100 columns, ESLint no-floating-promises and no-explicit-any. zod `.strict()` at every boundary,
one core `AppError`, structured redacted logs, integer minor units for money, injectable clocks and ids, thresholds
in the pack and never inline in gates. Fakes (`FAKE_PAYMENTS=1`, `VERIFIER_MODE=stub`) are for development and demos;
never present fake output as real verification or payment. UI text in Spanish; code, docs and commits in English.

## Security and public content

- Never read `.env*` except `.env.example`, by any route. Never print or commit keys, tokens, credentials, raw
  worker coordinates or photos.
- The repo is public: every committed byte is public. No strategy, budget, customer notes, private data of third
  parties or real people in photos. Demo photos and points are synthetic or made up.
- Photos: faces and number plates are blurred before storage (verifier returns boxes; engine blur is a TODO);
  never photograph people as the subject. Workers photograph from the sidewalk, never in traffic.
- No real money, no blockchain, no mainnet. Do not change repo visibility or LICENSE; no large media files in git.
- Follow `diseno/security.md` and `.claude/rules/security.md`. Payment, auth, upload, env and CI changes need
  matching `*.sec.test.ts` tests.

## Work tracking and handoff

Conventional commits, authored by the human you work for; no agent attribution lines. Review the diff and the
checks before publishing. At the end of a work block append done, TODO and Handoff to `docs/ai-log.md`. Show the
exact validation command and result, and disclose unavailable checks.
