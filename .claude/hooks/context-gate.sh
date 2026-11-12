#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit|NotebookEdit|Bash): block changes until this session acknowledged the project context.
# Reading tools are never matched. Bash is checked conservatively: only commands that look like they write.
# Exit 2 = block. Replacement: bash scripts/context-ack.sh --session <id> --who <name>
command -v jq >/dev/null || { echo "context-gate: jq is required (see CONTRIBUTING.md)." >&2; exit 2; }
input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
sid=$(jq -r '.session_id // ""' <<<"$input")
[[ "$sid" =~ ^[A-Za-z0-9._-]+$ ]] || sid="unknown"
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

writes=0
case "$tool" in
  Edit|Write|MultiEdit|NotebookEdit) writes=1 ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
    # The ack script itself: plain invocation only, no chaining or redirects.
    if [[ "$cmd" =~ ^[[:space:]]*(bash[[:space:]]+)?(\./)?scripts/context-ack\.sh([[:space:]][A-Za-z0-9._\ -]*)?$ ]]; then exit 0; fi
    # Drop harmless redirects, then look for write operations in command position.
    c=$(sed -E 's/[0-9]*>&[0-9-]+//g; s/[0-9]*>>?[[:space:]]*\/dev\/(null|stderr|stdout)//g' <<<"$cmd")
    pos='(^|[;&|(]|\$\()[[:space:]]*((sudo|env|command)[[:space:]]+)*([^[:space:]]*/)?'
    re_sed="${pos}(sed|perl)[[:space:]]+[^;&|]*-[a-zA-Z]*i"
    re_fs="${pos}(tee|mv|rm|cp|mkdir|rmdir|touch|chmod|truncate|dd|patch|ln|install)([[:space:]]|\$)"
    re_git="${pos}git[[:space:]]+(commit|merge|rebase|cherry-pick|apply|am|checkout|switch|restore|reset|stash|pull|push|mv|rm)([[:space:]]|\$)"
    re_npm="${pos}(npm|pnpm|yarn)[[:space:]]+(install|i|ci|add|update|uninstall|remove|audit[[:space:]]+fix)([[:space:]]|\$)"
    if [[ "$c" == *">"* || "$c" =~ $re_sed || "$c" =~ $re_fs || "$c" =~ $re_git || "$c" =~ $re_npm ]]; then
      writes=1
    fi ;;
esac
[[ $writes -eq 0 ]] && exit 0

if bash "$root/scripts/context-ack.sh" --check --session "$sid" 2>/dev/null; then exit 0; fi
cat >&2 <<MSG
Blocked by the context gate: this session has not acknowledged the project context (or AGENTS.md / ideas/decision.md / diseno/decisions.md changed since).
Do this, then retry:
  1. bash scripts/context-ack.sh --session $sid --who <isabel|fernando|lorenz|helmut>
  2. Read the files it lists (AGENTS.md, ideas/decision.md, official-agent-prompt.md, diseno/README.md, equipo/*, last 2 docs/ai-log.md entries).
  3. Say the project purpose, your role and the files you read in your next message, then proceed.
Do not change the purpose, design, files or code before that. See AGENTS.md > Context gate.
MSG
exit 2
