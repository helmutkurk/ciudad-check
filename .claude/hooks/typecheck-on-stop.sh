#!/usr/bin/env bash
# Stop: run the typecheck once when the turn left changed or new TypeScript files.
# No-op without codigo/package.json and node_modules. Exit 2 sends errors back to Claude;
# stop_hook_active prevents loops.
command -v jq >/dev/null || exit 0
input=$(cat)
[[ "$(jq -r '.stop_hook_active // false' <<<"$input")" == "true" ]] && exit 0
proj="${CLAUDE_PROJECT_DIR:-.}"
cd "$proj" || exit 0
[[ -f codigo/package.json && -d codigo/node_modules ]] || exit 0
jq -e '.scripts.typecheck' codigo/package.json >/dev/null 2>&1 || exit 0
changed=$( { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } )
grep -qE '^codigo/.*\.(ts|tsx)$' <<<"$changed" || exit 0

if ! out=$(cd codigo && npm run -s typecheck 2>&1); then
  echo "Typecheck failed. Fix before finishing:" >&2
  echo "$out" | tail -n 40 >&2
  exit 2
fi
exit 0
