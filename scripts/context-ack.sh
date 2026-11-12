#!/usr/bin/env bash
# Context gate. Prints the project context card and records an acknowledgement.
# The ack stores the session id and a hash of the purpose docs; it expires when they change.
# Usage:
#   bash scripts/context-ack.sh [--session <id>] [--who <name>]   print card, write ack
#   bash scripts/context-ack.sh --check [--session <id>]           exit 0 if ack valid for that session
#   bash scripts/context-ack.sh --check --any                      exit 0 if any ack matches current hash (git hooks)
# Session id: Claude Code passes it in the hook message; other agents use a label such as "codex".
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"
STATE="$ROOT/.claude/state"
HASH_FILES=(AGENTS.md ideas/decision.md diseno/decisions.md)
cur_hash() { cat "${HASH_FILES[@]}" 2>/dev/null | sha256sum | cut -d' ' -f1; }
sid_ok() { [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }

mode=ack; session=manual; who=""; any=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) mode=check ;;
    --any) any=1 ;;
    --session) session="${2:-}"; shift ;;
    --who) who="${2:-}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac; shift
done
sid_ok "$session" || { echo "invalid session id" >&2; exit 64; }
hash="$(cur_hash)"

if [[ $mode == check ]]; then
  if [[ $any -eq 1 ]]; then
    for f in "$STATE"/ack-*; do [[ -f $f ]] && grep -qx "hash=$hash" "$f" && exit 0; done; exit 1
  fi
  f="$STATE/ack-$session"
  [[ -f $f ]] && grep -qx "hash=$hash" "$f" && grep -qx "session=$session" "$f"
  exit $?
fi

section() { awk -v h="$1" '$0==h{g=1;next} /^## /{g=0} g&&NF' AGENTS.md; }
echo "=== Shelfie context card (read before changing anything) ==="
echo "Purpose (AGENTS.md, 'The project in 5 lines'):"
section "## The project in 5 lines" | cut -c1-400
echo
echo "Operation (AGENTS.md, 'Current phase'):"
section "## Current phase" | cut -c1-300
echo
echo "Never-do list: AGENTS.md > 'Security and public content' (secrets, mainnet, unauthorized publication, invented facts)."
if [[ -n "$who" ]]; then
  pf="equipo/$(echo "$who" | tr '[:upper:]' '[:lower:]').md"
  if [[ -f $pf ]]; then
    echo "Role for '$who' ($pf):"
    sed -n '1,/^## Active branch/p' "$pf" | grep -v '^## Active branch' | sed '/^$/d' | cut -c1-200
  else
    echo "Role: no file $pf; check equipo/ and AGENTS.md Ownership."
  fi
else
  echo "Role: not given. Re-run with --who <isabel|fernando|lorenz|helmut> and state your role."
fi
if [[ -n "$who" && -f scripts/task.sh ]]; then
  echo
  timeout 5 bash scripts/task.sh brief "$who" 2>/dev/null | head -n 14 || true
fi
echo
echo "Mandatory files to read now (the gate cannot verify reading; you must):"
echo "  AGENTS.md"
echo "  ideas/decision.md"
echo "  investigacion/cardano/official-agent-prompt.md"
echo "  diseno/README.md (then your area's file, see 'Who reads what first')"
echo "  equipo/README.md and equipo/components.md"
echo "  docs/ai-log.md, last 2 entries:"
[[ -f docs/ai-log.md ]] && grep -n '^## ' docs/ai-log.md | tail -n 2 | sed 's/^/    line /'
echo
echo "First reply of the session: state the purpose in one sentence, your role, and the files you read."

mkdir -p "$STATE"
printf 'session=%s\nhash=%s\nwho=%s\ntime=%s\n' "$session" "$hash" "$who" "$(date -Is)" > "$STATE/ack-$session"
echo "Ack written for session '$session' (valid until AGENTS.md, ideas/decision.md or diseno/decisions.md change)."
