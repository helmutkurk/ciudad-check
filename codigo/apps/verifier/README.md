# apps/verifier

Status: implemented; historical real paid x402 and vision runs are recorded in `codigo/docs/verified.md` and evidence. Current operation: [STATE](../../../docs/STATE.md); hosted verifier deliberately offline.

## Purpose

Sells `POST /v1/verify` behind x402; runs vision extraction and the deterministic gates G1-G7; keeps an idempotency cache.

## Owner and starting point

- Owner role: B for the x402 wrapper, idempotency cache and routes; C for `evaluate` and below (two owners by function, meeting at `evaluate(task, image) -> VerifyResponse`) (person per role: `scripts/team.conf` and `.github/CODEOWNERS`).
- Starts from: `cardano-foundation` x402-express template (`seller.ts` becomes our server).

## Responsibilities

- B: x402 seller middleware, pre-payment validation, idempotency by `Idempotency-Key`, health and price routes.
- C: `evaluate`, gates, vision call via `packages/vision`, dry endpoint for evaluation.

## Interfaces

- [contracts.md section 3 Verifier service](../../../diseno/contracts.md), section 5.3 env names.
- [verifier-rules.md](../../../diseno/verifier-rules.md) gates, vision contract, 20-photo evaluation.

## Milestones

- M1 x402 paid request (Fri 11:30); M2 verify route price 1 tADA (Fri 15:00).

## Definition of done

- M1: buyer prints a receipt with a tx hash showing the transfer to `W-SELL` for the route price.
- M2: same `Idempotency-Key` twice makes one model call; wrong-code photo gives FAIL.
- `ENABLE_DRY=false` in evidence runs.

## Do not

- Do not expose the verifier through the public tunnel (only the engine).
- Do not let the model see expected values.
- Do not commit vision keys or `.env`.

## What exists (`src/`)
- B part: `app.ts` (Express 4: `GET /health`, `GET /v1/price`, `POST /v1/verify`, and, only with `ENABLE_DRY=true` and `X-Admin-Token`, `POST /v1/verify-dry` and `POST /v1/extract`), `payment.ts` (x402 seller middleware, route key `POST /v1/verify`, 1 tADA from `VERIFY_PRICE_LOVELACE`, `payTo` = `SELLER_ADDRESS`, network `cardano:preprod`), `idempotency.ts` (same `Idempotency-Key` -> cached verdict, concurrent calls share one model call, errors are not cached, optional file at `IDEMPOTENCY_CACHE_PATH`, TTL `IDEMPOTENCY_TTL_SEC`), `boot.ts` / `main.ts`.
- Validation runs before the payment middleware, so a malformed request is never charged: body schema (extra keys rejected), `packId`, `Idempotency-Key == verify:<submissionId>`, base64, size (413 `image_too_large`), sha256 matches the bytes, decodable (422 `image_not_decodable`), optional `X-Engine-Token` (`X_ENGINE_TOKEN_REQUIRED`). A handler answer of 4xx/5xx makes `@x402/express` cancel settlement (confirmed in its source).
- C part: `evaluate.ts` (`createEvaluator({ vision, images, thresholds }) -> { evaluate(task, image, ctx), extractOnly }`), `gates.ts` (G1-G7 and O3-O5 as pure functions, every reason code from core), `image.ts` (sharp: decode, size, variance, 8x8 average hash, re-encode <= 1600 px without EXIF for the vision call). All gates of the set are reported; G1 failing skips the vision call; the model never sees the expected code, product or price; our price parse wins over the model value; the sha256 used for G7 is computed here.
- `stub-reader.ts`: `VERIFIER_MODE=stub` perfect reader (not a model, reads the task's expected values, so never evidence). Scenario markers for smoke/cheat tests: append `SHELFIE-STUB:<scenario>` after the image data (`wrong_code`, `no_code`, `wrong_product`, `unreadable_price`, `absurd_price`, `product_present`, `no_label`, `other_label`, `slot_not_empty`).

## Run
```
cd codigo
VERIFIER_PAYMENT=off VERIFIER_MODE=stub npm run dev -w @shelfie/verifier   # no keys, no wallet; binds 127.0.0.1:4021
npm test -w @shelfie/verifier
```
Real x402: `VERIFIER_PAYMENT=on` (default), `SELLER_ADDRESS`, `FACILITATOR_URL`, `VERIFY_PRICE_LOVELACE`; live vision: `VERIFIER_MODE=live` plus `VISION_*`. `VERIFIER_PAYMENT=off` is refused when `NODE_ENV=production` and implies `ENABLE_DRY=true` unless set. Env names: `VERIFIER_PORT`, `VERIFIER_PAYMENT`, `VERIFIER_MODE`, `SELLER_ADDRESS`, `FACILITATOR_URL`, `VERIFY_PRICE_LOVELACE`, `VISION_*`, `VISION_RUN_CAP`, `ENABLE_DRY`, `IDEMPOTENCY_CACHE_PATH`, `IDEMPOTENCY_TTL_SEC`, `X_ENGINE_TOKEN_REQUIRED`, `ENGINE_TOKEN`, `ADMIN_TOKEN`, `LOG_LEVEL`.

## Tests
Every reason code has a fixture test (`gates.test.ts` proves coverage against core's list); both gate sets in `evaluate.test.ts`; idempotency, payment-off route, validation-before-payment, the real `@x402/express` 402 response against a fake facilitator, dry/extract auth, and the stub reader end to end in `app.test.ts`; injection fixtures in `injection.sec.test.ts`.

## Build-era open questions (reconcile with verified.md before reuse)
- A paid request against the hosted facilitator (M1): 1 tADA accepted? `PAYMENT-RESPONSE` header carries `transaction`? Package names match the runbook: `@x402/express` 2.26.0 exports `paymentMiddleware` and `x402ResourceServer`; `HTTPFacilitatorClient` comes from `@x402/core/server`, `ExactCardanoScheme` from `@x402/cardano/exact/server`.
- `/v1/price` returns `payTo: "none"` when `SELLER_ADDRESS` is unset (dev).
- Near-duplicate detection (`near_duplicate_image`) only knows photos this process has seen (the request carries only sha256 of previous photos); lost on restart.
- `X-Engine-Token` is optional here (`X_ENGINE_TOKEN_REQUIRED`); the payments rule says required outside dev: set it in the hub `.env`.
