# Agent setup

Start with [STATE](../STATE.md), [AGENTS](../../AGENTS.md) and
[START-HERE](../START-HERE-TEAM.md). Use `~/Projects/shelfie` and branch `main`.
This is post-hackathon maintenance, not the former parallel event workflow.

- Node 24, git, jq and gitleaks; authenticated gh only for explicitly requested
  remote work. Install git hooks once with `bash scripts/install-githooks.sh`.
- Claude Code loads `CLAUDE.md`, AGENTS, scoped rules and the hooks wired in
  `.claude/settings.json`. Security guards remain active. The context-ack,
  format-on-edit and stop hooks remain unwired under ADR-0008. Do not recreate
  ignored state or weaken permissions to follow an old setup note.
- Codex reads AGENTS directly; Claude hooks do not provide Codex enforcement.
  Follow the shared rules and review the diff. Keep sandbox protections enabled.
- Read relevant [role skills](skills.md) as needed. Do not install extra skills,
  plugins or MCP servers automatically.
- Never read `.env` files or paste secrets. Humans configure local secrets; local
  development can use the fake launcher without reading an env file.
- Run `mise exec node@24 -- npm run check` from `codigo/` and report exact results.
  Test guards with `bash .claude/hooks/test-hooks.sh` when changing hook guidance.

Helmut maintains `main` and synchronizes `dev` under his own authorization;
GitHub protection stays active. Agent push guards remain deliberately restrictive.
No agent publication follows merely from using this setup. See
[CONTRIBUTING](../../CONTRIBUTING.md) and [deploy](../deploy.md).
