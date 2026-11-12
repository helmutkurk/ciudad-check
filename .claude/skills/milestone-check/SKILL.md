---
name: milestone-check
description: Check milestone M1-M6 against the acceptance criteria and evidence rules in diseno/repo-layout.md section 5. Use when a milestone is claimed done or before a go/no-go.
argument-hint: "<M1..M6>"
disable-model-invocation: true
---
# Milestone check

1. Read the milestone section in `diseno/repo-layout.md` section 5 (work, acceptance, evidence).
2. For each acceptance sentence, find proof: code path, test, run output, or a row in `codigo/docs/evidence/tx-hashes.md`. Mark each `met`, `not met` or `unverified`, with the proof location.
3. For each required evidence item, check the file exists in `codigo/docs/evidence/` (hash, screenshot, wallets in `wallets.md`, versions). Evidence from fakes or override runs does not count.
4. Check preprod only and no secrets in the evidence files.
5. Output a table (criterion, status, proof) and one line: `Milestone Mn: done / not done`, plus the next missing item and its owner role.
6. Do not edit the milestone definition; do not mark anything `met` without proof.
