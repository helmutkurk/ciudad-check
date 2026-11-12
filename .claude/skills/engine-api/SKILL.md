---
name: engine-api
description: Use when changing role A's engine API, shared core schemas, state machines, intake, or shell bridge contracts.
---
# Engine API (role A)

## When to use

Use for engine endpoints, shared types and errors, state transitions, intake, or bridge-facing API changes.

## Read first

- [Contracts](../../../diseno/contracts.md), [domain model](../../../diseno/domain-model.md), and [repo layout](../../../diseno/repo-layout.md)
- [Core README](../../../codigo/packages/core/README.md), [engine README](../../../codigo/apps/engine/README.md), [shell README](../../../codigo/apps/shell/README.md)
- [TypeScript rule](../../rules/typescript.md) and [security baseline](../../../diseno/security.md)

## Commands and tests to run

From codigo/:

    npx vitest run packages/core/src/core.test.ts packages/core/src/states.test.ts apps/engine/src/engine.test.ts apps/engine/src/units.test.ts
    npm test -w @shelfie/shell
    npm run check

For end-to-end fake flows, run npm run hub-up -- --fake, then npm run smoke, then npm run hub-up -- stop.

## Contracts and invariants

- Contracts first: change the canonical contract/design, announce shared-core changes to consumers, then update zod schemas and implementation in the same change.
- Use strict zod schemas at boundaries, the single AppError from @shelfie/core, and error codes declared in core. State changes go through the core transition tables.
- Intake accepts catalog ids only. A rejected request persists a REJECTED_INPUT job with its id and no tasks; preserve that result for the shell's INTAKE_REJECTED response.
- Fakes first: use injectable clock and ids, and FAKE_PAYMENTS=1, VERIFIER_PAYMENT=off, VERIFIER_MODE=stub for local flows.
- Today workerId is sent in the request body; session-cookie auth is deferred. Treat this as a known security gap, not verified identity.

## Verify Friday

- Confirm starter task-id/deadline mapping, input select support, and real Sokosumi intake behavior against the pinned starter docs.
- Reconcile proposals against contracts.md before changing shared schemas; record unknown external behavior in codigo/docs/verified.md.

## Do not

- Do not add a second AppError, duplicate shared schemas in consumers, accept free-text names in place of catalog ids, or invent error codes.
- Do not claim worker identity is authenticated by the current workerId body field.
- Do not change session behavior or another role's files without the owner review required by AGENTS.md.
