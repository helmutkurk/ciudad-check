# AGENTS.md - shared rules for coding agents

Claude Code imports this file through `CLAUDE.md`; Codex reads it natively.

## The project in 5 lines
- Shelfie verifies shelf checks: one store, one catalog product, one live photo per job.
- A brand order becomes a Sokosumi task with Masumi escrow; the engine offers the shelf task to workers.
- The engine checks capture location, pays the verifier via x402, and pays the worker only after a passing verdict.
- A passing photo permits report delivery and escrow settlement; no passing photo means withholding and the buyer's refund path.
- Cardano preprod and test ADA only. Roles: A Isabel, B Fernando, C Lorenz, D Helmut.

## Current phase

The hackathon ended; Shelfie placed second in the Cardano track (€2,000), reported
by Helmut on 2026-11-01. Read [docs/STATE.md](docs/STATE.md) first. Vercel serves
the web, but the laptop engine, verifier, tunnel and auto-deploy are deliberately
stopped and disabled; no laptop hosts a backend. Continuing requires a server.
Do not reactivate services or create paid resources as part of ordinary cleanup.

[ADR-0008](docs/adr/0008-post-hackathon-operation.md) replaces the event's branch
and release convention: only `main` and `dev`, Helmut pushes directly to `main`
under his own authorization, and `dev` stays equal to `main`. GitHub protection
remains active; the team decides changes. Agents have no blanket push permission.
Never force-push, delete protected branches, rewrite shared history or bypass hooks.

## Read before editing

1. This file, `docs/STATE.md`, and the last two entries in `docs/ai-log.md`.
2. `docs/START-HERE-TEAM.md`, then `diseno/README.md` and the specification for your area.
3. `diseno/repo-layout.md` sections 2-4 for ownership, conventions and tests;
   section 5 records historical milestone acceptance, not current deadlines.
4. `equipo/README.md`, `equipo/components.md`, your own note and the relevant role note.
5. Relevant `.claude/rules/` and `docs/playbook/skills.md`; Codex reads SKILL.md manually.
   For platform work also read `investigacion/cardano/official-agent-prompt.md`.

State the purpose, role/person and files read before changing files. Verify unknown
Masumi, x402, Sokosumi and Cardano facts against sources and `codigo/docs/verified.md`;
mark uncertainty explicitly. Old “verify Friday” markers are historical open questions.

## Rules and hooks

The workflow hooks suspended in ADR-0007 remain unwired under ADR-0008; reading
context still applies. Do not run context-ack merely to recreate ignored state.
Security hooks (`guard-bash`, `protect-files`, `prompt-guard`), gitleaks,
`commit-msg` purpose trailers and CI remain in place. Install git hooks once per
clone with `bash scripts/install-githooks.sh`. Never disable or route around a
blocking hook. Report a legitimate block; an authorized rule change needs review.
Codex does not run the Claude hooks; follow these rules directly.

Purpose-defining paths: `AGENTS.md`, `CLAUDE.md`, `ideas/decision.md`, `diseno/**`,
`.claude/**`, `.github/**`, `.githooks/**`, `scripts/team.conf`. Changes need an ADR
or a declared minor impact. A later commit must use `Purpose-impact: ADR-<id>` or
`Purpose-impact: minor: <reason>`; a PR, if used, records the same impact.
This cleanup's decision is ADR-0008. Do not commit or push when the user asks for a diff only.

## Where the truth lives

| What | Where |
|---|---|
| Current operation | `docs/STATE.md`, `docs/deploy.md`, ADR-0008 |
| Design and contracts | `diseno/` |
| Chosen idea and decisions | `ideas/decision.md`, `diseno/decisions.md`, `docs/adr/` |
| Verified build facts | `codigo/docs/verified.md` |
| Transactions and evaluations | `codigo/docs/evidence/`, `codigo/eval/` |
| History | `docs/ai-log.md` (append only) |
| Component registry and task history | `equipo/` |

Historical plans and team notes do not override STATE or later accepted ADRs.
If code and an active specification disagree, reconcile them in the same change.

## Ownership and conventions

Ownership identifies expertise, not an edit barrier (ADR-0006):
- A, Isabel: shell, engine, core.
- B, Fernando: payments, verifier HTTP/payment wrapper, codigo/scripts.
- C, Lorenz: verifier evaluate/gates, domain-shelf, vision, eval.
- D, Helmut: web, evidence, README, pitch.

Keep cross-area changes small and identify them for review. Shared-contract changes
must be announced to the user and mirrored in `diseno/contracts.md`.

TypeScript strict, ESM, Node 24; shell stays JavaScript. npm workspaces in `codigo/`.
Run `mise exec node@24 -- npm run check` there before declaring code done or publishing.
Use pinned dependencies and the lockfile; ask before adding a dependency; never edit
lockfiles manually. Prettier defaults, 100 columns, ESLint no-floating-promises and
no-explicit-any. zod at boundaries, one core AppError, structured redacted logs,
integer lovelace, injectable clocks/ids. Fakes are for local development and CI;
never present fake/stub output as live evidence. Docs are concise English.

## Security and public content

- Never read `.env*` except `.env.example`, by any route. Never print or commit keys,
  tokens, signing material, mnemonics, credentials or raw worker coordinates/photos.
- Never touch ignored files, `invoice/`, personal receipts or local runtime state
  without a separate explicit task. Preserve untracked user files.
- No mainnet, real money, new third-party personal data, private client information,
  team-member opinions or business strategy in public changes.
- No invented transaction hashes, addresses, prices, platform behavior or verification.
- Do not enable overrides/fakes for an evidence run, change repo visibility or LICENSE,
  or add large media files to git.
- Follow `diseno/security.md` and `.claude/rules/security.md`. Payment, auth, upload,
  env, CI and tunnel behavior changes need matching security tests and a security review.

## Work tracking and handoff

The hackathon task lists and peer-review tool remain as historical/reusable tools;
they do not force work on `dev` or an event deadline. New tracked work uses
`bash scripts/task.sh` (`add`, `start`, `done`, `block`); never hand-edit task tables.
Do not mark old tasks complete without evidence. Remote peer review requires an
authenticated `gh`; never post comments without explicit authorization.

Use conventional commits if a commit is authorized; reference the task and dependency
reason when applicable. Review the diff and checks before publishing. Helmut decides
how to advance protected `main` and synchronize `dev`; agents do not bypass protection.

At the end of a work block append done, TODO and Handoff to `docs/ai-log.md`; refresh
only your own `equipo/<name>.md`. Register reusable helpers in `equipo/components.md`.
Record real transaction evidence from tool output in `codigo/docs/evidence/tx-hashes.md`.
Show the exact validation command/result and disclose unavailable checks.
