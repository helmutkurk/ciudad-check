#!/usr/bin/env bash
# CI check (also runnable locally): the PR body field "Tasks:" lists task ids with a state, e.g.
#   - Tasks: A-05 (doing), A-06 (done)      or      - Tasks: none
# Every id must exist in equipo/tasks/ at the PR head; "(done)" requires status done, "(doing)" requires doing or done.
# Usage: check-pr-tasks.sh <pr-body-file> [repo-root]
set -uo pipefail
body="$1"; root="${2:-.}"
fail=0; err() { echo "::error::$1"; echo "FAIL: $1"; fail=1; }
line=$(sed -E 's/<!--.*-->//g' "$body" | tr -d '\r' | awk '{ l=$0; sub(/^[-*][ \t]*/, "", l); if (l ~ /^Tasks:/) { sub(/^Tasks:[ \t]*/, "", l); print l; exit } }')
if [[ -z "${line// }" || "$line" == *"<"*">"* ]]; then
  err "PR body has no filled 'Tasks:' line (use 'Tasks: none' or 'Tasks: A-05 (doing), A-06 (done)')"; exit 1
fi
[[ "$(tr '[:upper:]' '[:lower:]' <<<"$line")" =~ ^none ]] && { echo "tasks check OK (none)"; exit 0; }
n=0
while read -r id st; do
  [[ -z "$id" ]] && continue
  n=$((n+1))
  actual=$(bash "$root/scripts/task.sh" status "$id" 2>/dev/null || echo unknown)
  case "$st" in
    done)  [[ "$actual" == done ]] || err "$id is listed as done but equipo/tasks has '$actual' (run: bash scripts/task.sh done $id --evidence <text>)" ;;
    doing) [[ "$actual" == doing || "$actual" == done ]] || err "$id is listed as doing but equipo/tasks has '$actual' (run: bash scripts/task.sh start $id)" ;;
    *)     err "$id needs a state: '$id (done)' or '$id (doing)'" ;;
  esac
done < <(grep -oE '[A-D T]-[0-9]{2,3}[ ]*(\((done|doing)\))?' <<<"$line" | tr -d ' ' | sed -E 's/^([A-DT]-[0-9]+)(\((done|doing)\))?$/\1 \3/')
[[ $n -eq 0 ]] && err "no task ids found in 'Tasks: $line'"
[[ $fail -eq 0 ]] && echo "tasks check OK ($n ids)"
exit $fail
