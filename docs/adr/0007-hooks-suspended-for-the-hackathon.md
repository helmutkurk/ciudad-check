# ADR 0007: Workflow hooks suspended for the rest of the hackathon

- Status: accepted (Isabel and Helmut, 2026-10-31)
- Context: only Isabel and Helmut are working on hackathon day. The context-ack gate (Claude hook and git pre-commit), Prettier on every edit, typecheck on every stop and the task reminder (`task.sh` fails on native Windows) slow every agent step before the 13:00 last paid cycle and the 15:00 deadline.
- Decision:
  1. Unwire `context-gate.sh`, `format-file.sh`, `typecheck-on-stop.sh` and `tasks-on-stop.sh` from `.claude/settings.json`; remove the context-ack check from `.githooks/pre-commit`. The scripts stay in the repo.
  2. Keep the security guards, which cost no time: `guard-bash.sh` (`.env`, push to `main`, force push, mainnet, `curl | sh`), `protect-files.sh`, `prompt-guard.sh`, gitleaks in pre-commit, the `commit-msg` trailer and CI. The repo is public (ADR 0003): a leaked secret is permanent.
  3. `npm run check` before every push stays mandatory, run by hand.
- Consequences: agents are no longer forced to read the purpose docs before a change; peer review and the release PR remain the check. Restore the hooks after the event by reverting this commit's changes to `.claude/settings.json` and `.githooks/pre-commit`.
