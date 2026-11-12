# Contributing

Start with [docs/STATE.md](docs/STATE.md), [AGENTS.md](AGENTS.md) and
[the team entry](docs/START-HERE-TEAM.md). The public repo is in post-hackathon
maintenance; the backend is intentionally offline.

## Branches and publication

[ADR 0008](docs/adr/0008-post-hackathon-operation.md) governs this phase:
`main` is the source of truth, Helmut pushes directly under his own authorization,
and `dev` stays equal to `main`. Only these branches are retained and built by
Vercel. The event's `dev` integration / three-approval release PR rule is superseded.
GitHub protection remains active; its settings are for the team to decide.
Never force-push, delete protected branches, rewrite shared history or bypass hooks.
Agents must have explicit authorization to commit/push or publish a review comment.

## Changes and validation

Use conventional commits when authorized: `type(scope): summary`, with a task id
where applicable. Purpose-file changes need `Purpose-impact: ADR-<id>` or a declared
minor impact; see AGENTS. Keep code and its active design/contract in sync. Exact
pinned dependencies only; ask before adding one, with a one-line reason in the commit.

From `codigo/`, with Node 24:

```sh
mise exec node@24 -- npm run check
mise exec node@24 -- npm run build -w @shelfie/web
```

Tests per component: `diseno/repo-layout.md` section 4. Payment changes need
fault-injection coverage; verifier reasons need fixtures. See `docs/deploy.md` for
local smoke and server reactivation. Report unavailable checks honestly.

## Public content and continuity

No secrets, private data or new business strategy. Follow [the public content
rules](docs/public-release.md); never read `.env` files. Keep LICENSE unchanged.
Review the diff before publication. Append a work-block entry to `docs/ai-log.md`,
refresh your own `equipo/<name>.md`, and register reusable helpers in
`equipo/components.md`. Use `scripts/task.sh` for tracked tasks; old event tasks
are historical and must not be marked done without evidence.
