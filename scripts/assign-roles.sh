#!/usr/bin/env bash
# Regenerate .github/CODEOWNERS from .github/CODEOWNERS.template and scripts/team.conf.
# Unassigned roles (ROLE_X empty) fall back to the whole team.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck source=/dev/null
source "$ROOT/scripts/team.conf"
TEAM="@$HELMUT @$ISABEL @$FERNANDO @$LORENZ"
role() { local v="$1"; if [ -n "$v" ]; then echo "@$v"; else echo "$TEAM"; fi; }
A="$(role "${ROLE_A:-}")"; B="$(role "${ROLE_B:-}")"; C="$(role "${ROLE_C:-}")"; D="$(role "${ROLE_D:-}")"
sed -e "s|@ROLE_A|$A|g" -e "s|@ROLE_B|$B|g" -e "s|@ROLE_C|$C|g" -e "s|@ROLE_D|$D|g" \
    -e "s|@HELMUT|@$HELMUT|g" -e "s|@ISABEL|@$ISABEL|g" -e "s|@FERNANDO|@$FERNANDO|g" -e "s|@LORENZ|@$LORENZ|g" \
    "$ROOT/.github/CODEOWNERS.template" \
  | awk '{ if ($0 ~ /^[^#]/ && NF>1) { out=$1; delete seen; for(i=2;i<=NF;i++) if(!seen[$i]++) out=out" "$i; print out } else print }' \
  > "$ROOT/.github/CODEOWNERS"
echo "CODEOWNERS written. Roles: A=${ROLE_A:-team} B=${ROLE_B:-team} C=${ROLE_C:-team} D=${ROLE_D:-team}"
