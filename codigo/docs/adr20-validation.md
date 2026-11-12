# ADR-20 implementation and validation (Codex for Helmut, 2026-10-30)

> Historical record (2026-10-30). Superseded: the real Sokosumi adapter is implemented (`RealSokosumiClient`, see [verified.md](verified.md) A-25 and "Real adapter status"), brand orders moved to `/b` (ADR-21) and the demo runs in real mode (ADR-22), see [decisions](../../diseno/decisions.md).

Source: Helmut's ADR-20 implementation request and evening amendment: orders use `/dashboard`, no separate `/brand` app. No git writes, commits, pushes, dependencies or real purchases performed.

## Delivered and blocked

- Catalog-only dashboard order form, tab-memory brand access code, chain-filtered native store multi-select, price explicitly unquoted and credit ceilings labelled as limits. Demo shelf and REWE remain in the seeded catalog.
- Authenticated POST/GET Orders API, shared zod schemas/error codes/env; journal-backed reservations, per-order store cap, UTC-day credit cap, idempotent retry keys, safe uncertain outcomes and order/store/Task/job correlation through the existing shell create path.
- Fake client creates one visibly fake Task and real engine state machine job per store; verifier/payout adapters must also be fake. Delivery and refund are derived from observations, with no synthetic escrow txs. Evidence locks refuse fake orders; ledger flags and preflight retain fake provenance.
- Operator demo and override remain under a collapsed Operator disclosure, gated by the admin token.
- **Real purchasing is blocked, not complete.** `SOKOSUMI_CLIENT=real` selects the bounded read-only authenticated schema probe and then fails closed before mutation. The account-backed capped Task endpoint, coworker authority and starter identity are not established by the runbook. A READY Task plus an attached agent Job could purchase twice. B-15's exact spike is in [verified.md](verified.md); B-16 stays blocked on its required real 1-2-store order. No env-only real-buy switch is claimed.

## Test evidence

Use Node 24.22.2 (installed at `/home/hks/.local/share/mise/installs/node/24/bin`; system Node is 26). Tests and shell commands below ran with that Node 24 directory prepended to PATH.

- `cd codigo && npm run typecheck`: PASS across workspaces and scripts.
- `cd codigo && npx eslint .`: PASS.
- `cd codigo && npm run build -w @shelfie/web`: PASS (Vite production bundle).
- `cd codigo && npx vitest run apps/web/src apps/engine/src/orders.test.ts apps/engine/src/orders.sec.test.ts apps/engine/src/orders-http.sec.test.ts packages/core/src/core.test.ts packages/core/src/integration.sec.test.ts`: PASS, 113 tests in 13 files.
- After the final user-facing disabled-order copy edit: `npx vitest run apps/web/src/form.test.ts apps/web/src/dashboard.test.ts`: PASS, 14 tests; production web build passed again.
- `cd codigo && node --test apps/shell/bridge/order-input.test.js apps/shell/bridge/catalog-input.test.js apps/shell/bridge/starter-answer.test.js`: PASS, three test files. Full shell suite's socket fixture cannot finish in this sandbox; stopped after its blocked listener. No socket tests changed.
- `bash .claude/hooks/test-hooks.sh`: PASS, 113 passed / 0 failed.
- Redacted `gitleaks detect --no-git --source <dir> --redact --no-banner` for engine/src, web/src, core/src: PASS, no leaks. Env files were not scanned/read (except names-only `.env.example`).
- `git diff --check`: PASS.
- `cd codigo && npx vitest run --exclude '**/*.sec.test.ts'`: **294 passed / 69 failed**, 20 passing / 6 failing files, 69 `listen EPERM: operation not permitted 127.0.0.1` errors. Each failing case times out waiting on its denied listener; two cleanup hooks also see an absent server. No failing socket tests were weakened or excluded from this command. Affected files:
  - `apps/engine/src/engine.test.ts`
  - `apps/engine/src/units.test.ts`
  - `apps/engine/src/payments-integration.test.ts`
  - `apps/verifier/src/app.test.ts`
  - `packages/payments/src/verify-client.test.ts`
  - `packages/vision/src/vision.test.ts`
  Rerun unchanged on the unrestricted hub. The full command started before the final additional dashboard integration test; that test passed separately and in the 113-test targeted command.

Journeys proved: place a multi-store fake order; duplicate request creates no new jobs; one passing photo delivers, one expired store withholds and observed refund updates independently; delayed shell pickup links exactly once; mismatched order/store/product/Task references fail; reservations survive concurrency/restart/reset and ambiguous purchase errors; out-of-catalog input causes zero purchases; missing/wrong/query credentials fail; real-mode probe never mutates; disabled real mode and fake provenance cannot appear as real evidence. Actual Express route middleware is tested with in-memory Node HTTP messages, alongside the existing unchanged socket tests.

RED/GREEN: initial targeted test runs failed on missing Orders and OrderStatus modules (compile/import RED); the same targets are GREEN. A first lifecycle run caught an invalid submission fixture and was corrected; auth/cap/transport regressions pass. Checkpoint commits omitted per Helmut's explicit no-git-writes instruction. Coverage percentages were not collected: the repo has no installed Vitest coverage provider; no dependency was added.

## Security review

Read-only `security-reviewer` pass followed `.claude/agents/security-reviewer.md`. Findings fixed: fake orders reaching real payment modes, accidental engine env names in WebDevEnvSchema, and the unverified two-purchase REST path. Re-review: PASS / safe to integrate for the explicitly fake-only purchase scope, with B-15/B-16 open. Real buying must not be enabled from the existing probe alone.

## Orchestrator handoff

Branch `feature/adr20-brand-orders`; changes are uncommitted. Purpose trailer for the eventual commit: `Purpose-impact: ADR-20`. Cross-role changes: A (engine/core/shell), B (credit/client/evidence preflight), D (web/docs). No lockfile/dependency edits. D-36 done with dashboard amendment; B-15 remains todo; B-16 blocked; A-24/D-37 untouched. Peer-review pending lookup failed because gh is unauthenticated; review again on the hub. No live HTTP/phone/escrow evidence captured.
