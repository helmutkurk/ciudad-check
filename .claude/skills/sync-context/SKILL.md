---
name: sync-context
description: End-of-work-block routine that keeps repo context current for the next person or agent. Use before stopping, before handoff, or after finishing a milestone step.
disable-model-invocation: true
---
# Sync context

0. Update task statuses first: `bash scripts/task.sh list <role> --open`, then `start`, `done <id> --evidence <text>`, `block <id> <reason>` for what changed in this block, and `add <role> <title> --acceptance <text>` for newly discovered work. Never hand-edit `equipo/tasks/`.
1. Append an entry to `docs/ai-log.md` (format in the file): date and time, who, what was done, `- TODO:` open items, `- Handoff:` what the next person needs, and what worked or not with the agent.
2. Overwrite your own `equipo/<name>.md` (current focus, active branch, components, open questions, last updated; only your file). Register any new bot/script/tool in `equipo/components.md` (see `equipo/README.md`).
3. Move answers to "verify Friday" questions into `codigo/docs/verified.md` with source and time.
4. If behaviour changed, update the matching `diseno/` section or call the `docs-keeper` agent. A deliberate deviation gets an ADR.
5. Tx hashes seen in this block are in `codigo/docs/evidence/tx-hashes.md` (skill `log-evidence`).
6. Run `npm run check` in `codigo/` if it exists and report the result.
7. List uncommitted files and unpushed branches to the user. Do not push without asking.
