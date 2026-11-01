# Pitch technical check against the code (2026-10-30, C-14)

Scope: every technical claim in `pitch/` (live-pitch, storyline, devfolio-description, homepage-brief, video-script, video-plan, qa-prep, slides) checked against `dev` at `d17f51c`, `codigo/docs/verified.md` and `codigo/docs/evidence/tx-hashes.md`. Reviewer: Claude Opus 5.5 for Lorenz (C). Nothing in `pitch/` was changed; fixes are listed per file.

## Confirmed by the code

| Claim | Where it is true |
|---|---|
| Hand sign 2-5 fingers, left or right, 8 combinations, blind guess 1 in 8 | `packages/core/src/ids.ts` `makeGestureChallenge`, `verify.ts` GESTURE_MIN/MAX |
| Default mode is gesture, `CHALLENGE_MODE` env is the kill switch to `card-pool` | `domain-shelf/src/pack.ts` (`mode: "gesture"`), `engine.ts` `challengeMode()` |
| Sign drawn at claim, shown only on camera open; reveal is idempotent (same sign, same window) | `engine.ts` `revealChallenge` |
| 90 s answer window, 5 s minimum after claim | pack `timing` rule, `gates.ts` G6 |
| 3 attempts per task, task reopens after a fail, one active claim per worker and per payout address | `env.ts` `MAX_ATTEMPTS=3`, `engine.ts` reopen at `attempts < maxAttempts`, `claim_already_active` |
| Screen check fails open (only an explicit `looksLikeScreenPhoto === true` fails) | `gates.ts` `gateNotScreen` |
| Duplicate and near-duplicate photos rejected | `gates.ts` G7 |
| City check at claim, 150 m geofence at capture before any verifier call (no fee) | `engine.ts` claim and capture precheck, `env.ts` `DEFAULT_GEOFENCE_M=150` |
| Stage store exists in the catalog (`demo-hoc-friedenstrasse-24`, chain DEMO, 150 m) | `investigacion/catalogo/stores.json` |
| Verifier fee 1 tADA per check, payout 3 tADA | `env.ts` `VERIFY_PRICE_LOVELACE`, `PAYOUT_LOVELACE`, pack `payout` |
| The x402 fee is its own preprod tx | M1 rows `cbc9cb5d...`, `1547a4a7...`; engine writes `VERIFY_PAID` with the tx hash. The "verify before Saturday (B)" line in `live-pitch.md` can be closed |
| Payout starts right after a pass, tx hash shown in the worker app | `engine.ts` `accept` -> `startPayout`; `worker/Result.tsx` TxLink |
| Override is env-gated, off by default, bannered and flagged in the ledger | `ALLOW_DEMO_OVERRIDE`, `dashboard/Banners.tsx`, `LedgerView.tsx` |
| Escrow fee about 1 test USDM | M4/M5 lock rows (1 test USDM + 4.47 tADA collateral) |

## Wrong or at risk (fix before rehearsal 3)

1. **Settle and refund receipts were not Shelfie jobs with a real photo.** The only settlement (`b3e38993...`, M4) belongs to Task `01a18c5e...`, locked at block 5352885 under the starter registration "Hackathon Team Name Finder" (Shelfie registered later, block 5353705). The refund (`ca8f5de9...`, M5) ran through the bridge with the engine on fakes, also before the Shelfie registration. The ADR-20 Task (`c6147b08...`) under the Shelfie registration has a lock and a result but no settlement row yet. The pitch says "The photo passed, so the report is delivered and escrow settles ... Earlier runs, here" (`live-pitch.md` 2:00) and the homepage shows settle and refund as receipts. Fix: log the settlement of the ADR-20 Task (A's open TODO) and use that; label the refund "escrow test run, no photo" on the homepage and in the tab. Never present either as the settlement of a verified photo.
2. **Verifier latency is not "p95 8 s".** `verified.md`: `gemini-3.5-flash-lite` mean 8.5 s, p95 13.2 s (the faster models timed out). With the x402 settlement on top, plan 12-15 s per verdict. `live-pitch.md` line 44: two runs cost about 25-30 s, not 20; the 15 s slack is gone. Fix the timing note and keep Lorenz's filler line ready for every run, not only above 10 s.
3. **There is no "verifier view" with highlighted price and gates turning green.** The web app shows the worker a verdict card (`worker/Result.tsx`: message, price, payout tx) and the dashboard a verdict row from the ledger note (`PASS` or `FAIL failed=<gate names>`); `JobDetail.tsx` says "A photo viewer is not built yet". No bounding boxes, no per-gate list. Affected: `live-pitch.md` choreography step 4 and the "verifier" tab; `video-script.md` shot 7 ("dashboard gates ticking green") and shot 6 ("yellow box", only fine if it is an edit overlay, then label it as such). Fix: describe what is on screen (worker verdict card, dashboard verdict row), or build a gate list in the dashboard before the 11:00 freeze (D).
4. **The cheat will not show `screen_recapture` if no fingers are shown.** Gate order is `image_ok, code_match, not_screen, ...`; the worker message comes from the first failed gate, so a cheat with no hand reads "hand sign missing", and the dashboard shows `failed=code_match[,not_screen]` (gate names, not reason codes). `screen_recapture` is never displayed by name, and appears in the failed list only if the model sets the flag. `live-pitch.md` already says "read whichever reason the screen shows": fine. `video-script.md` shot 10 ("The verifier sees a screen", dashboard red `screen_recapture`) is only true if the take shows the correct fingers in front of the laptop and the model flags it. Fix: either shoot the cheat with the correct sign and keep the take only if `not_screen` failed, or change the voice-over to "No hand sign, old photo: rejected, nothing paid".
5. **Escrow deadline vs. store run (video plan A).** The starter submits the result within 20 min of the payment request (`verified.md`, "worker has about 13 minutes after the lock"), and the bridge stops waiting at deadline minus `SHELL_DEADLINE_MARGIN_SEC` (300 s), so the photo must pass within about 8-10 min of the lock. `JOB_WINDOW_SEC` is 900 s (15 min), and C-17 plans to lengthen it. A photo that passes after the bridge gave up still pays the worker, but the escrow refunds instead of settling. `video-plan.md` 07:45: the in-store phone must claim right after the lock; do not lengthen the job window for escrow-backed jobs without lengthening the starter deadlines.
6. **Escrow cycle length.** Pitch and slides say "can exceed 60 minutes" / "about an hour". Measured: settlement 46 min after the request (36 min unlock plus polling), refund about 32 min. Say "30-45 minutes" (`live-pitch.md` choreography 1, `slides/sections/14-status.tex`).
7. **"The brand can swap its URL."** The verifier URL is the operator's env var `VERIFIER_URL`; brands have no setting. Say "the verifier is a separate paid endpoint; pointing to an independent one is a config change" (`live-pitch.md` 0:52, `qa-prep.md` 3a and 25, slide `08b-receipts.tex`).

## Outdated after ADR-19 (code, not gesture)

`gesture` is the pack default, but these still describe written or printed codes:
- `storyline.md`: Proof beat ("writes it on paper"), phrase 2 "The code in the photo".
- `devfolio-description.md`: "The three things to remember" #2, How it works steps 2-5 and the cheat paragraph, "What we built" ("one-time challenge codes"). Also add the screen check and the geofence to step 4.
- `qa-prep.md`: Q1 ("code ... expires after a few minutes": now a 90 s window after the reveal), Q2, Q3, Q4, Q5, Q16, Q19, Q26, bonus answers.
- Slides (backup deck): `06-gates.tex` "Challenge code", `11b-today.tex` and `14-status.tex` "Code stops stale photos" / "One-time code".
The storyline rule "these three appear verbatim everywhere" makes phrase 2 the root: change it first (e.g. "The sign in the photo"), then the others.

## Smaller points

- `qa-prep.md` Q11: `people_visible` is stored in the verdict extraction (`verifierNotes`) but not shown to the operator in the dashboard. Say "recorded", not "flagged to the operator", or surface it.
- `qa-prep.md` Q10 undersells: hard caps exist in code (`PAYOUT_DAILY_CAP_LOVELACE` 50 tADA, `VERIFY_RUN_CAP_LOVELACE` 50 tADA, `VERIFY_MAX_PRICE_LOVELACE`, one serial queue per wallet). Per-order caps are ADR-20.
- `video-plan.md`: payout `7000899...` (job `job_c88c9da1cb68`) is not in `tx-hashes.md` yet; it is planned for 07:00 Saturday. Until then it cannot be used as a fallback.
- `slides/facts.tex`: all tx macros are placeholders; fill from `tx-hashes.md` (see point 1 for which settlement to use). The verifier fee row can say "live, x402" (point "own tx" confirmed).
- `devfolio-description.md` placeholders that can be filled now: `[X402_PACKAGE]` (`@x402/*` 2.26.0), `[CARDANO_SDK_OR_LIBRARY]` (`@evolution-sdk/evolution` 0.5.14), `[AGENT_ID]` (registration `cmvv55cpy00301w904q3bezzk`), x402 tx `cbc9cb5d...`, payout tx `1abef825...` (engine queue, B-07). "Blockfrost [VERIFY_IF_USED]": `BLOCKFROST_PROJECT_ID` is in the engine env schema.
- W-VBUY is empty since Friday evening (`video-plan.md`): every live check, including the pitch, fails until it is funded.

## Status

Fixed in `pitch/` on 2026-10-30 (same session): points 2-7, the ADR-19 wording, Q10/Q11, Devfolio placeholders that are known. Still open: point 1 needs the ADR-20 settlement row (A); point 3 is wording only (a gate list in the dashboard would be a D task); `facts.tex` tx macros stay placeholders until the final hashes; W-VBUY funding.
