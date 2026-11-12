@AGENTS.md

# Claude Code specifics

Shared rules (project, branches, ownership, conventions, never-do list) are in `AGENTS.md`, imported above. This file
adds only what is specific to Claude Code. Keep it under 150 lines.

## Models
- Default: the session model. Use Opus or Fable for review and hard design questions (agent `reviewer`), Sonnet for
  most coding and docs (agents `security-reviewer`, `docs-keeper`), Haiku for mechanical work (agent `test-writer`).
- Personal overrides go in `.claude/settings.local.json` (git-ignored).

## Memory and precedence
- Never keep project facts in personal memory. They go to the repo (`diseno/`, `docs/ai-log.md`).
- Nested `codigo/CLAUDE.md` adds code rules when you work under `codigo/`.
- Path-scoped rules load from `.claude/rules/*.md` by the files you touch. Rules that mention lovelace, Cardano,
  x402 or Masumi apply to the legacy Shelfie modules only; the street flow uses integer centavos and fake payouts.

## Hooks (wired in `.claude/settings.json`)
| Hook | Script | Effect |
|---|---|---|
| SessionStart | `session-context.sh` | Prints the current branch and recent handoff lines |
| UserPromptSubmit | `prompt-guard.sh` | Blocks pasted keys/secret literals; warns on a 24-word mnemonic |
| PreToolUse Bash | `guard-bash.sh` | Blocks `.env` access, push to main, force push, mainnet, `curl \| sh`, gh repo changes; asks on new deps and recursive greps |
| PreToolUse Read/Edit/Write/Grep/Glob | `protect-files.sh` | Blocks `.env*` (not `.env.example`), key files, `invoice/`, lockfile and `.git` edits |

`context-gate.sh`, `format-file.sh`, `typecheck-on-stop.sh` and `tasks-on-stop.sh` stay unwired (scripts kept in
`.claude/hooks/`). Run `npm run check` yourself before a push. If a hook blocks you, follow its message and report a
legitimate block; do not route around it. Test the hooks with `.claude/hooks/test-hooks.sh`.

## Subagents (`.claude/agents/`)
- `reviewer`: review a requested diff.
- `security-reviewer`: before any push touching uploads, admin routes, env, scripts or CI.
- `test-writer`: tests for settled modules (gates, parsers, clustering, payout ledger).
- `docs-keeper`: sync `diseno/` and `docs/` after code changes.
Delegate with a self-contained brief; the subagent does not see this conversation.

## Skills (`.claude/skills/`, invoke with `/name`)
- `/adr <title>`: new ADR in `docs/adr/`.
- `/sync-context`: end-of-block update of `docs/ai-log.md` and handoff.
- `security-baseline`, `verifier-gates`, `web-ui`, `engine-api`: still useful for the street flow.
- `cardano-preprod`, `masumi-sokosumi`, `x402-payments`, `tum-hackathon-agent`, `log-evidence`, `milestone-check`,
  `pr-description`: legacy Shelfie skills; do not use them for CiudadCheck.

## Working style
- Plan before multi-file changes; small commits; run `npm run check` in `codigo/` and show the result.
- Work only inside your branch's paths (`AGENTS.md`); ask the integrator for contract or manifest changes.
- Prefer the Grep and Glob tools over recursive shell greps (they honour the deny rules).
- Run `/sync-context` before ending a session.
