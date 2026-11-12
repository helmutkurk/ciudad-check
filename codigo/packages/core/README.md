# packages/core (@shelfie/core)

Status: implemented (zod 4.6.7 is the only runtime dependency). Links point to the canonical design in `diseno/`; the schemas must match `contracts.md` and `domain-model.md` (change the doc first, then the schema, in the same commit).

## Purpose
Shared contract: ids, clock, error codes (`AppError`), state machine tables, entity types and zod schemas, request/response schemas for every engine and verifier endpoint, env loaders, redacting logger, and the ports (interfaces) the components meet at.

## Owner and starting point
- Owner role: A (person per role: `scripts/team.conf` and `.github/CODEOWNERS`).
- Consumers import from `@shelfie/core` (workspace link, source consumed directly via `exports`, no build step).

## Module map (`src/`)
- `clock.ts`: `Clock`, `systemClock`, `FakeClock`, `addSeconds`.
- `ids.ts`: branded id schemas/types (`job_`, `tsk_`, `clm_`, `sub_`, `vrd_`, `pay_`, `stl_`, `wrk_`), `IdGenerator`, `randomIdGenerator`, `SequentialIdGenerator` (`job_01`, `job_02`...), `newJobId` etc., `makeChallengeCode`, `normalizeChallengeCode`, `CHALLENGE_ALPHABET`.
- `errors.ts`: `ERROR_STATUS` (code -> HTTP status), `ErrorCode`, `AppError(code, message, status?, details?)`, `ErrorBodySchema`, `toAppError`, `parseOrThrow`.
- `common.ts`: timestamp, lovelace (integer string), sha256, outcome, location and address schemas.
- `catalog.ts`: store/product catalog schemas, `/api/catalog` response, intake reason codes.
- `states.ts`: state enums, `MACHINES` tables for job, task, claim, submission, payout, settlement; `transition(entity, from, event, ctx?)` throws `AppError` `invalid_transition` (409); `canTransition`, `isTerminal`. Payout `UNKNOWN -> QUEUED` needs `{ reconcileProvedAbsent: true }`.
- `verify.ts`: gates (price photo G1-G7, out-of-stock O3-O5), reason codes, vision extraction schemas, `VerifyRequest`/`VerifyResponse`, idempotency key helpers.
- `entities.ts`: Job, Task, Claim, ChallengeCode, Submission, Verdict, Payout, Settlement, LedgerEvent.
- `api.ts`: request/response/query schemas for contracts section 1 plus SSE feed events (`task_opened`, `task_closed`, `ping`).
- `pack.ts`: `PackConfigSchema` (contracts section 6).
- `env.ts`: `loadEnv(schema, process.env)` plus `SharedEnvSchema`, `EngineEnvSchema`, `VerifierEnvSchema`, `ShellBridgeEnvSchema`, `WebEnvSchema`, `WebDevEnvSchema`, `HubEnvSchema`, `FundCheckEnvSchema`, `SmokeEnvSchema`. Fails fast, preprod only, names (never values) in errors, blank values count as unset, dev token defaults outside production.
- `logger.ts`: `createLogger` (JSON lines), `redact`, `collectSecretValues`.
- `ports.ts`: `VerifierGate`/`EvaluateFn` (the B and C seam), `VisionClient`, `PayoutAdapter`, `PayoutQueue`, `VerifyClient`.

Browser consumers use `@shelfie/core/browser` (schemas, errors, ids, clock, public env parser; no Node built-ins/server env names). Server imports remain `@shelfie/core`. `load-env.ts` and `web-env.ts` are shared without exposing the server env schema. Id randomness uses Web Crypto on Node 24 and in browsers.

## Tests
`npm test` from `codigo/` (files `src/*.test.ts`): legal and illegal transitions, the payout guard, schema round-trips, env loader, logger redaction, id and clock determinism.

## Open points (verify Friday)
- Extra error codes not in contracts.md: `forbidden`, `payment_required` (verifier 402), `invalid_transition`.
- Optional fields added to the verify request for G5/G6: `product.priceMinEur/priceMaxEur/referencePriceEur`, `task.claimExpiresAt`.
- Response shapes not fixed in contracts: `GET /api/jobs/{id}`, release claim, `GET /api/config`, ledger kinds list.
- Env defaults without a source in contracts.md: `MIN_WALLET_LOVELACE`, `VISION_TIMEOUT_MS`, `VISION_MAX_TOKENS`, `EXPLORER_ADDRESS_BASE`.
- Missing `location` on submit fails zod; the engine maps it to 403 `location_required`.

## Do not
- Do not change a type without notifying consumers; mirror changes in `contracts.md` the same commit.
- Do not add runtime dependencies for convenience.
