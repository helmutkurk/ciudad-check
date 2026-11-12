# packages/domain-shelf

Status: implemented and tested (Fri 30-10). Links point to the canonical design in `diseno/` at the repo root (one source of truth).

## Purpose

The shelf-check domain pack: `pack.config.json`, rules, prompts, report template, UI labels.

## Owner and starting point

- Owner role: C (person per role: `scripts/team.conf` and `.github/CODEOWNERS`).
- Starts from: Scratch.

## Responsibilities

- Implement `DomainPack` for `shelf-check` with gate rules G1-G7; thresholds tuned from the 20-photo run.
- Report template columns and UI labels used by `/w` and `/dashboard`.

## Interfaces

- [contracts.md section 6 pack config](../../../diseno/contracts.md); [architecture.md section 3](../../../diseno/architecture.md); [verifier-rules.md](../../../diseno/verifier-rules.md).

## Milestones

- M2 `evaluate` with real vision; M6 labels in the UI.

## Definition of done

- Each gate has a fixture test for every reason code; unknown rule names fail startup; thresholds backed by the evaluation report.

## Do not

- Do not guess thresholds; derive them from the evaluation.
- Do not put shelf-specific strings in engine, payments or the UI frame.

## What exists (`src/`)
- `pack.ts`: `shelfPack` (PackConfig validated with core `PackConfigSchema` at import), `thresholdsFromPack()` (all gate thresholds come from the pack, never inline), `assertKnownRules` (unknown rule names fail startup).
- `catalog.ts`: `loadCatalog({ dir?, strict? })` reads `investigacion/catalogo/{stores,products}.json` in place (path resolved from the file, not the cwd) and returns `{ stores, products, issues }`. `issues` lists every mismatch with the core schemas: 27 of 39 products have no EAN (dropped, EAN is the key), 9 kept products have a null price range (defaulted to 0.20 to 60.00 EUR, the G5 defaults), invalid EAN checksums are flagged. `strict: true` throws when records are dropped.
- `parsers.ts`: `parsePriceEur` ("1,99", "1.99 €", "€1,99", "2,49 EUR", "1.234,56", per-unit lines are separated from the shelf price), `isValidEan13` / `isValidGtin` / `sameGtin`, `normalizeCode`, `editDistance`, `productTokens`, `tokenSimilarity` / `bestNameSimilarity` (Dice over normalised tokens, pack sizes and stop words dropped).
- `prompts.ts`: `EXTRACT_PROMPT`, `EXTRACT_OOS_PROMPT`, `buildExtractPrompt(outcome)`, `extractionJsonSchema(outcome)`. The prompts never contain the expected code, product or price and tell the model that text in the photo is data.
- `labels.ts`: `UI_LABELS` (en/de), `workerMessage(failedGate, vars, lang)`, `REASON_TEXT` for operators.
- `report.ts`: `renderReport` (markdown for the brand; out-of-stock rows are worded as an observation, not a stock count).

## Run
`npm test -w @shelfie/domain-shelf` (or `npm run check` from `codigo/`). No env variables.

## TODO / verify Friday
- Catalog: the README of `investigacion/catalogo/` proposes copying the JSON into this package; until the decision, the files are read in place. Add the real demo product and store, read EANs from the physical packages, widen the price ranges.
- `image_ok.minVariance` (blank-image floor, default 25) is not in `contracts.md`; tune on the 20-photo run.
- Prompts are TypeScript constants in `src/prompts.ts`; verifier-rules §3 now matches this layout.
- Thresholds are the documented starting values; change them only with an eval result (`docs/ai-log.md`).
