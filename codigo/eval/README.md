# eval

Status: implemented; works in stub mode, waiting for the photo set (Fri 30-10). Links point to the canonical design in `diseno/` at the repo root (one source of truth).

## Purpose

20-photo evaluation of the verifier: labels, photos, runner and results.

## Owner and starting point

- Owner role: C (person per role: `scripts/team.conf` and `.github/CODEOWNERS`).
- Starts from: Scratch.

## Responsibilities

- `labels.json`, the photo set (large files not committed), runner against the dry endpoint, `results/`.
- Staged cheat cases from [verifier-rules.md](../../diseno/verifier-rules.md).

## Interfaces

- [verifier-rules.md section 7](../../diseno/verifier-rules.md); verifier `POST /v1/verify-dry` and `/v1/extract` (contracts section 3.2).

## Milestones

- First report with M2 (Fri 15:00); final before the freeze (Sat 13:00).

## Definition of done

- Report with per-gate precision on the 20 photos saved to `docs/evidence/`.

## Do not

- Do not commit private photos with people; shelves and price tags only.
- Do not use dry verdicts as evidence.

## What exists
- `labels.json`: schema `LabelsFileSchema` in `src/labels.ts` (case, outcome, expectedCode, product, truth, expect, optional `duplicateOf` / `claimOffsetSec` / `stubScenario`). The committed file has 3 placeholder entries and no photos.
- `src/run.ts`: runs `evaluate` in-process over every label (same function as `/v1/verify-dry`), in file order so `duplicateOf` and near-duplicate memory work. `src/report.ts`: confusion matrix, acceptance table from verifier-rules section 7, per-case and per-reason counts, latency. `src/execute.ts` / `src/cli.ts`: modes and output.
- Output: `results/<timestamp>.json` (labels, verdicts, raw extractions, thresholds, models) and `results/<timestamp>.md`. `results/*.json` and `photos/` are git-ignored. The design says `<commit>.json`; use `--note <commit>` and rename when you keep a result.

## Run
```
cd codigo
npm run eval -w @shelfie/eval                       # stub mode, synthetic stand-in photos, no keys
npm run eval -w @shelfie/eval -- --mode live --note <git-commit> --cost-per-check 0.004   # VISION_* from env, photos in eval/photos/
npm run eval -w @shelfie/eval -- --mode replay --replay results/<file>.json               # re-tune thresholds offline, no model call
```
Stub and synthetic runs are marked "NOT evidence" in the report. Live runs: put photos in `eval/photos/` (shelves and tags only, no people), add one label per photo, run once per provider (set `VISION_PROVIDER`, `VISION_MODEL`, `VISION_BASE_URL`, `VISION_API_KEY`).

Keys once, not per shell: `bash scripts/set-secret.sh VISION_API_KEY VISION_FALLBACK_API_KEY` (from `codigo/`; hidden input, writes the git-ignored `codigo/.env`, mode 600). Put the non-secret `VISION_PROVIDER`, `VISION_MODEL`, `VISION_BASE_URL` in the same file with an editor. `npm run eval` and the verifier's `dev`/`start` load `codigo/.env` (`--env-file-if-exists`); variables already set in the shell win, so you can switch provider for one run with `VISION_PROVIDER=openai ... npm run eval ...`. The mode is never taken from `.env`: without `--mode live` the run is stub.

## TODO
- Capture the 20 + 8 photos and write their labels (cases in `CaseSchema`).
- Cost per check is recorded only if passed with `--cost-per-check`.
- By default the runner calls `evaluate` directly. Live mode also supports `--verifier-url` (or `EVAL_VERIFIER_URL`) for an existing service's admin dry endpoint; see below.
- The first report goes to `docs/evidence/` with the commit hash after the real run.

## WhatsApp set — 2026-10-31

The 14 labels in `labels.whatsapp-2026-10-31.json` follow attachment order. Photos stay
outside git at `/home/hks/borrar/shelfie-eval-photos-2026-10-31/`; never copy them into the
repository. Labels accept absolute JPEG/PNG paths, or basenames resolved under `--photos`.
Absolute paths take precedence over `--photos`.

From `codigo/`, with `ADMIN_TOKEN` already exported to match the local verifier and that
verifier running with `ENABLE_DRY=true` and live vision:

```bash
npm run eval -w @shelfie/eval -- --mode live --no-synthetic --labels labels.whatsapp-2026-10-31.json --verifier-url http://127.0.0.1:4199
```

`EVAL_VERIFIER_URL=http://127.0.0.1:4199` can replace the URL flag (flag wins). The npm
workspace runs from `codigo/eval`, so the labels path above is relative to that directory.
Only `/v1/verify-dry` is called, with `X-Admin-Token`, a per-entry idempotency key, no redirects,
no retries and a 60 s request timeout. No local `VISION_*` settings are needed in HTTP mode.
Stub/replay mode never selects HTTP from the environment. Reports remain **NOT evidence**;
G6 uses synthetic request timestamps and the run does not prove capture freshness or location.
Remote thresholds are recorded as unknown: the dry endpoint does not report its configuration.

Prices exclude the separately printed EUR 0.25 deposit. `product.ean: ""` plus
`not-in-catalog` in notes marks absent exact catalog variants; only original Red Bull 250 ml
uses the catalog EAN. Observed `truth.gesture` may contain one finger, while issued
`expectedGesture` still requires 2–5. Missing/ambiguous signs use null truth; hypothetical
test challenges are identified in notes. The original issued challenge is only visible in #3.

Read notes before interpreting accuracy: #1–2 have one raised thumb, #3 is an app screenshot,
#4 has an obscured target tag, and #8–14 have no sign. #1, #2 and #12 exercise the OOS path
but their facing boundary needs review (O5 unknown). For #8, #10 and #13 the selected target
is stocked original Red Bull on the left, not the adjacent empty sugarfree slot. Tag-only
closeups do not prove stock status. EDEKA Süd text in several frames conflicts with the
team's REWE description. Notes enumerate per-gate expectations and uncertainties;
`expect.failedGates` lists mandatory failures, not assertions about unknown gates.
