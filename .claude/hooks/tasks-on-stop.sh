#!/usr/bin/env bash
# Stop: nudge the agent to update equipo/tasks/ when files in the person's role area changed this
# session (mtime newer than the session ack; works with or without git) and no task file did.
# Exit 2 + stderr is the only way a Stop hook reaches the agent; it is safe because it fires at most
# once per 15 minutes per session and never when stop_hook_active is set. No ack, unknown role, or
# no scripts/task.sh -> silent exit 0.
command -v jq >/dev/null || exit 0
input=$(cat)
[[ "$(jq -r '.stop_hook_active // false' <<<"$input")" == "true" ]] && exit 0
sid=$(jq -r '.session_id // ""' <<<"$input")
[[ "$sid" =~ ^[A-Za-z0-9._-]+$ ]] || sid=""
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[[ -f scripts/task.sh && -d equipo/tasks ]] || exit 0
read -r role _ ack < <(timeout 5 bash scripts/task.sh who --session "$sid" 2>/dev/null)
[[ "$role" =~ ^[A-D]$ && -f "$ack" ]] || exit 0

case "$role" in
  A) areas=(codigo/apps/shell codigo/apps/engine codigo/packages/core) ;;
  B) areas=(codigo/packages/payments codigo/apps/verifier codigo/scripts scripts) ;;
  C) areas=(codigo/packages/domain-shelf codigo/packages/vision codigo/eval) ;;
  D) areas=(codigo/apps/web codigo/packages/evidence codigo/docs/evidence README.md pitch) ;;
esac
existing=(); for a in "${areas[@]}"; do [[ -e $a ]] && existing+=("$a"); done
[[ ${#existing[@]} -gt 0 ]] || exit 0
changed=$(find "${existing[@]}" -type f -newer "$ack" -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -n 3)
[[ -n "$changed" ]] || exit 0
# A task file touched since the ack means the agent already updated its tasks.
[[ -z "$(find equipo/tasks -type f -name '*.md' -newer "$ack" 2>/dev/null | head -n 1)" ]] || exit 0

# Cooldown: one reminder per 15 minutes per session.
stamp=".claude/state/tasks-reminded-${sid:-none}"
if [[ -f $stamp && -z "$(find "$stamp" -mmin +15 2>/dev/null)" ]]; then exit 0; fi
mkdir -p .claude/state 2>/dev/null && : > "$stamp"

{
  echo "Task tracking: files in role ${role}'s area changed this session ($(tr '\n' ' ' <<<"$changed")) but equipo/tasks/ was not updated."
  echo "Before finishing, record the status with scripts/task.sh (never hand-edit):"
  echo "  bash scripts/task.sh list ${role} --open   # find the ids you worked on"
  echo "  bash scripts/task.sh start <id> | done <id> --evidence <text> | block <id> <reason> | add ${role} <title> --acceptance <text>"
  echo "If nothing in the task list applies, add the work with 'add'. Then continue."
} >&2
exit 2
