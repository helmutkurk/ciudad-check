---
name: verifier-gates
description: Use when implementing evaluate(), price or out-of-stock gates, vision adapters, or photo-evaluation threshold tuning for role C.
---
# Verifier gates (role C)

## When to use

Use for evaluate(), deterministic gate logic, vision extraction, fixtures, labels, or eval/replay work.

## Read first

- [Verifier rules](../../../diseno/verifier-rules.md), [verifier README](../../../codigo/apps/verifier/README.md)
- [Vision README](../../../codigo/packages/vision/README.md), [domain-shelf README](../../../codigo/packages/domain-shelf/README.md), [eval README](../../../codigo/eval/README.md)
- [Verifier rule](../../rules/verifier.md) and [REWE draft labels](../../../codigo/eval/labels.rewe-2026-10-30.draft.json)

## Commands and tests to run

From codigo/:

    npx vitest run apps/verifier/src/gates.test.ts apps/verifier/src/evaluate.test.ts packages/vision/src/vision.test.ts eval/src/eval.test.ts
    npm run eval -w @shelfie/eval -- --mode stub
    npm run eval -w @shelfie/eval -- --mode replay --replay results/<file>.json
    npm run check

Live evaluation command and flags are documented in codigo/eval/README.md; use the photo labels and keep private photos out of Git.

## Contracts and invariants

- Price photos use G1 image_ok, G2 code_match, G3 readable, G4 product_match, G5 price_sanity, G6 timing, G7 not_duplicate.
- Out-of-stock uses shared G1/G2/G6/G7 plus O3 label_visible, O4 label_match, and O5 slot_empty. Read verifier-rules for exact pass conditions and reason codes.
- evaluate() is deterministic: every gate reports; pass requires all gates. The model extracts only; it never receives expected code, product, or price.
- Gemini is the configured primary, OpenAI the fallback, and stub is for deterministic tests only. Model ids, endpoints, and options remain verify-Friday items.
- The ten-photo REWE draft contains intentional blurry negatives and no challenge codes; it supports G3–G5 tuning only, not complete gate acceptance.
- Change thresholds only after replay/evaluation; record the evidence and result in docs/ai-log.md. Stub and dry output are never milestone evidence.

## Verify Friday

- Make one authorised real call per provider; confirm model ids, base URLs, image/JSON support, token parameter, latency, and cost.
- Review the REWE draft, then complete the 20 price and 8 out-of-stock photo set with challenge codes. Tune thresholds from replay, including false-pass counts.

## Do not

- Do not replace pure gates with model judgment, weighted scores, or a pass default.
- Do not send expected values to the model, interpolate extraction text into prompts or commands, or enable override in evaluation/evidence runs.
- Do not treat the REWE draft or stub/replay output as full milestone evidence.
