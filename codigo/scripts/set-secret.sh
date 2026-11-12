#!/usr/bin/env bash
# Store one value in the git-ignored codigo/.env without echo, shell history or chat.
# Usage (from anywhere): bash codigo/scripts/set-secret.sh VISION_API_KEY [VISION_FALLBACK_API_KEY ...]
# Creates codigo/.env from .env.example if missing, replaces or appends NAME=value, chmod 600.
# The npm scripts of @shelfie/eval and @shelfie/verifier load codigo/.env; hub-up.sh reads it too.
set -euo pipefail
umask 077
tmp=""
trap 'if [[ -n "$tmp" ]]; then rm -f -- "$tmp"; fi' EXIT
trap 'exit 130' INT TERM

CODIGO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$CODIGO/.env"

[[ $# -ge 1 ]] || { echo "usage: set-secret.sh NAME [NAME ...]" >&2; exit 2; }
[[ -t 0 ]] || { echo "set-secret: run in an interactive terminal" >&2; exit 2; }

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$CODIGO/.env.example" "$ENV_FILE"
  echo "created codigo/.env from .env.example"
fi
chmod 600 "$ENV_FILE"

for name in "$@"; do
  [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "set-secret: bad name '$name'" >&2; exit 2; }
  read -r -s -p "$name (hidden, empty = skip): " value
  echo
  [[ -n "$value" ]] || { echo "skipped $name"; continue; }
  tmp="$(mktemp "$CODIGO/.env.tmp.XXXXXX")"
  chmod 600 "$tmp"
  # Value goes through the environment, never argv (visible in ps).
  NAME="$name" VALUE="$value" awk '
    BEGIN { n = ENVIRON["NAME"]; v = ENVIRON["VALUE"]; done = 0 }
    index($0, n "=") == 1 { if (!done) print n "=" v; done = 1; next }
    { print }
    END { if (!done) print n "=" v }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
  unset value
  echo "stored $name in codigo/.env"
done
