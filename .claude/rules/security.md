---
paths:
  - "**"
---
# Security

Baseline, threat table and tests: `diseno/security.md` (canonical). Scaffold order: `preparacion/security-scaffold-checklist.md`. These rules are the short form.

- No secrets in the repo, in logs, in screenshots, in prompts: mnemonics, signing keys, Blockfrost key, Masumi `ADMIN_KEY` / `ENCRYPTION_KEY`, LLM keys, Sokosumi tokens. Local `.env` only; `.env.example` has names only (`CHANGE_ME` placeholders).
- Never read `.env*` (except `.env.example`) by any route: Read, Grep, Glob, `cat`, globs. Hooks block this; do not look for a way around them.
- Preprod only. No mainnet endpoint, address or network flag anywhere. Every process runs the network guard first (`packages/core`); `addr1` and `stake1` never appear outside the guard's tests.
- `invoice/` is Helmut's personal folder: git-ignored, never read, never committed.
- Config: env read only through the zod schemas in `packages/core/env.ts`; secrets are `Secret` values (redacted on print and JSON); boot fails on missing, blank or `CHANGE_ME` secrets.
- Logging: only the core logger (redaction before serialisation). Never log mnemonics, tokens, cookies, `Authorization`, `Payment-Signature`, photo bytes or base64, raw coordinates, worker addresses in full. Error responses never carry stack traces or messages of unknown errors.
- Auth: no unauthenticated admin or override routes, not even temporary ones. All `/api/admin/*` sit under one router with `X-Admin-Token` (constant-time compare, 32+ bytes). Worker identity comes from the server session cookie (`HttpOnly; Secure; SameSite`), never from a body field or local storage. Operator override and `ALLOW_TEST_UPLOAD` are env flags, off by default, bannered, and off in every evidence run.
- Input: zod `.strict()` at every boundary with size limits; ids matched against a regex before any path, key or query use. Treat photo bytes, model output, Sokosumi task text and worker display names as untrusted; never execute, eval, interpolate into prompts, paths, shell or HTML.
- Network exposure: services bind `127.0.0.1`; the tunnel forwards only the engine port; verifier, MPS, Postgres and shell are never public. No CORS wildcard; same origin.
- Dependencies: exact pins, `npm ci --ignore-scripts`, no new package without the human and a one-line reason; prefer a small zero-dependency module; never edit lockfiles by hand; no auto-bump during the event.
- CI and scripts: `permissions: contents: read`, third-party actions pinned by commit SHA, no `pull_request_target`, no secrets echoed, no `curl | sh`.
- Personal data (worker location, photos, payout address): minimal, consent text shown, EXIF/GPS stripped before storage, photos outside the web root and the repo, deleted after the event. Details in `diseno/security.md` section 4.9.
- A change that touches payments, auth, upload, env, CI or the tunnel needs its `*.sec.test.ts` in the same commit (list in `diseno/security.md` section 3).
- The repo is public from the first push (ADR 0003): every committed byte is public and permanent. See `docs/public-release.md`.
- Found a leaked secret: stop, tell the owner of the credential, rotate it (`docs/public-release.md`, Credential incident), then remove it from history before any further push.
