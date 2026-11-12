# 0001. Agent-ready repository setup

- Status: accepted
- Date: 2026-10-29
- Deciders: Helmut

## Context
Four people build Shelfie in about 30 hours, each with Claude Code or Codex. Agents must share one set of rules, one source of truth and the same guardrails around secrets, wallets and `main`. An earlier project of Helmut already proved a setup and recorded its failure modes.

## Decision
- `AGENTS.md` holds the shared rules (Codex reads it natively). `CLAUDE.md` starts with `@AGENTS.md` and adds Claude-only items, because Claude Code ignores `AGENTS.md` when `CLAUDE.md` exists.
- `.claude/settings.json` (committed) sets permissions (allow/ask/deny), model pins and hooks. `settings.local.json` is git-ignored explicitly.
- Hooks are shell scripts reading stdin directly: `guard-bash` (also covers `cat .env`, globs, push to main, force push, mainnet), `protect-files` (allows `.env.example`), `prompt-guard`, `session-context`, plus `format-file` and `typecheck-on-stop` that do nothing until `codigo/package.json` exists. `.claude/hooks/test-hooks.sh` tests them.
- Path-scoped rules in `.claude/rules/`, agents (reviewer, security-reviewer, test-writer, docs-keeper) and skills (pr-description, adr, log-evidence, sync-context, milestone-check).
- Context stays current through the PR checklist, ADRs, `docs/ai-log.md`, `codigo/docs/verified.md` and `codigo/docs/evidence/`.
- Main protected, PR with one code-owner review, squash merge, CI skips while there is no app code and runs a gitleaks scan.

## Consequences
- Needs `jq` on every machine. Hooks are a second line behind permissions; neither is a sandbox.
- Codex has no hooks equivalent here: it relies on `AGENTS.md` and review. Humans must not run Codex with approvals disabled.
- Branch protection depends on the GitHub plan (see `docs/github-setup.md`).

## Alternatives considered
- Only `CLAUDE.md`: Codex users would not get the rules.
- Duplicate rule files per agent: they drift.
- Rely on `permissions.deny` only: it does not stop `cat .env` through Bash.
