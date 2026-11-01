# Security scaffold checklist (Friday 2026-10-30, 09:00)

Goal: the boilerplate is secure from the first commit. Ordered; each item has an owner role and a verify step that prints proof. Threat model and test names: [../diseno/security.md](../diseno/security.md) (T-ids in brackets, for example P1, E1). Do items 1-12 before any feature code lands in the same package. Commit them in small PRs with `chore(security): ...`; `security-reviewer` runs before each push.

Dependency rule (AGENTS.md): only the pinned stack (`@x402/*` 2.26.0, `@evolution-sdk/evolution` 0.5.14, `express` 4.x, zod, typescript, tsx, vitest, eslint, prettier, React/Vite for web). **No new dependency is needed for this checklist.** Everything below is zero-dependency (Node built-ins: `node:crypto`, `node:fs`, `node:http`) unless marked "dep?". Any "dep?" needs the human's OK and a one-line reason in the PR.

## Phase 1: repository and core (first 90 minutes)

| # | Role | Item | Verify |
|---|---|---|---|
| 1 | A | Root files: confirm `.gitignore` covers `.env`, `.env.*` (except `*.example`), `*.pem`, `*.skey`, `*.jsonl`, `evidence/`, `codigo/**/data/`; add `codigo/.npmrc` with `ignore-scripts=true`, `audit-level=high`, `save-exact=true`; `codigo/package.json` `engines.node` `>=24 <25`. One `.env.example` per component (names only, `CHANGE_ME` placeholders; names from `contracts.md` section 5; add `PAYOUT_DAILY_CAP_LOVELACE`, `VERIFY_RUN_CAP_LOVELACE`, `VISION_RUN_CAP`, `CORS_ORIGINS`, `EVIDENCE_DIR`, `SESSION_SECRET`). [C3, C1] | `git check-ignore -v codigo/.env codigo/apps/engine/.env .env.local` prints a rule for each; `git ls-files \| grep -E '\.env($\|\.)' ` shows only `.env.example` files; `npm ci` works with `ignore-scripts`, else record the exception in `codigo/docs/verified.md`. |
| 2 | A | `packages/core/env.ts`: zod schemas `engineEnv`, `verifierEnv`, `shellEnv`; `Secret` wrapper (`toString`, `toJSON`, `util.inspect.custom` return `[redacted]`, `.reveal()`); whitespace-only = missing; `CHANGE_ME` rejected for secrets; `ADMIN_TOKEN`, `SHELL_TOKEN`, `ENGINE_TOKEN`, `SESSION_SECRET` >= 32 chars and pairwise different. Failure prints variable names only and exits 1. | Test `env.test`: empty, spaces, `CHANGE_ME`, short token, duplicate tokens each fail; `console.log(JSON.stringify(cfg))` shows `[redacted]`. |
| 3 | A | `packages/core/network-guard.ts`: called first in every `main()`; rules in security.md 4.10 [P9]. | `network-guard.test` with `NETWORK=mainnet`, `addr1...` seller, `mainnet...` Blockfrost id, bad facilitator host: exit code 1, no value in output. |
| 4 | A | `packages/core/logger.ts`: JSON lines, redaction by key and by value pattern before serialisation, no bodies/queries/IPs, request id [P8]. | `logger.sec.test`: sentinel mnemonic (24 words), `sk-` key, `preprod`+32 chars, base64 of 300 chars, `lat`/`lon`, `X-Admin-Token` header: none appears in captured output; error objects with nested secrets covered. |
| 5 | A | `AppError(code,message,status,details)` + one Express error handler + 404 handler (JSON shape of `contracts.md` section 0); unknown errors = 500 `internal` with request id; zod issues reduced to path+code [E8]. | `errors.sec.test`: `throw new Error('sentinel')` returns body without `sentinel` or `at ` stack lines. |
| 6 | A | `securityHeaders.ts` (replaces helmet, exact values in security.md 4.4); `app.disable('x-powered-by')`; `Cache-Control: no-store` on `/api` [U7]. | `curl -sI http://127.0.0.1:4000/api/health` lists CSP, nosniff, Referrer-Policy, Permissions-Policy, COOP and no `X-Powered-By`; `headers.sec.test` asserts the set on `/`, `/w`, `/api/health`. |
| 7 | A | Server hardening: `listen(port,'127.0.0.1')`; `Host` allowlist (`PUBLIC_BASE_URL` host, `localhost`, `127.0.0.1`); `express.json({limit:'16kb',strict:true})` default, `/submissions` limit from `MAX_IMAGE_BYTES`; `requestTimeout` 30 s, `headersTimeout` 10 s; `trust proxy` loopback only [E7, H1]. | `limits.sec.test` (3 MB body = 413; wrong Host = 421/404); `ss -ltnp \| grep 4000` shows `127.0.0.1:4000`. |
| 8 | A | `rateLimit.ts`: in-memory token bucket per IP and per session; limits in security.md 4.4; `Retry-After`; failed-auth lockout [E7, E11]. | 31st request in a minute = 429 in test; lock after 20 bad admin tokens. |
| 9 | A | Origin policy: no CORS headers; state-changing routes require `Origin` = `PUBLIC_BASE_URL` (or token auth for non-browser callers); optional `CORS_ORIGINS` exact allowlist, never `*` [E9]. | `cors.sec.test`: foreign Origin POST = 403, preflight has no `Access-Control-Allow-*`. |
| 10 | A | `auth.ts`: `adminAuth` (header `X-Admin-Token`, `timingSafeEqual` on SHA-256 digests), `shellAuth`, `engineAuth`; all `/api/admin/*` mounted under one router with `adminAuth` applied once at the router [E1, E11]. | `admin.sec.test` enumerates the router stack and asserts 401 for every admin path with no/wrong token. |
| 11 | A | Session skeleton: `POST /api/auth/nonce`, `POST /api/auth/verify` (S1 stub returns 501 until verify-Friday item is resolved), `POST /api/auth/address` (S0: validate preprod address, issue session); cookie `__Host-sid; HttpOnly; Secure; SameSite=Lax; Path=/`; server-side store; `workerId` from session only [A1-A3, E5]. | `session.sec.test`: `Set-Cookie` flags; body `workerId` ignored; unauthenticated claim = 401. |
| 12 | A+B | `idempotency.ts` in core: unique key, in-flight dedupe, durable before side effect [P1, P7]. | 50 concurrent `run(key, fn)` call `fn` once; restart (reload from log) keeps the key. |

## Phase 2: component skeletons (before M1 code)

| # | Role | Item | Verify |
|---|---|---|---|
| 13 | B | `packages/payments`: constants `MAX_PAYOUT_LOVELACE`, `VERIFY_MAX_PRICE_LOVELACE` cap read from env but bounded in code; payee check = `SELLER_ADDRESS`; per-run and daily caps; serial queue per wallet; `FakePayoutAdapter` with fault injection (timeout after send, crash after write-ahead, duplicate hash); only this package reads `*_MNEMONIC_*` [P1, P4, P5, P8]. | `payout.sec.test` and `verify-client.sec.test` from security.md pass; `grep -R "MNEMONIC" codigo --include=*.ts -l` lists only `payments`, `core/env.ts` and tests. |
| 14 | B | `apps/verifier` skeleton: x402 middleware before the handler; `ENABLE_DRY=false` default and refused when `NODE_ENV=production`; `X_ENGINE_TOKEN_REQUIRED=true`; listen on `127.0.0.1:4021`; admin routes need `X-Admin-Token`; idempotency cache [P6, P7, V8]. | `verifier.sec.test`: unpaid POST = 402 and the vision spy is not called; dry route 404; missing engine token 401. |
| 15 | A (+C) | Upload pipeline per security.md 4.3: sniff, SOF dimensions, cap, metadata strip, hash, exclusive write to `EVIDENCE_DIR`, mode 600. Zero-dependency JPEG segment walker. **dep? C decides** whether G1 decoding needs `sharp` (one dep; reason: decode for G1 and re-encode; check it installs with `ignore-scripts`; otherwise `jpeg-js`). [U1-U3] | `upload.sec.test`: GPS-EXIF fixture stored without `Exif`/GPS; PNG-as-jpeg, truncated, 30000x30000 header, bad base64, traversal ids all rejected with nothing written (`find $EVIDENCE_DIR -newer ...` empty). |
| 16 | C | Vision/gates safety: model reply zod `.strict()` with bounded strings; expected code/price/product never in the prompt (unit test builds the prompt from a task with sentinel values and asserts absence); gate set pure; injection fixtures [V1, V2, V3]. | `injection.sec.test` and `vision.sec.test` pass: extra keys, "pass=true" text, 50 kB string, HTML in fields. |
| 17 | all | Security fixtures in `packages/core/testing/`: `SENTINEL_MNEMONIC`, `SENTINEL_TOKEN`, `makeJpegWithExif()`, `makeBadJpegs()`, `captureLogs()`, `fakeClock`, `routerRoutes(app)`, `fakeWalletSigner` for CIP-30 tests. Tests named `*.sec.test.ts` so `npm run check` runs them. | `npm run check` lists the `.sec.test` files and they pass in under 60 s. |
| 18 | D | Web scaffold: no secrets in bundle (`scripts/check-bundle.sh` greps `dist/` for `MNEMONIC`, `ADMIN`, `API_KEY`, `preprod[A-Za-z0-9]{32}`); no token in `localStorage` (only non-secret UI state); consent screen stub with version `consent-v1`, claim disabled until accepted; no `dangerouslySetInnerHTML` lint rule; display name length/charset; `scripts/hub-check.sh` (listening sockets, public probe notes) [U5, U6, E10, H1]. | `bash scripts/check-bundle.sh` exits 0 after `npm run build`; planting `ADMIN_TOKEN` in a test bundle makes it fail; `hub-check.sh` fails when a test listener binds `0.0.0.0:4021`. |
| 19 | B | `scripts/evidence-preflight.ts` (flags in security.md section 5) and `scripts/purge-evidence.ts` (deletes `EVIDENCE_DIR/*.jpg` and worker store entries after confirmation; never touches `docs/evidence/` text) [P6, GDPR]. | Preflight fails with `FAKE_PAYMENTS=1`; purge leaves ledger intact. |

## Phase 3: repository and CI (Helmut, D, after the first CI run)

| # | Role | Item | Verify |
|---|---|---|---|
| 20 | D (Helmut) | GitHub settings (`docs/public-release.md`): the team-controlled GitHub settings (ADR-0008) (ADR-0006: `main` requires a PR with 3 approvals and checks `check`, `secret-scan`, `security`, `context-gate`; `dev` takes direct pushes; no force push or deletion on either); Settings > Code security: Dependabot **alerts on**, Dependabot version updates **off** (no `.github/dependabot.yml`), Dependabot security PRs off; secret scanning and push protection are **not available** for a private repo on Pro (gitleaks CI is the control). [C3, C5, C6] | `gh api repos/helmutkurk/shelfie/branches/main/protection --jq '.required_status_checks.contexts, .required_pull_request_reviews.required_approving_review_count'` prints the four checks and `3`; `dev` protection shows `allow_force_pushes.enabled` false; `ls .github/dependabot.yml` fails; a direct push to `main` and any force push are refused. |
| 21 | A+D | CI: `.github/workflows/security.yml` green (gitleaks, `npm audit --audit-level=high` once `codigo/package.json` exists); `codigo/docs/audit-known.md` lists starter findings (id, package, reason, expiry); `scripts/check-lockfile.sh` prints new packages, non-npm registries, git URLs and install scripts for the PR [C1, C2, C4]. Pin: replace the `uses:` SHAs only after checking the release tag (comment shows the tag). | Open a throwaway branch with a fake token in a file: `security` job red; delete branch. `npm audit --audit-level=high` exit 0 or only listed ids. |
| 22 | Helmut | Hub and recording hygiene before M4 and before the final recording: MPS seed output off screen, `ADMIN_KEY` never typed on stream, `.env` closed, `ss -ltnp` check, tunnel points only at `127.0.0.1:4000`, `/api/admin/*` via the tunnel host returns 404, `ENABLE_DRY=false`, override off, consent text shown. [H1, H3, H4] | `bash scripts/hub-check.sh`; `curl -s -o /dev/null -w '%{http_code}' https://<tunnel-host>/api/admin/reset` prints 404 or 401; recording reviewed before upload. |

## Order notes

- Items 2-5 first: every later module imports env, logger and `AppError`.
- Item 11 depends on item 10 (token middleware); item 15 depends on 5 and 7 (limits and errors).
- Do not merge feature code touching claim, payout or upload before the matching `.sec.test` exists (security-reviewer checks).
- Anything not listed here that needs a new package: stop and ask (AGENTS.md). Likely candidates, none adopted: a COSE/CIP-8 verifier (check the pinned SDK first, verify Friday), `sharp` (item 15), `sfw` Socket Firewall wrapper (optional, via `npx`, needs human OK).

## Zero-dependency replacements used (instead of packages)

| Instead of | Own code | Where |
|---|---|---|
| `helmet` | `securityHeaders.ts` (about 25 lines) | item 6 |
| `express-rate-limit` | `rateLimit.ts` (token bucket, about 60 lines) | item 8 |
| `cors` | none needed (same origin) + exact Origin check | item 9 |
| `pino` redact | `logger.ts` with key and pattern redaction | item 4 |
| `cookie-parser`, `express-session` | `Set-Cookie` and session map in `auth.ts` | item 11 |
| `multer`, `sharp` (for stripping) | base64 JSON + JPEG segment walker | item 15 |
| `dotenv-safe`, `envalid` | zod schema in `core/env.ts` | item 2 |
