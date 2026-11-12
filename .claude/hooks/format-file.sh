#!/usr/bin/env bash
# PostToolUse(Edit|Write): format only the edited file with Prettier once codigo/ has dependencies.
# No-op while no package.json / node_modules exists (the repo starts without application code).
command -v jq >/dev/null || exit 0
file=$(jq -r '.tool_input.file_path // ""')
[[ -z "$file" || ! -f "$file" ]] && exit 0
proj="${CLAUDE_PROJECT_DIR:-.}"
[[ -f "$proj/codigo/package.json" ]] || exit 0
prettier="$proj/codigo/node_modules/.bin/prettier"
[[ -x "$prettier" ]] || exit 0
case "$file" in
  "$proj"/codigo/*.ts|"$proj"/codigo/*.tsx|"$proj"/codigo/*.js|"$proj"/codigo/*.jsx|"$proj"/codigo/*.mjs|"$proj"/codigo/*.json|"$proj"/codigo/*.css)
    if ! out=$(cd "$proj/codigo" && "$prettier" --write "$file" 2>&1); then
      echo "Prettier problems in $file:" >&2; echo "$out" | tail -n 20 >&2; exit 2
    fi ;;
esac
exit 0
