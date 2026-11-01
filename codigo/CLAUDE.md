# CLAUDE.md (codigo/)

Code-specific notes. Complements the root `AGENTS.md`, which holds the shared rules; this file does not repeat them. Current operation is in `../docs/STATE.md`; the backend is deliberately offline.

## Read first
- From the repo root: `diseno/contracts.md`, then `diseno/repo-layout.md`.
- Your package's `README.md`: purpose, interfaces, milestone, definition of done, do-not list.

## Package ownership
- One owner per folder (repo-layout section 2). Owner = who knows the area. Others may edit it (ADR-0006); the owner's agent sees the change in peer review.
- `apps/verifier` has two owners by function: B up to the call of `evaluate(...)`, C from `evaluate` down.
- Roles: A Isabel, B Fernando, C Lorenz, D Helmut.

## Contracts-first rule
- Change `contracts.md` first, then the zod schema in `packages/core`, in the same commit.
- Changes to `packages/core` are announced in chat; the consumer owner's agent checks it in peer review.
- Current routes: `/b` brand, `/dashboard` operator, `/w` worker; see `diseno/webapps.md` for their contracts.

## Where types live
- All shared types, zod schemas, ids, state tables and error codes: `packages/core`. Do not redefine them in apps.
- Shelf-specific logic and strings: `packages/domain-shelf`. Engine, payments and UI frame never mention shelves.
- Validate with zod at every boundary (HTTP, env, model output, file loads). Errors use `AppError(code, message, status, details)`.

## Check command
- `mise exec node@24 -- npm run check` (typecheck + lint + test) from `codigo/` before publication. Follow ADR-0008 and the user's authorization.
- Run against fakes first: `FAKE_PAYMENTS=1`, `VERIFIER_PAYMENT=off`, `VERIFIER_MODE=stub`.

## Pinned dependencies
- Node 24; TypeScript strict, ESM. Exact versions from the x402 template (`@x402/*` 2.26.0, `@evolution-sdk/evolution` 0.5.14, `express` 4.x). Keep pins unchanged unless an upgrade is explicitly authorized.
- Each new dependency needs a one-line reason in the commit message.

## Safety
- Never write mnemonics, keys, tokens or `.env` content into files, logs or screenshots; `.env.example` has names only.
- Never log image bytes. Never reset the evidence ledger file.
- Payout rule: no move from `UNKNOWN` to `QUEUED` without a reconcile proving no transfer exists.
- Mark unconfirmed facts unverified and record confirmed answers in `codigo/docs/verified.md`.
