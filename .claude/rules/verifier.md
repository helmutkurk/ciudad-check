---
paths:
  - "codigo/apps/verifier/**"
  - "codigo/packages/domain-shelf/**"
  - "codigo/packages/vision/**"
  - "codigo/eval/**"
  - "diseno/verifier-rules.md"
---
# Verifier

- The verifier is a **deterministic gate around a probabilistic extractor**. The vision model only reads; plain code decides. Spec: `diseno/verifier-rules.md`.
- Gates G1-G7 (image_ok, code_match, readable, product_match, price_sanity, timing, not_duplicate) are pure functions of their inputs. `pass = all gates pass`. No weighted score decides the verdict.
- All gates are evaluated and reported (no short circuit after the vision call). G1 failing skips the vision call.
- One function `evaluate(task, image, extraction)`; the vision call is injected so gates are unit-testable with fixture JSON.
- **No override in evidence runs.** An operator override may exist for the stage demo but is off by default, visibly bannered, and any run with it on is never used as evidence or in the 20-photo evaluation.
- Do not send the expected code or expected price to the model.
- G6 uses the engine's receive time, never EXIF or a client clock.
- Thresholds live in pack config, not inline. Changing a threshold needs a line in `docs/ai-log.md` with the eval result that justified it.
- Every reason code in the spec has a unit test with a fixture extraction.
- Same input with the same idempotency key returns the cached verdict and makes one model call.
- Security baseline (`diseno/security.md` section 3.3): model output is untrusted: zod `.strict()` with bounded strings, extra keys rejected, text never interpolated into prompts, paths, HTML or shell; injection fixtures (`injection.sec.test`) must stay green; the vision request carries only cleaned image bytes (no EXIF).
