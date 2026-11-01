---
name: pr-description
description: Draft an optional PR description from a requested diff. Current maintenance follows ADR-0008; the event release workflow is historical.
disable-model-invocation: true
---
# PR description

1. Read AGENTS, STATE and the requested diff. Do not assume dev-to-main or fetch,
   pull, post comments or create a PR without authorization.
2. Fill `.github/pull_request_template.md`: problem, resulting behavior, actual
   validation, context/purpose, task status, contracts, dependencies and risks.
3. Facts only; disclose unavailable checks. Use an ADR or declared minor impact
   for purpose-file changes. No invented milestone completion or evidence.
4. Return the text. GitHub protection stays team-controlled; ADR-0008 replaces
   the event's mandatory three-approval release convention.
