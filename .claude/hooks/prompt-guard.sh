#!/usr/bin/env bash
# UserPromptSubmit: stop prompts that contain obvious secrets; warn on mnemonic-looking text.
# Exit 2 blocks the prompt (reason shown to the user). Pattern-based, not a full DLP.
command -v jq >/dev/null || { echo "prompt-guard: jq is required (see CONTRIBUTING.md)." >&2; exit 2; }
prompt=$(jq -r '.prompt // ""')

found() { echo "Prompt blocked: it looks like it contains $1. Remove it and refer to the variable name instead." >&2; exit 2; }

grep -qE -- '-----BEGIN [A-Z ]*PRIVATE KEY-----' <<<"$prompt" && found "a private key"
grep -qE 'sk-ant-[A-Za-z0-9_-]{20,}' <<<"$prompt" && found "an Anthropic API key"
grep -qE '(AKIA|ASIA)[0-9A-Z]{16}' <<<"$prompt" && found "a cloud access key"
grep -qE '(ed25519_sk|ed25519e_sk|xprv|addr_xsk|stake_xsk)1[a-z0-9]{20,}' <<<"$prompt" && found "a Cardano signing key"
grep -qE '(preprod|preview|mainnet)[A-Za-z0-9]{32}' <<<"$prompt" && found "a Blockfrost project key"
grep -qE 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' <<<"$prompt" && found "a JWT / access token"
# NAME=value for the project's secrets, value is a literal (not $VAR, <placeholder>, empty)
grep -qE '(ADMIN_KEY|ENCRYPTION_KEY|BLOCKFROST[A-Z_]*|MNEMONIC[A-Z_]*|SOKOSUMI[A-Z_]*TOKEN|[A-Z_]*API_KEY)[[:space:]]*[:=][[:space:]]*["'"'"']?[^"'"'"'$<[:space:]{]{8,}' <<<"$prompt" && found "a secret assigned to a project variable"

# Mnemonic heuristic: 24 (or more) consecutive lowercase words of 3-8 letters separated by single spaces.
# Soft warning only: ordinary prose with punctuation does not match, but a pasted seed phrase does.
if grep -qE '(^|[^a-z])([a-z]{3,8} ){23}[a-z]{3,8}($|[^a-z])' <<<"$prompt"; then
  msg="Possible 24-word mnemonic in the prompt. Do not repeat, store or commit it; wallet phrases live only in the local .env. If this was a real wallet phrase, treat it as exposed and rotate the wallet."
  jq -n --arg m "$msg" '{systemMessage: $m, hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $m}}'
fi
exit 0
