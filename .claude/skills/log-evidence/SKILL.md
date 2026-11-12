---
name: log-evidence
description: Record a Cardano preprod transaction hash with its explorer link in codigo/docs/evidence/tx-hashes.md. Use right after a real transaction (x402 payment, payout, escrow lock, settlement, refund).
argument-hint: "<milestone> <what> <tx hash>"
disable-model-invocation: true
---
# Log evidence

1. Take milestone (M1-M6), what happened, tx hash and who captured it from the arguments or ask. Never invent or retype a hash from memory: copy it from tool output or the explorer. If unseen, write `unverified`.
2. Confirm the network is preprod. Refuse mainnet hashes and addresses.
3. Append one row to `codigo/docs/evidence/tx-hashes.md` (create with the header if missing):
   `| milestone | what | tx hash | explorer link | captured by | UTC time | screenshot file | real or fake |`
4. Explorer link: use the preprod explorer URL pattern recorded in `codigo/docs/verified.md`; if not recorded, ask. Do not guess a domain.
5. Remind the user to save the screenshot as `codigo/docs/evidence/screenshots/M<n>-<what>-<hhmm>.png`, cropped of secrets.
6. Append only. A correction is a new row that references the old one.
