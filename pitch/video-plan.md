# Demo video plan (Saturday 2026-10-31)

Production plan for the Devfolio demo video. Story, voice-over and shot intent: [video-script.md](video-script.md). This file owns the Saturday timeline, the edit decision list (EDL), capture tooling and fallbacks. Owner: C (Lorenz, C-14); the cut is done by Lorenz's coding agent, Lorenz reviews.

The video is not shown in the live pitch; judges watch it alone afterwards, so it must explain everything without us. Length: at most 3:30 (Lorenz, 2026-10-31; the prizes page said 2.5 minutes before). Target 3:00; v3 is 3:00. Must show: who it is for, the problem, the business case, one paid job from start to finish with its transactions on a preprod explorer, agent hires agent (x402), payment tied to the result, honest limits.

## 1. One job, start to finish

The strongest proof is a single job that runs through every step on camera: the order and escrow lock (shot 4), the task on the worker's phone in the store (5), the hand sign photo (6), the paid verifier check (7), the payout (8), the report and escrow result (9). So the order is placed while the shoot team stands in the REWE, ready to claim.

| Plan | When | How | On screen |
|---|---|---|---|
| A | 07:30 go/no-go (Isabel) | Order from `/dashboard` or the Sokosumi hire form for store `rewe-81671-august-everding-strasse-20` and one catalog product; the bridge creates the engine job; the in-store phone claims it | No label needed; all hashes belong to this job |
| B | if A is not ready | Job from `codigo/scripts/field-jobs.ts` (no escrow) for the store run; escrow lock and settlement from the 08:00 cycle or earlier runs | Shot 4 and the escrow part of shot 9 labelled "separate escrow run" |

The cheat (shot 10) is a separate job at a laptop; it is never paired with a hash from the real run.

Escrow deadline (plan A): the starter submits the result within 20 min of the payment request and the shell bridge stops waiting 300 s (`SHELL_DEADLINE_MARGIN_SEC`) before that, so the photo must pass about 8-10 min after the lock (`../codigo/docs/verified.md`, M4 timing and Masumi 1:1 rows). A later pass still pays the worker, but the escrow refunds instead of settling. Do not lengthen `JOB_WINDOW_SEC` for escrow-backed jobs (C-17) without lengthening the starter's deadlines too.

## 2. Saturday timeline

Roles on Saturday morning (Lorenz, 2026-10-30): Helmut and Fernando finish the UI (look only, no functional change), Isabel finishes the homepage (also the live pitch). UI and homepage are final at 07:00. Video crew: Lorenz plus one helper (camera); Lorenz's agent cuts. Everything that does not depend on Saturday's job is done on Friday night, so Saturday morning is only the store run and the screen takes.

Friday night (before sleeping):

| What | Who | Done when |
|---|---|---|
| Voice-over for all 12 shots generated with Gemini TTS in Google AI Studio (voice "Nika" (warm, conversational), one style prompt; text from `video-script.md`), `vo_s01.wav` ... `vo_s12.wav`, 121 s of speech. Shot 6 uses three fingers right of the tag as a placeholder and is regenerated on Saturday | agent (done Fri 23:45) | 12 files in `~/shelfie-video/raw/` |
| Refund tx of an earlier escrow run on preprod.cardanoscan.io, screen recorded (shot 9, label "earlier test run"); hash from `tx-hashes.md` | Lorenz | `s09_refund_t1.mkv` |
| Log Friday's payout tx `7000899...` (job `job_c88c9da1cb68`) via `/log-evidence`, hash copied from the explorer | Lorenz | row committed (else fallback 1 in section 5 is not usable) |
| Plan A or B (section 1) decided | Isabel | answer in chat |
| Team rules sent: UI and homepage deployed by 07:00, no deploy to the hub 07:00-09:00 (store run); W-VBUY funded by 07:00 | Lorenz to the team | acknowledged |
| Phones: charged, notifications off, do-not-disturb on, screen recorder tested (Android: built-in recorder; iOS: control centre), camera phone at 1080p30; REWE opening hours checked | Lorenz + helper | test clip plays on the laptop |

Saturday:

| Time | What | Who | Done when |
|---|---|---|---|
| 06:45 | Hub check on Helmut's laptop: engine, verifier, tunnel up, fakes and override off, `evidence-preflight` green. W-VBUY balance > 0 | Helmut, Fernando | preflight clean, balance shown |
| 07:00 | Agent captures the homepage (`capture-site.mjs`, 2 min) and renders the cards with the final URL; Lorenz checks two stills | agent, Lorenz | `site_price.png`, `end.png` |
| 07:15-07:40 | Store: B-roll for shots 1 and 2 (hands, tags, aisle, chest-down phone photo), each take twice, 6-8 s, exposure locked on the tag | Lorenz + helper | 8-10 clips |
| 07:40 | Order placed on the laptop at the store entrance, OBS records `/dashboard` (shot 4); lock tx on the explorer once confirmed. Plan B: job from `field-jobs.ts` instead | Lorenz | lock or job id noted |
| 07:45-07:55 | In the store: phone screen recorder on; task appears, claim (5); camera, sign, countdown, photo (6) while the helper films over the shoulder; phone shows the green verdict (7). Within 8 min of the lock | Lorenz (phone), helper (camera) | green verdict on the phone |
| 08:00-08:20 | Laptop: dashboard job page with the PASS row (7), payout row and the payout tx on Cardanoscan with hash and amount (8), report and escrow state (9) | Lorenz | `s07`/`s08`/`s09` files |
| 08:30 | Transfer to `~/shelfie-video/raw/` (section 4); a one-line note per file ("IMG_1234 = hand at tag") | Lorenz | agent confirms all sources present |
| 08:30-09:00 | Cheat take at a laptop (10): new job via `field-jobs.ts`, phone aimed at an old shelf photo, no hand; red verdict and FAIL row recorded | Lorenz | `s10` files |
| 08:30 | Shot 6 voice-over regenerated with the sign that actually appeared (same voice and style prompt) | agent | `vo_s06.wav` matches the take |
| 09:00 | Draft v0 with real footage and Friday's voice-over; contact sheet to Lorenz | agent | draft under 150 s |
| 09:30 | Pitch rehearsal 3; agent fixes the review notes meanwhile | Lorenz; agent | - |
| 10:15 | Review v0b (stills, then once with sound); re-takes of screen shots only if needed. Escrow settlement clip if it has arrived, else the earlier-run clip (section 5) | Lorenz | notes to the agent |
| 11:00 | Feature freeze: no new takes. Homepage re-captured once if it changed since 07:00 | agent | - |
| 11:00-11:45 | Final render v1, Lorenz watches it once with and once without sound | agent, Lorenz | `shelfie-demo.mp4`, ffprobe < 150 s |
| 12:00 | Safety upload v1 (YouTube, unlisted) | Lorenz | link opens logged out |
| 12:00-13:00 | Last fixes (text, timing only) | agent, Lorenz | v2 |
| 13:15 | Final upload; link to Helmut | Lorenz | link opens logged out |
| 13:45 | Devfolio entry filled (README, description, link) | Helmut | form saved |
| 14:30 | Submit | Helmut | confirmation |

Hard cut-offs: no usable store run by 09:30 means fallback 1 in section 5 (Friday's run). No final export by 13:15 means v1 is the submission.

## 3. Edit decision list (16:9, 1920x1080, 30 fps)

Each shot lasts as long as its voice-over take plus 0.7 s, at least the picture minimum below. Dry run with synthetic footage and the generated voice-over (318 words): 141 s.

| # | Min (s) | Picture | Title (top left) | Label (top right) | Source files |
|---|---|---|---|---|---|
| 1 | 9 | REWE B-roll: hands, tag | A real request | - | `s01_broll`, `s01_tag` |
| 2 | 9 | Quick cuts: aisle, tags, phone photo | Today: €50+ per visit, paid usable or not | - | `s02_broll` |
| 3 | 13 | Card "An AI cannot see the shelf.", flow card built in 5 steps | - | - | cards |
| 4 | 10 | Order, escrow "funds locked", lock tx | 1 · Order: fee locked in escrow | plan B: "separate escrow run" | `s04_order`, `s04_lock` |
| 5 | 6 | Phone: task appears, claim | 2 · Task offered, first to claim | - | `s05_phone_claim` |
| 6 | 15 | Phone: sign + countdown; match cut to over-shoulder hand by tag; shutter; box | 3 · One-time hand sign, 90 s | Live recording · 31.10.2026 | `s06_phone_sign`, `s06_cam_hand` |
| 7 | 11 | Split: phone verdict card / dashboard PASS verdict row, 6x | 4 · Verifier agent, paid per check via x402 | 6x · real time | `s07_phone_result`, `s07_dash_green` |
| 8 | 9 | Payout row, Cardanoscan with zoom on hash and amount (2.5 s hold) | 5 · Worker paid on Cardano preprod | - | `s08_payout`, `s08_cardanoscan` |
| 9 | 10 | Report, escrow result; refund tx | 6 · Report delivered, escrow settles · else refund | "earlier test run" on the refund | `s09_report`, `s09_refund` |
| 10 | 9 | Split: phone camera at laptop with old photo, no hand / phone red card and dashboard FAIL row (`code_match`), no payout | Cheat: old photo, no sign, rejected, €0 (screen variant: `video-script.md`) | - | `s10_phone_cheat`, `s10_dash_red` |
| 11 | 8 | Homepage price comparison (still, slow zoom), then business card (illustrative pricing) | - | - | `site_price.png`, cards |
| 12 | 11 | "Today and next" card, end card with repo link | - | - | cards |

Rules: at most two panels at once; split screen = portrait phone 1080 high on the left, screen cropped to the rest. Subtitles burned in from the voice-over text. Honest labels; re-enacted footage never paired with a hash from another photo; override and fakes off in every take. Over 2:25: trim the voice-over as listed in `video-script.md`.

## 4. Capture and tooling

| Item | Setting |
|---|---|
| Raw footage | `~/shelfie-video/raw/` on Lorenz's laptop (outside the repo on purpose; photos and videos are never committed, the repo is public) |
| Transfer | Android by USB cable (file transfer, `DCIM/Camera`, `Movies`); other team phones through a private Drive folder shared with the team only, downloaded into `raw/`. Original names are fine; the agent renames to the scheme below |
| Homepage | `~/shelfie-video/capture-site.mjs` takes a still of the price comparison from the live homepage (headless Chrome, 1080p); captured at 07:00 and again at 11:00 only if the page changed, so the video never shows an outdated page. No screen recording of the homepage; the cards stay the fallback |
| File names | `sNN_<what>_tN.<ext>` as in the EDL, e.g. `s06_cam_hand_t1.mp4`; voice `vo_sNN.wav` |
| Screen | OBS window capture of a clean Chrome profile (no bookmarks, no other tabs), zoom 125%, 1080p30; never on Helmut's laptop (the engine runs there) |
| Android phone | `scrcpy --no-audio --max-fps=30 --record=sNN_phone_<what>_tN.mkv` |
| iOS phone | Control-centre screen recording, transfer by cable; the cutter normalises HEVC/VFR to 30 fps |
| Camera (B-roll, over-shoulder) | Second phone, landscape, 1080p30, exposure locked on the tag, 6-8 s per shot |
| Sync | Clap plus a visible clock before every take |
| Cards | `~/shelfie-video/cards/cards.html`, rendered to PNG by `cards/render.sh` (headless Chrome): no-AI card, flow in 5 steps, business case, today and next, end card with repo link |
| Cutter | `~/shelfie-video/cut.py` + `edl.json`: 30 fps proxies, cached segment renders (layouts card, image, full, phone, split; zoom, boxes, speed), final pass with titles, labels, subtitles, loudness-normalised voice. `python3 cut.py probe`, `render [--draft] [--only sNN]`, `frames` (stills and contact sheet). Text change and re-render: about 25 s |
| Export | `shelfie-demo.mp4`: H.264 High, 1080p30, CRF 19, AAC 192 kbps 48 kHz, `-movflags +faststart`; duration checked with `ffprobe` |
| Review | Lorenz reviews three stills per shot, then watches the export once with and once without sound |

Demo jobs (plan B and the cheat): `codigo/scripts/field-jobs.ts` (1 h window, `--per 3`, `--store`), created at most 15 min before shooting, run by a human with their own token file. Workers: `dev.shelfieapp.fyi/w`; dashboard: `/dashboard`.

Privacy in every frame: no faces, no customers or staff, no tokens, env files or terminals with secrets, worker addresses shortened, phone notifications off.

## 5. Fallbacks

| If | Then |
|---|---|
| Live store run fails | Friday's run: job `job_c88c9da1cb68`, payout tx `7000899...` on preprod.cardanoscan.io, label "recorded Fri 30.10."; full hash from `tx-hashes.md` (not logged yet: log it at 07:00 first, else this fallback is not usable) |
| Escrow result not in by 11:00 | Lock and settlement or refund from earlier runs (`tx-hashes.md` M4, M5 rows), label "earlier run" |
| Verifier fails on a real take | Re-shoot (light, distance, tag); never the override |
| W-VBUY still empty | No live verifier take; Friday's run as above |
| Video over 3:30 | Trim the voice-over (order in `video-script.md`), then drop the "Today and next" card |
| No usable voice-over | Titles and subtitles only, no music |

## 6. Decisions

1. Decided (Lorenz, 2026-10-30): store footage and the verification run are filmed in the real REWE, which gave filming permission; our printed tags are the fallback.
2. Decided (Lorenz, 2026-10-30): Lorenz's agent cuts; Lorenz reviews; Helmut does README and Devfolio.
3. Decided (Lorenz, 2026-10-30): the video is standalone (not shown in the pitch); it explains the customer, problem, flow, business case and limits itself. Script rewritten to 12 shots.
4. Open, Isabel by Friday night (latest 07:30): plan A (one job through order, escrow and store run) or plan B (section 1). ADR-20 is accepted (orders from `/dashboard`; real Sokosumi purchase waits on B-15), so plan A needs either B-15 or the Sokosumi hire form.
5. Decided (Lorenz, 2026-10-30): the homepage appears once, as a still of its price comparison in shot 11, captured from the final page (section 4); the flow in shot 3 stays our own card because it explains the job steps the judges must follow. Voice-over is recorded on Friday night so Saturday holds only the store run and screen takes.
6. Done (Lorenz, 2026-10-31): final video v7 (3:00) uploaded to YouTube as unlisted, so judges can open it without an invite: https://youtu.be/BkKk07p8710 (link for Devfolio, Helmut).
7. Decided (Lorenz, 2026-10-31): the submitted video is version B (2:29, same footage, script told from the agent side: "the physical world has no API, Shelfie is that API"), unlisted: https://youtu.be/jS0IWTJ0A_U. This is the Devfolio link (Helmut). v7 (https://youtu.be/BkKk07p8710) stays online as the alternative; edit lists: ~/shelfie-video/edl.json (v7) and edl-b.json (B).
