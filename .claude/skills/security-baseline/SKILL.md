---
name: security-baseline
description: Use when any role changes or reviews auth, payments, env, uploads, network exposure, CI, dependencies, or evidence handling.
---
# Security baseline (all roles)

## When to use

Load for every session; use especially for payments, auth, uploads, env, CI, tunnels, logs, or evidence.

## Read first

- [Canonical threats and controls](../../../diseno/security.md), [security scaffold checklist](../../../preparacion/security-scaffold-checklist.md)
- [Security rule](../../rules/security.md), [payments rule](../../rules/payments-and-wallets.md), [security reviewer](../../agents/security-reviewer.md)

## Controls mapped to code

| Control | Code / proof |
|---|---|
| Env schema and preprod network guard | codigo/packages/core/src/env.ts (loadEnv and guardPreprod), codigo/packages/core/src/common.ts (NetworkSchema); names only in .env.example |
| Redacting structured logger | codigo/packages/core/src/logger.ts |
| Admin token, Origin/Host guards, loopback binding | codigo/apps/engine/src/http/security.ts and service boot |
| Upload validation and metadata stripping | codigo/apps/engine/src/jpeg.ts and codigo/apps/verifier/src/image.ts |
| Idempotency and wallet caps | codigo/packages/payments and verifier idempotency |
| Secret scanning and hooks | bash scripts/install-githooks.sh; gitleaks detect --no-git --source . --redact |

## Commands and tests to run

From repository root, install hooks once and run the redacted scan:

    bash scripts/install-githooks.sh
    gitleaks detect --no-git --source . --redact

From codigo/:

    npx vitest run packages/core/src/integration.sec.test.ts apps/engine/src/security.sec.test.ts apps/verifier/src/injection.sec.test.ts
    npm run check

Run the control-specific *.sec.test.ts named in diseno/security.md section 3 for changed code. Before push, request the read-only [security-reviewer](../../agents/security-reviewer.md) pass.

## Verify Friday

- Confirm tunnel exposure and secure phone origin, evidence-run settings, and any starter's install-script or audit findings before exposure.
- Worker session-cookie auth is deferred; workerId is still in the request body. Treat it as an open gap, not a completed control.

## Do not

- Never read .env files except .env.example, print credentials, or place personal data in logs or evidence.
- Never use mainnet, weaken hooks, bypass security tests, expose verifier/MPS/Postgres publicly, or add an unpinned dependency.
- Do not claim a control is complete without its code path and test evidence.
