# Verifier evaluation

> Partial live run: 6 Red Bull photos from one EDEKA shelf, none with a challenge code (all must fail G2), 2 near-duplicates. Checks extraction (price 6/6 exact, product read) and G7, not the 28-photo C-09 acceptance. Labels: `codigo/eval/labels.redbull-2026-10-30.json`; photos are git-ignored. Branch `feature/c-live-vision`.

- Mode: live; provider: gemini; models: gemini/gemini-3.5-flash-lite
- Started 2026-10-30T14:55:02.861Z, finished 2026-10-30T14:55:54.798Z
- Labels: labels.redbull-2026-10-30.json; entries 6 (ran 6, missing photo 0, errors 0)
- Cost per check: not recorded
- Note: first-live gemini-3.5-flash-lite, duplicateOf fixed

## Decision confusion (expected vs actual pass)

| | actual PASS | actual FAIL |
|---|---|---|
| expected PASS | 0 | 0 (false reject) |
| expected FAIL | 0 (false accept) | 6 |

Entries matching their label completely (decision, gates, reason codes): 6 of 6.

## Acceptance (verifier-rules.md section 7)

| Metric | Result | Target | Status |
|---|---|---|---|
| False accepts on should-fail price photos | 0 of 6 | 0 (blocking for payments) | ok |
| False accepts on should-fail out-of-stock photos | 0 of 0 | 0 (blocking for payments) | n/a |
| False rejects on valid price photos | 0 of 0 | at most 1 of 8 | n/a |
| Price value exact on valid photos | 0 of 0 | at least 7 of 8 | n/a |
| Code read exact on valid photos | 0 of 0 | at least 7 of 8 | n/a |
| Valid out-of-stock photos accepted | 0 of 0 | at least 2 of 3 | n/a |
| Product-present photos accepted as out-of-stock | 0 of 0 | 0 (blocking for payments) | n/a |
| Latency p95 (model call) | 13199 ms | under 8000 ms | MISSED |

## Per case

| Case | Photos | Decision correct | Fully matched |
|---|---|---|---|
| duplicate | 2 | 2 | 2 |
| no_code | 4 | 4 | 4 |

## Reasons seen

| Reason code | Count |
|---|---|
| code_missing | 6 |
| low_confidence | 2 |
| near_duplicate_image | 2 |

Failed gates: code_match 6, readable 2, not_duplicate 2

## Latency (model call)

mean 8530 ms, p95 13199 ms, max 13199 ms

## Mismatches

None.
