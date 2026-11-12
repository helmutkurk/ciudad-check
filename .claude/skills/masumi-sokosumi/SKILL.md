---
name: masumi-sokosumi
description: Use when integrating role A's Masumi starter, Sokosumi Coworker task flow, escrow, or deliver/withhold bridge.
---
# Masumi and Sokosumi (role A)

## When to use

Use for the starter fork, bridge, Coworker execution, workspace setup, or escrow result handling.

## Read first

- [Official agent prompt](../../../investigacion/cardano/official-agent-prompt.md)
- [Masumi runbook](../../../investigacion/cardano/masumi-runbook.md)
- [Shell README](../../../codigo/apps/shell/README.md)
- [Contracts, bridge section](../../../diseno/contracts.md#16-shell-bridge-owner-a-the-only-shell-code-of-ours)
- [Milestones M3–M5](../../../diseno/repo-layout.md#5-definition-of-done-per-milestone)

## Commands and tests to run

From codigo/:

    npm test -w @shelfie/shell
    npm run check

Before creating resources, inspect saved Preprod state and reuse it:

    sokosumi --preprod auth whoami --json
    sokosumi --preprod workspaces list --json
    sokosumi --preprod vendors me --json
    sokosumi --preprod coworkers list --scope owned --json

Read the starter's saved state files listed in the runbook. Its setup commands and starter pin remain verify-Friday items until its README and AGENTS.md are inspected.

## Flow and invariants

- Follow the official order: verify a model reply, run one execution-only Coworker task, then add the paid task only after the role owner authorises resource creation in writing.
- Reuse existing Vendor, Coworker, wallets, Payment Service state, and pending task records after restart. Never auto-retry an uncertain Masumi write.
- The bridge is thin: map the Sokosumi task id to one engine job, await DELIVER or WITHHOLD, and report settlement observations.
- M3 and M4 tests run in the Personal Workspace. Join the TUM Workspace before Vendor creation; after Personal tests pass, connect the demo Coworker to TUM and verify the seat/grant.
- DELIVER submits the report through the starter. WITHHOLD returns no result hash; do not submit failure text as a result. The no-hash path is intended to trigger buyer refund under ADR-11.
- The starter's behavior when the bridge returns no answer, task deadlines, refund timing, and task-id seam are verify Friday. M3 is unpaid, M4 paid escrow, M5 no-hash WITHHOLD and observed refund.

## Verify Friday

- Inspect and pin the official starter README and AGENTS.md; record the pinned commit in codigo/docs/verified.md.
- Prove that WITHHOLD submits no result hash and does not complete the task. Confirm input-schema/select support, real task id/deadline fields, Personal-to-TUM switch, grants, and refund timing.
- Keep the official prompt's optional Masumi skill, masumi-skills, Cardano Dev Skills, and Sokosumi MCP uninstalled until the machine owner reviews them.

## Do not

- Do not create or fund paid/on-chain resources before written role-owner authorisation.
- Do not create duplicate resources, expose credentials, commit .env files, or assume a failed result text causes a refund.
- Do not rewrite the starter or add business logic to the bridge.
