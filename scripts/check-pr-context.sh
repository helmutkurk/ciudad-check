#!/usr/bin/env bash
# CI check (also runnable locally): the PR body must fill "Context and purpose"; purpose files need an ADR or declared minor impact.
# Usage: check-pr-context.sh <pr-body-file> <changed-files-file> [repo-root]
set -uo pipefail
body="$1"; changed="$2"; root="${3:-.}"
fail=0; err() { echo "::error::$1"; echo "FAIL: $1"; fail=1; }
sec=$(awk '/^## Context and purpose/{g=1;next} /^## /{g=0} g' "$body" | sed -E 's/<!--.*-->//g; s/<!--.*//; /-->/d' | tr -d '\r')
[[ -z "$(tr -d '[:space:]' <<<"$sec")" ]] && { err "PR body has no filled 'Context and purpose' section"; exit 1; }
val() { awk -v k="$1" '{ l=$0; sub(/^[-*][ \t]*/, "", l); if (index(l, k ":") == 1) { sub(/^[^:]*:[ \t]*/, "", l); print l; exit } }' <<<"$sec"; }
for k in "Files read" "Milestone / design section" "Purpose impact"; do
  v=$(val "$k"); if [[ -z "${v// }" || "$v" == *"<"*">"* || "$v" == "..." ]]; then err "'$k' is empty or still a placeholder"; fi
done
impact=$(val "Purpose impact")
purpose=$(bash "$root/scripts/purpose-files.sh" < "$changed")
if [[ -n "$purpose" ]]; then
  if [[ "$impact" =~ ^ADR-?[0-9A-Za-z-]+ ]]; then
    id=$(grep -oE '^ADR-?[0-9A-Za-z-]+' <<<"$impact")
    num=$(grep -oE '[0-9]+' <<<"$id" | head -n1)
    if ! grep -rqiE "(ADR[- ]?0*${num:-NONE}\b)|${id}" "$root/docs/adr" "$root/diseno/decisions.md" 2>/dev/null \
       && ! ls "$root/docs/adr" 2>/dev/null | grep -qE "0*${num:-NONE}[-_.]"; then
      err "$id is not found in docs/adr/ or diseno/decisions.md (add the ADR in this PR)"
    fi
  elif [[ "$impact" =~ ^minor:[[:space:]]*.{10,} ]]; then :
  else
    err "purpose files changed ($(tr '\n' ' ' <<<"$purpose")) but 'Purpose impact' is '${impact:-empty}': use ADR-<id> or 'minor: <reason>'"
  fi
fi
[[ $fail -eq 0 ]] && echo "context check OK (purpose files changed: $([[ -n "$purpose" ]] && echo yes || echo no))"
exit $fail
