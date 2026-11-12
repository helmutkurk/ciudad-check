# equipo/ - component registry and team records

As of 2026-11-01, [STATE](../docs/STATE.md) and ADR-0008 govern operation.
Other people's dated notes and event task tables are retained as historical records;
their deployment, branch and deadline statements do not describe current uptime.
Do not mark old tasks done without evidence or hand-edit task tables.

Purpose: every member and their coding agent records what they are doing now and what they added, so every other agent can find it without asking. Example: Isabel builds a new bot; her file and the registry say what it is, where the code is, how to run it, its status and who owns it.

## How it differs from `docs/ai-log.md`
| | `docs/ai-log.md` | `equipo/` |
|---|---|---|
| Content | Chronological history | Current state |
| Edits | Append only | Overwrite allowed |
| Who | Anyone, new entry per block | Each person/agent edits only their own file |

## Files
- `isabel.md` (A), `fernando.md` (B), `lorenz.md` (C), `helmut.md` (D): one per person.
- `tasks/`: per-role task lists (`A.md`-`D.md`, `team.md` for pair and shared tasks) with status, owner, dependencies, milestone, due time, acceptance and evidence. Maintained by coding agents through `bash scripts/task.sh` (`list`, `next`, `start`, `done`, `block`, `add`); humans never need to edit them. Starting a block: `bash scripts/task.sh next <role>`; ending it: update statuses. SessionStart, the context card and the Stop hook surface them; commits reference task ids in the message (e.g. `(A-10)`); only the release PR keeps a "Tasks:" line that CI checks.
- `components.md`: single registry of everything contributed outside the planned design (bots, scripts, helper agents, prompts, tools).

## Rules
1. Edit only your own `equipo/<name>.md`. Other files: ask the owner or edit and tell them (peer review shows it).
2. Update your file at the end of every work block (skill `sync-context`): current focus, active branch, components, open questions, last updated.
3. Anything new that another person's agent might call or rely on is registered in `components.md` in the same commit as the code. Anyone may edit `components.md`; peer review checks it.
4. Placement of extras: inside the owning role's folder when it fits the planned layout (`diseno/repo-layout.md` section 1); otherwise in `codigo/tools/<name>/` with its own `README.md` (what, run command, env var names, status). Adding a tool to the npm workspaces needs a one-line reason in the commit message.
5. No secrets, tx hashes or long logs here (tx hashes: `codigo/docs/evidence/tx-hashes.md`). Link to files instead of copying.
6. Status values: `idea`, `wip`, `works`, `broken`, `retired`.

## How agents use it
- Session start: read this file, `components.md`, your own file and your pair's file (pairs: A+B, C+D; see `AGENTS.md` Ownership).
- Before building a helper, search `components.md`: reuse beats duplicating.
- Before calling something owned by someone else, check its status and run command in the registry.
- End of block: refresh your file; register new components.

## Template for a person file
```
# <Name> - role <X>
- Role and pair: ...
- GitHub: ...

## Current focus
<1-3 lines, updated each work block>

## Active branch
<branch, state>

## Components I added
| Name | Path | What it does | How to run | Status | Depends on |
|---|---|---|---|---|---|

## Open questions
- <question> (owner)

## Last updated
<YYYY-MM-DD HH:MM> by <person or agent>
```

## Template for a `components.md` row
`| name | owner | path | purpose | run command | status | design doc |`
