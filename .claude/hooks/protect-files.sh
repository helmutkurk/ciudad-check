#!/usr/bin/env bash
# PreToolUse(Read|Edit|Write|Grep|Glob): block access to secrets, key material and the personal invoice folder;
# block hand edits of lockfiles and git internals. Exit 2 = block; reason on stderr.
command -v jq >/dev/null || { echo "protect-files: jq is required (see CONTRIBUTING.md)." >&2; exit 2; }
input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
file=$(jq -r '.tool_input.file_path // .tool_input.path // ""' <<<"$input")
glob=$(jq -r '.tool_input.glob // .tool_input.pattern // ""' <<<"$input")

is_env_name() { # $1 = basename
  [[ "$1" == .env* && "$1" != ".env.example" && "$1" != ".env.sample" && "$1" != .env.*.example ]]
}
glob_hits_env() { # $1 = glob basename; true when the glob could match a real env file
  [[ "$1" == *[\*\?\[]* ]] || return 1
  local f
  for f in .env .env.local .env.production; do
    # shellcheck disable=SC2053
    [[ "$f" == $1 ]] && return 0
  done
  return 1
}

if [[ "$tool" == "Grep" || "$tool" == "Glob" ]]; then
  for target in "${file##*/}" "${glob##*/}"; do
    [[ -z "$target" ]] && continue
    if is_env_name "$target" || glob_hits_env "$target"; then
      echo "Blocked: do not search environment files ($target); use .env.example." >&2; exit 2
    fi
  done
  case "$file/$glob" in
    *invoice/*|invoice*) echo "Blocked: invoice/ is personal and git-ignored." >&2; exit 2 ;;
  esac
  [[ "$tool" == "Grep" ]] && exit 0
fi
[[ -z "$file" ]] && exit 0
rel="${file#"${CLAUDE_PROJECT_DIR:-}"/}"

block() { echo "Blocked: $1 ($rel)." >&2; exit 2; }

case "$rel" in
  .env|.env.*|*/.env|*/.env.*)
    case "${rel##*/}" in
      .env.example|.env.sample|.env.*.example) ;;
      *) block "environment files hold secrets (any .env variant); use .env.example" ;;
    esac ;;
  invoice|invoice/*) block "invoice/ holds personal receipts and is git-ignored" ;;
  package-lock.json|*/package-lock.json|yarn.lock|pnpm-lock.yaml)
    [[ "$tool" == "Read" || "$tool" == "Glob" ]] && exit 0
    block "lockfiles change only through npm commands" ;;
  .git/*|*/.git/*)
    [[ "$tool" == "Read" || "$tool" == "Glob" ]] && exit 0
    block "never edit git internals" ;;
  *.pem|*.key|*.p12|*.pfx|*.skey) block "key material does not belong in the repo" ;;
  *mnemonic*.txt|*seed-phrase*|*wallets.json) block "wallet secrets stay in the local .env or the wallet manager" ;;
esac
exit 0
