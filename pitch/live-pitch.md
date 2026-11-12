# Live judging script

Assumption (not confirmed by the organisers): each partner track gets a 3-minute pitch plus 2-3 minutes of Q&A at the team's table or stage, inside the live-judging window. Confirm the format at the opening and adjust. If only 2 minutes are given, use the 2-minute version below.

Challenge: the hand sign of ADR-19 (`../diseno/decisions.md`), default `CHALLENGE_MODE=gesture`. If the ADR-19 kill criteria trigger before Saturday, the engine runs `card-pool` and the code-card lines at the end of this file replace the hand-sign lines.

## Roles

| Role | Speaker | Job |
|---|---|---|
| A | Isabel: storyteller and field shopper | Tells the real request (her own story), holds the phone and the printed tag, performs the cheat and the photo with the hand sign, says the callback; answers architecture and scale questions |
| C | Lorenz: pitch lead and verifier narrator | Product sentence, verifier narration, business and limits; answers verifier, fraud and security questions |
| B | Fernando: operator | Drives the laptop (Sokosumi, escrow, explorer), one line each on the lock and the payout tx; answers Cardano and payment questions |
| D | Helmut: backup and time | Timekeeper, backup laptop and video, holds the cheat screen, hands over props; answers business, UX and privacy questions |

Two main voices (Isabel, Lorenz); handoffs eat time. Letters are the build roles of `../diseno/repo-layout.md` section 2, so each person speaks about what they built. Everyone knows the whole script. If a judge asks the "wrong" person, that person answers and the others add.

## Setup before the table is called

- [ ] Story page (`https://dev.shelfieapp.fyi/story`) open in tab 1, one key press down (the "real request" beat), or, if the network is weak, the offline copy `~/Dokumente/Projekte/Shelfie-Pitch-Offline/story/index.html` on Lorenz's laptop (opens from disk; rebuild after every page change with `bash scripts/story-offline.sh`). Click once on the page so it has keyboard focus.
- [ ] Laptop on power; second tab strips: Sokosumi, dashboard job page (verdict rows), preprod.cardanoscan.io (verifier fee address and payout address pre-opened), terminal with ledger.
- [ ] A fresh job pre-created but not started; one earlier completed job open in a tab (escrow settled) and one earlier refunded job open in a tab.
- [ ] Phone with the web app logged in, brightness max, do-not-disturb on, screen recording running as insurance. Camera permission already granted (no prompt on stage).
- [ ] Printed price tag with a known product. For the cheat: an old photo of the same tag full-screen on the backup laptop or a tablet (Helmut holds it); there is no gallery path in the app.
- [ ] Fallback props only for `card-pool` mode: the printed challenge-code cards.
- [ ] Offline backup: a USB stick/phone with the video, screenshots of each step, and a text file with tx hashes.
- [ ] Hotspot ready as a backup network. Preprod wallet balances checked (tADA in `W-VBUY` for verifier fees and in `W-PAY` for payouts).
- [ ] Browser zoom 125%; notifications off; no secret in any visible tab.

## Run of show

The stage script is [director-script.md](director-script.md) (2026-10-31): scene by scene, exact lines per person, key presses and tabs, time rules. It replaces the earlier table here, which assumed a 12-15 s verifier and a live cheat; the real supermarket test took about one minute per check, so the pitch now has one live photo, the team explains while the verifier works, and the cheat is a screenshot from the morning test.

Facts the script relies on: the x402 verifier fee is its own preprod tx (W-VBUY -> W-SELL, M1 rows in `../codigo/docs/evidence/tx-hashes.md`), and W-VBUY must be funded or every live check fails. Escrow receipts are earlier test runs; say "earlier test runs", never "this job". Never present a recording or an earlier transaction as live.

If a judge wants to participate: Isabel hands the phone to the judge for the photo (scene 4); the judge shows the fingers. Only when ahead of time and the network is behaving.

## Backup plan for each demo step

| Step | Failure | Backup |
|---|---|---|
| Escrow job start | Sokosumi down or slow | Open the earlier completed job; show recorded lock clip |
| Lock tx | Explorer slow | Pre-loaded tab; screenshot of the lock tx in the backup deck (`slides/shelfie.pdf`) |
| Phone shoot | Camera/permission/network failure | Second phone (A) with the same page; or use the flagged admin test upload with a pre-shot photo of the correct tag and sign (off in evidence runs; state this honestly) |
| Hand sign | "Loading your hand sign..." does not end | Close and reopen the camera (the reveal is idempotent, same sign, same window); if still failing, release and claim again |
| Hand sign | Verifier misreads the fingers (`gesture_mismatch`, `gesture_low_confidence`) | Claim again (last spare attempt), fingers spread, hand flat against a plain background; then the override below |
| Verifier | Vision model slow or misreads | Turn on the admin-only manual override (off by default, red "DEMO OVERRIDE" badge, ledger entry) and say what it is; or play the 20-second verifier clip |
| x402 payment | Facilitator or network error | Show the ledger of earlier x402 payments with tx hashes; play the clip |
| Payout tx | Not confirmed in time | Show the hash in the app; then the previous payout tx from the earlier run; explain the preprod block time |
| Cheat | Verifier passes the screen photo | Cannot pass without the sign; if it does, say so plainly ("the sign check is model-based, here it missed") and move on |
| Whole demo | Venue network down | Hotspot; then the 2:20 video with live commentary; then the story page offline copy and the backup deck |
| Refund | No refund yet | Open the earlier refunded job or its recording |

Rule: never present a recording or a pre-existing transaction as if it was live. Say "this is from an earlier run" every time.

## Q&A plan (2-3 minutes)

- Take the first question in one sentence, then redirect to the relevant speaker if needed.
- If asked what is not built: say plainly (preprod only, location proof is roadmap, we use teammates as shoppers, one real request but no brand interviews yet).
- If asked about traction: "one real request, which inspired the product"; never "customer" or "pilot".
- If asked about the hand sign: 8 combinations, so a blind guess passes the sign check 1 time in 8; the late reveal, the 90 s window, single use, the other gates and location still apply (ADR-19).
- Use `qa-prep.md`; the top five to rehearse: fraud/GPS spoofing, why blockchain, why Cardano instead of Stripe, custody/who holds the money, what was built in 30 hours.

## Timing marks (Helmut, phone timer)

In [director-script.md](director-script.md), section "Time rules".

## Card-pool fallback lines

Only if the engine runs `CHALLENGE_MODE=card-pool` (ADR-19 kill criteria). Setup: printed code cards next to the tag.
- 0:52 cheat: Isabel claims, opens the camera, aims at the old photo, shoots. Lorenz on the verdict: "Same tag, old photo, no code. Red. No money moves."
- 1:15 true photo: Isabel claims again, shows the code for a second, holds the matching card next to the tag and shoots. Lorenz: "The code proves this photo is new, made for this task. It reads product, price and code. Green."
- 2:17: "The code stops stale photos, not the wrong shop."

## Multiple tracks

If the project is also entered in another track, the same demo is reused with a different last 30 seconds; this document covers Cardano only. Check the timetable so that two tracks are not scheduled at the same time.
