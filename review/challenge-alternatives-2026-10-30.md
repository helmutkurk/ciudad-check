# Replacing the hand-written challenge code: 10-agent discussion (2026-10-30)

Asked by Lorenz (C): hand-written codes held in front of the camera are a technically weak answer. Ten read-only subagents (Sonnet) each took one perspective, read the code and scored their pick for "worth building now". Synthesis and decision by Claude Opus 5.5; recorded as ADR-19 in `../diseno/decisions.md`.

## Shared ground (all ten agreed)
- No browser-only mechanism proves a live capture. A virtual camera, emulator or modified client defeats every frame-level trick; only native attestation (Play Integrity, App Attest) or store-owned QR codes would. This stays an honest limit in the pitch.
- The hand-written code only stops lazy cheats (old photo, stock photo, wrong code). A printout or screen of an old tag with a freshly written code passes today.
- Its real costs are pen and paper in a store, two hands, unreliable handwriting OCR (never measured in the eval: no code photo exists yet), and a low-tech look.

## Perspectives and scores
| # | Perspective | Pick | Score | Main argument |
|---|---|---|---|---|
| 1 | Red team | Keep a nonce, cut friction; make screen flag gating; cross-job pHash, payout caps | 4 | Economic controls beat gates against determined fraud |
| 2 | CV liveness | Motion burst with parallax (flat-plane test) | 5 | Strongest in principle; untuned false rejects 10-25 % |
| 3 | Active light | Torch on/off pattern | 3 | No torch API on iOS Safari; drowned by store light; printouts pass |
| 4 | Worker UX | Finger count plus a 2-frame "move closer" burst | 6 | Removes pen, paper and the second hand |
| 5 | Crypto / attestation | Hash-chained frame stream, server-random shutter; on-chain anchor of the hash | 5 | WebAuthn and C2PA bind nothing to pixels in a browser |
| 6 | Vision reliability | Gesture: 2-5 fingers plus side, closed enum | 6 | Counting and left/right are coarse tasks a flash-lite model does well |
| 7 | Pragmatic implementer | Code burned into the canvas plus screen gate | 6 | 3 h; but proves only "went through our app" |
| 8 | Pitch / judges | Pen-free nonce plus a visible "screen recapture" reject | 6 | "Photographed a screen" reads in one second on stage |
| 9 | Systems design | Process freshness: short window after a server event, two shots | 6 | Time pressure replaces the prop |
| 10 | Devil's advocate | Card pool by default; new gates are risky this late | 7 (cards) / 3 (G8 burst) | Low risk; kill criteria for anything new |

## Decision (ADR-19)
Built now:
1. **Gesture challenge** instead of paper: the engine draws 2-5 fingers and a side (hand left or right of the tag, as seen in the photo) at claim; the model reports the hand it sees; G2 compares in code (perspectives 4, 6, 8).
2. **Late reveal plus answer window**: the gesture is revealed only when the camera opens (`POST /api/claims/{id}/challenge`, idempotent, no re-roll); G6 fails `challenge_stale` if the photo reaches the engine more than 90 s after the reveal (perspectives 5, 9). A composite fake must be made in seconds, not in the 300 s claim TTL.
3. **G8 not_screen**: the existing advisory `looksLikeScreenPhoto` becomes a gate (prompt narrowed to screens; printed paper tags are normal), with a pack kill switch (perspectives 1, 7, 8).

Rejected: torch pattern (iOS), code burned into the image (security theatre: the client stamps any code), WebAuthn and C2PA (no binding to pixels in a browser).
Roadmap: motion/parallax burst as a soft signal, frame-stream chain, on-chain anchor of the evidence hash in the payout metadata, cross-job perceptual-hash index, per-worker payout caps and second-worker sampling.

## Honest limits after the change
- Entropy is 3 bits (8 gestures), lower than a 6-character code; freshness now rests on the late reveal and the 90 s window, plus G6/G7 and single use.
- A worker in the store holding up a printout of an old tag and showing the right fingers still passes, as with paper. A screen recapture fails only if the model flags it.
- Finger-count reliability of `gemini-3.5-flash-lite` is unmeasured. Kill criteria: gesture read exact on fewer than 7 of 8 valid photos, or any false `screen_recapture` on our printed demo tag. Then set `CHALLENGE_MODE=card-pool` (engine env) and/or `not_screen.enabled=false` (pack); no code change.
