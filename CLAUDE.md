@AGENTS.md

# Claude Code specifics

Shared rules (project, read order, ownership, conventions, never-do list) are in `AGENTS.md`, imported above. This file adds only what is specific to Claude Code. Keep it under 150 lines; do not describe the folder tree here (see `diseno/repo-layout.md`).

## Model pins
- `claude-opus-5-5` for review and hard design questions (agent `reviewer`).
- `claude-sonnet-5-5` for most coding and docs work (default; agents `security-reviewer`, `docs-keeper`).
- `claude-haiku-5-5` for cheap, mechanical work (agent `test-writer`).
- Pins are set in `.claude/settings.json` (`env`). Do not change models per person without an ADR; use `/model` for one session only.

## Memory and precedence
- Settings precedence: managed > CLI > `.claude/settings.local.json` > `.claude/settings.json` > user. Personal overrides go in `settings.local.json` (git-ignored).
- Never keep project facts in your personal memory. They go to the repo (`codigo/docs/verified.md`, `docs/ai-log.md`, `diseno/`).
- Nested `codigo/CLAUDE.md` adds code rules when you work under `codigo/`.
- Path-scoped rules load from `.claude/rules/*.md` by the files you touch: typescript, payments-and-wallets, verifier, web, docs, security, evidence.

## Context gate
Off until the hackathon ends (ADR-0007): `context-gate.sh` is unwired and the git pre-commit ack check is removed. Still read the `AGENTS.md` read order before changing anything.

## Hooks (wired in `.claude/settings.json`)
| Hook | Script | Effect |
|---|---|---|
Removed by ADR-0007 for the hackathon: `context-gate.sh`, `format-file.sh`, `typecheck-on-stop.sh`, `tasks-on-stop.sh` (scripts stay in `.claude/hooks/`). Run `npm run check` yourself before a push.

| SessionStart | `session-context.sh` | Prints branch, time left in the build window, open TODO/Handoff lines from `docs/ai-log.md`, and the reminder to run `scripts/peer-review.sh pending` |
| UserPromptSubmit | `prompt-guard.sh` | Blocks pasted keys/secret literals; warns on a 24-word mnemonic |
| PreToolUse Bash | `guard-bash.sh` | Blocks `.env` access (also `cat`, globs), push to main, force push (also `--force-with-lease` to dev), mainnet, `curl \| sh`, gh repo changes; asks on new deps and recursive greps |
| PreToolUse Read/Edit/Write/Grep/Glob | `protect-files.sh` | Blocks `.env*` (not `.env.example`), key files, `invoice/`, lockfile and `.git` edits |

If a hook blocks you, use the replacement it names (e.g. `.env.example`, `dev` instead of `main`). Do not route around it with an equivalent command. Test the hooks with `.claude/hooks/test-hooks.sh`.

## Subagents (`.claude/agents/`)
- `reviewer` (opus): the peer-review agent; at the start of a block it runs `bash scripts/peer-review.sh pending` and reviews other people's dev commits (`ok` / `issue`).
- `security-reviewer` (sonnet): before any push touching payments, env, scripts or CI.
- `test-writer` (haiku): tests for settled modules (payout queue, gates, parsers).
- `docs-keeper` (sonnet): sync `diseno/` and `docs/` after code changes.
Delegate with a self-contained brief; the subagent does not see this conversation.

## Skills (`.claude/skills/`, invoke with `/name`)
- `/pr-description`: draft the release PR text (`dev` -> `main`) from the commit range.
- `/adr <title>`: new ADR in `docs/adr/`.
- `/log-evidence <milestone> <what> <hash>`: row in `codigo/docs/evidence/tx-hashes.md`.
- `/sync-context`: end-of-block update of `docs/ai-log.md`, handoff, `codigo/docs/verified.md`.
- `/milestone-check <M1..M6>`: check a milestone against `diseno/repo-layout.md` section 5.

## Working style
- Plan before multi-file changes; small commits; run `npm run check` in `codigo/` and show the result.
- Prefer the Grep and Glob tools over recursive shell greps (they honour the deny rules).
- Team state and component registry: `equipo/` (read order and rules in `AGENTS.md`). Start of a block: `bash scripts/peer-review.sh pending`, review what it lists. Tasks: `bash scripts/task.sh next <role>`, status updates at the end (`equipo/tasks/`, never hand-edited).
- Start each session from `investigacion/cardano/official-agent-prompt.md` plus `AGENTS.md` read order.
- Unknown platform behaviour: say "verify Friday" and look in `investigacion/cardano/*.md` before guessing.
- Run `/sync-context` before ending a session.
