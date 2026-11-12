# Lorenz - role C
- Role and pair: C, pair with Helmut (D)
- GitHub: 04Lenz04
- Reviews: pair reviews each other's commits first (peer review, `scripts/peer-review.sh`)

## Current focus
Gesture challenge (ADR-19, C-16) built on `dev`; next: gesture eval photos and a live run against the ADR-19 kill criteria, then C-03/C-09 (OOS photos).

## Active branch
`dev`, ADR-19 commit not pushed yet.

## Components I added
| Name | Path | What it does | How to run | Status | Depends on |
|---|---|---|---|---|---|
| Eval runner | `codigo/eval/` | Labelled photos through `evaluate()`, stub/live/replay reports | `cd codigo && npm run eval -w @shelfie/eval -- --mode live` | works in stub; live pending keys | `@shelfie/verifier` |
| set-secret | `codigo/scripts/set-secret.sh` | Key once into git-ignored `codigo/.env`, hidden input | `cd codigo && bash scripts/set-secret.sh VISION_API_KEY` | works | - |

## Open questions
- Does flash-lite count fingers and flag screens reliably? Gesture eval decides (Lorenz).
- Exact Gemini/OpenAI model ids and base URLs for the live run (verify Friday, Lorenz).
- Real OOS photos on the props shelf (C-08), with Helmut (D).

## Last updated
2026-10-30 17:30 by Claude Opus 5.5 (Lorenz's session)
