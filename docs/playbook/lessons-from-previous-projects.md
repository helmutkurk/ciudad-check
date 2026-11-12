# Lessons from previous projects

Adapted from an earlier agent setup used on a previous project. Each line: what happened, what this repo does.

| Lesson | What this repo does |
|---|---|
| Claude Code ignores `AGENTS.md` when `CLAUDE.md` exists | `CLAUDE.md` starts with `@AGENTS.md`; Codex and Claude share one rule file |
| Long `CLAUDE.md` files lose rules | `CLAUDE.md` < 150 lines, no tree dump; detail in path-scoped `.claude/rules/` |
| `deny Read(.env)` does not stop `cat .env` through Bash | `guard-bash.sh` checks every token; also blocks globs (`.e*`, `.[e]nv`) and asks on recursive greps |
| The guard expanded globs before inspecting them | `set -f` in the hook; tokens inspected as typed |
| Protect hooks that block `.env` also blocked `.env.example` | Explicit allow for `.env.example`, `.env.sample`, `.env.*.example`; tested |
| Hooks reading stdin in a subshell lost the input | Hooks read stdin once, directly, into a variable |
| `settings.local.json` is auto-ignored only on the creator's machine | Listed in `.gitignore` |
| Settings precedence is managed > CLI > local > project > user | Documented in `CLAUDE.md`; do not rely on user-level settings for rules |
| Without explicit choices agents rebuild existing functionality or add libraries | Pinned stack in `diseno/repo-layout.md`; new dependency needs a reason in the commit message; `ask` on `npm install <pkg>` |
| Docs drift from code (earlier prototype audit) | Docs updated in the same commit; `docs-keeper` agent; design is canonical |
| Temporary open routes and "to be wired" auth survive | No unauthenticated routes, not even temporarily (`security.md`); override is flagged and off by default |
| Checks that only warn are ignored | CI runs on every push and on the release PR; branch protection on `main` where the plan allows; agent peer review on `dev`; human rule in CONTRIBUTING |
| Agent access to Docker is root-equivalent | `docker` denied for the agent |
| Formatters can break Markdown front matter | Prettier hook runs on code files in `codigo/` only, never on Markdown |
| Short observations get lost | `docs/ai-log.md`, append-only; lasting ones are promoted to this folder |

Add a row when a repeated agent failure turns into a rule or hook.
