---
paths:
  - "codigo/**/*.ts"
  - "codigo/**/*.tsx"
  - "codigo/tsconfig*.json"
---
# TypeScript

- Strict: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. ESM, Node 24. The shell app stays JavaScript (starter); everything else is TypeScript.
- Validate every boundary with zod: HTTP input, env, model output, file-store load. No unvalidated JSON.
- Errors: one `AppError(code, message, status, details)` from `packages/core`; error codes live in `packages/core` only.
- No `any` (lint error; escape comment with a reason). No floating promises.
- Inject clock and id generator; do not call `Date.now()` or `crypto.randomUUID()` in domain code.
- Money is an integer in lovelace (see payments-and-wallets rule). Never use floating point for amounts.
- Shared types and schemas come from `packages/core`; do not redefine them. A change there is mirrored in `diseno/contracts.md` in the same commit.
- Pinned dependencies only (exact versions, no `^`). New dependency: one-line reason in the commit message.
- Log structured JSON lines with `jobId`, `taskId`, `submissionId`; never secrets or image bytes.
- Run `npm run check` in `codigo/` before every push.
