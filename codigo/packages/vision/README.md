# packages/vision

Status: implemented and tested (Fri 30-10). Links point to the canonical design in `diseno/` at the repo root (one source of truth).

## Purpose

`VisionClient` interface, provider adapters, JSON repair and schema enforcement for the extraction.

## Owner and starting point

- Owner role: C (person per role: `scripts/team.conf` and `.github/CODEOWNERS`).
- Starts from: Scratch.

## Responsibilities

- One call per image returning the extraction schema; timeout handling.
- Adapters selected by env (`VISION_PROVIDER`, `VISION_MODEL`, `VISION_FALLBACK_*`, ...). Default (Helmut, 2026-10-29): Gemini Flash primary via its OpenAI-compatible endpoint, OpenAI fallback; model ids verify Friday.

## Interfaces

- [verifier-rules.md](../../../diseno/verifier-rules.md) vision contract; [contracts.md section 5.3](../../../diseno/contracts.md).

## Milestones

- M2 real vision on a few photos (Fri 15:00); 20-photo run.

## Definition of done

- JSON repair and schema enforcement tested; timeout tested with a fake HTTP server; one real call per adapter.

## Do not

- Do not send expected values to the model.
- Do not log image bytes or API keys.

## What exists (`src/`)
- `StubVisionClient`: deterministic, fixture driven (by sha256 of the image base64, or a `resolve` function, or a default extraction); no network, no keys. Records `calls`.
- `OpenAiCompatibleVisionClient` plus presets `createGeminiClient` (primary, max_tokens, temperature 0) and `createOpenAiClient` (fallback, max_completion_tokens): plain `fetch` to `<baseUrl>/chat/completions`, image as a data URL, JSON mode, abort timeout (`req.timeoutMs`), one corrective call when the reply is not JSON (`repairAttempts`). Errors become `AppError` `vision_unavailable` with a `details.reason` (`timeout`, `network`, `http_status`, `bad_json`); the API key and response bodies are never echoed or logged.
- `parseModelJson` (fences, prose, trailing commas, smart quotes), `enforceSchema(zodSchema, json)` (also rejects keys the schema would strip and strings over 1000 chars, paths only in messages).
- `VisionChain`: fallback chain (primary, then fallback) with optional schema validation (one corrective retry per client, then next client) and `runCap` (`VISION_RUN_CAP`: cap reached = 503 without an outbound call).
- `createVisionClient(env, logger, { validate, stub, runCap })`: stub when `VERIFIER_MODE=stub`, otherwise `VISION_*` (primary) and `VISION_FALLBACK_*` (fallback). `VISION_PROVIDER` is `gemini` (default), `openai`, or any other name (generic OpenAI-compatible).

## Env names
`VERIFIER_MODE`, `VISION_PROVIDER`, `VISION_MODEL`, `VISION_BASE_URL`, `VISION_API_KEY`, `VISION_FALLBACK_BASE_URL`, `VISION_FALLBACK_MODEL`, `VISION_FALLBACK_API_KEY`, `VISION_TIMEOUT_MS`, `VISION_MAX_TOKENS` (core `VerifierEnvSchema`); `VISION_RUN_CAP` (core `VerifierEnvSchema`, passed by verifier boot).

## Run
`npm test -w @shelfie/vision`. Tests use a fake HTTP server (`node:http`) for timeout, bad JSON, repair, schema violation, HTTP errors and fallback.

## TODO / verify Friday
- One real call per adapter (not done; needs keys). Exact model ids and base URLs come from env: nothing is hard-coded.
- Which models accept `response_format: json_object` with images, `temperature`, and `max_tokens` vs `max_completion_tokens` (`jsonMode`, `temperature`, `tokenParam` are config knobs).
- Whether the shell model (ZAI) supports images: unknown.
