# CiudadCheck developer handoff

Status checked 2026-11-12. This file is the concise handoff for agents continuing the
CiudadCheck build. Follow [`AGENTS.md`](../AGENTS.md) and the street contract first; this
status note does not override either.

## Where the project stands

`develop` contains the project foundation from commit `6f4c909`:

- CiudadCheck project and agent rules in `AGENTS.md` and `CLAUDE.md`.
- The shared street schemas and types in `codigo/packages/core/src/street.ts`.
- The street contract in `diseno/street-contract.md`.
- The `domain-street` pack with category configuration, country labels, instructions and prompts.
- The existing Shelfie monorepo foundation: npm workspaces, TypeScript, lint/test config, CI and
  git hooks. Those shared foundations are available to reuse; legacy Shelfie product flows are
  not part of the CiudadCheck scope.

The baseline does **not** mean the application is complete. No street application feature branch
has been merged into `develop` at this status check. The root checkout is on `develop`; keep
integration work there and do not push to `main`.

## Branches and observed work

| Branch | Ownership | Observed status |
|---|---|---|
| `feat/street-core` | `codigo/packages/domain-street`, `codigo/apps/engine`, `codigo/scripts/street-*` | Commits `9e8d14a` and `83cf204` pushed. Implements the street engine service, report/mission/evidence/dashboard routes, persistence, verifier adapter, simulated payouts and tests. |
| `feat/street-verifier` | `codigo/apps/verifier`, `codigo/packages/vision`, `codigo/eval` | Local uncommitted changes observed in verifier, vision and evaluation paths; no feature commit was present at the check. |
| `feat/street-web` | `codigo/apps/web/src/street/**`, `deps.tsx`, `testing.ts`, street tests | Local uncommitted street app and dependency/test wiring observed; no feature commit was present at the check. |
| `feat/street-site` | Homepage and web shell paths listed in `AGENTS.md` | Local uncommitted site, routing, styling and asset changes observed; no feature commit was present at the check. |

Worktree contents can change independently. Before editing or integrating, run `git status` in the
specific worktree and inspect its diff; never assume the status above is still current.

## Integration ownership

Only the integrator on `develop` changes shared core contracts, workspace manifests, lockfile,
lint/test config and cross-branch wiring. The street contract is the boundary between engine,
verifier and web. If implementation needs a contract change, update the contract and schema together
on `develop`, then rebase or merge the feature work through the agreed integration flow.

Recommended integration sequence:

1. Review each feature diff against its ownership table in `AGENTS.md` and the street contract.
2. Confirm upload, auth, environment and payout safeguards have matching security tests.
3. Integrate core, verifier, web and site work into `develop` without overwriting unrelated changes.
4. Run `mise exec node@24 -- npm run check` from `codigo/`; then run the street smoke only when its
   local configuration is available. Never inspect `.env` files.
5. Review the integrated app and site in a browser, including Spanish labels and GT/CO behavior.
6. Record exact validation results and remaining limitations in `docs/ai-log.md`.

At the last completed engine validation, `mise exec node@24 -- npm run check` passed on the
`feat/street-core` worktree: typecheck and lint passed, 609 Vitest tests passed, and 33 bridge tests
passed. This result is for that feature worktree, not for `develop` or the other feature branches.

## Product and demo limits to preserve

- `FAKE_PAYMENTS=1`; payouts are local simulated ledger entries only. No real money, blockchain or
  mainnet.
- The demo verifier can be fake/stubbed. Never call its result real verification.
- Worker identity is not authenticated in the demo contract; do not present the demo as production
  ready.
- Face and plate blur is not yet applied by the engine; verifier blur boxes alone do not protect
  stored photos. Use synthetic demo imagery until blur-before-storage is implemented and tested.
- Keep raw worker coordinates and photos out of logs, Git and public documentation.

## Notion build plan

Helmut supplied the team build-plan page at
<https://app.notion.com/p/Build-plan-3-computers-one-day-416251080a2e81b5952ef508b5e0a3eb>.
The Codex Notion connection returned `object_not_found` for that page and its search was scoped to
another workspace. Therefore this handoff does not claim to reproduce or satisfy its prompts. An
agent with access to the CiudadCheck Notion workspace must compare the prompts and decisions with
this implementation before declaring the planned build complete.

## Completion assessment

The project has a reusable monorepo foundation and a CiudadCheck contract/pack, plus a pushed first
engine implementation branch. It has **not** yet reached the same practical scaffold-and-feature
completion implied by a runnable end-to-end demo: the remaining branches need review, tests, commits
and integration; the Notion plan needs verification; and demo limitations above remain. Treat the
project as an active demo build, not as finished or production-ready.
