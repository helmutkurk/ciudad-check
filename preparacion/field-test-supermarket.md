# Field test runbook: REWE and House of Communication stage

> Historical build reference (2026-10-30/31), retained for unique scenarios, risks or design rationale. Current operation: [STATE](../docs/STATE.md). The backend is offline; old service, timing and implementation instructions are not current.

Owner: D (Helmut), written 2026-10-30 from the code at `dev` 05c41d1 plus the gesture challenge (ce7ec5f, C-16). Every row below comes from a code path, not from the design docs. "Unverified" marks anything inferred from code that nobody has seen on a phone yet.

Stores: REWE `rewe-81671-august-everding-strasse-20` (dropdown label "REWE, Hanne-Hiob-Straße 10"), stage `demo-hoc-friedenstrasse-24`. Defaults used below: geofence 150 m, claim TTL 300 s, answer window 90 s after the hand sign is shown, 3 attempts per task, 3 location tries per claim, job window 900 s, payout 3 tADA, verify fee 1 tADA.

**Timers are changing (owner C, Lorenz, task C-17).** Lorenz is lengthening the worker's time to execute a task and related timers (job window, claim TTL, gesture/answer window). Every timer number in this runbook (90 s gesture window, 300 s claim TTL, about 480 s claimable, 900 s window, 120 s verify budget) is the old default from `dev` 05c41d1. After his PR, re-read the values from code (`pack.ts` `maxSecondsAfterReveal`, claim TTL and window constants in the engine, `RequestForm.tsx` `windowSec`) and update this file before the test. Do not trust the numbers below until then.

**Real mode is the default on the shared deployments (Helmut, 2026-10-30 evening).** api-dev runs real Gemini vision and real preprod payments so the team finds bugs and UI improvements; fakes remain only for local development and CI. The payment secrets are not yet in the hub env (A-21, A-22, B-14); the pre-flight checks below assume they are.

## 0. Read this first (the five things most likely to hurt)

1. Use `https://api-dev.shelfieapp.fyi/w` on the phones, not `dev.shelfieapp.fyi`. Behind the Vercel rewrite the engine sees one client IP (Vercel's) for every phone: rate limits are per IP (claim 6/min, submit 6/min, other worker calls 90/min, 10 SSE streams) and would be shared by the whole team (unverified; `app.ts` `trust proxy "loopback"`). SSE through Vercel is also unmeasured (D-32). The api host serves the same web build, same origin, real client IPs.
2. Raise the x402 run cap before the real switch: `VERIFY_RUN_CAP_LOVELACE=200000000`. Each stored receipt counts 2 tADA (the per-payment cap) against the default 50 tADA, so the engine refuses to pay after about 25 verifications in total, across restarts (`verify-client.ts` constructor, `reserve()`). Symptom: every submission ends "Not accepted / We could not verify this photo" with `reason: run_cap_reached`.
3. Stop auto-update during the test (`systemctl --user stop shelfie-update@dev.timer`) and tell the team not to push to `dev`. A deploy runs `npm ci` and `npm run check` on the laptop, then restarts engine and verifier. A restart during an x402 payment freezes that key as `payment_uncertain`.
4. Pre-grant camera and location on every phone before the first claim. The 90 s hand-sign window starts when the camera sheet opens, in parallel with the permission prompts (`CameraSheet.tsx` reveal effect), so a slow prompt eats the window.
5. Do not touch a product inside the 8-minute rule: a job stops being claimable 480 s after creation (window 900 s minus claim TTL 300 s minus verify budget 120 s). Create jobs just before use, or create them with `windowSec` via curl (section 3).

## 1. Pre-flight checklist

### T-30 min (Helmut, at the laptop)

| # | Check | Command / expected |
|---|---|---|
| 1 | Laptop on power, sleep off, lid open or external display; Wi-Fi stable (or tether) | `systemd-inhibit --what=sleep:idle --who=shelfie --why=fieldtest sleep 4h &` (keep it running), idle lock off; battery > 80% |
| 2 | Services active | `systemctl --user is-active shelfie-tunnel.service shelfie-engine@dev shelfie-verifier@dev shelfie-update@dev.timer` -> four `active` |
| 3 | Deployed commit is the one you want | `cat ~/.local/state/shelfie/dev.status`; `curl -s https://api-dev.shelfieapp.fyi/version.json` |
| 4 | Health | `curl -s https://api-dev.shelfieapp.fyi/api/health \| jq` -> `ok:true`, `fakes.payments:false`, `fakes.verifier:false`, `verifier:"up"`, `wallets.pay.balanceLovelace` above 100000000 (100 tADA). `wallets.vbuy.balanceLovelace` is hard-coded `"0"` in real mode (`wiring.ts`, TODO), ignore it and use fund-check |
| 5 | Verifier sees its vision config | `curl -s http://127.0.0.1:4121/health` -> `visionConfigured:true`; `curl -s http://127.0.0.1:4121/v1/price` -> amount `1000000`, `payTo` = W-SELL |
| 6 | Real env keys present (names only, never print values) | `grep -E '^(FAKE_PAYMENTS\|VERIFIER_PAYMENT\|VERIFY_CLIENT\|VERIFIER_MODE\|VERIFY_RUN_CAP_LOVELACE\|VISION_RUN_CAP\|PAYOUT_DAILY_CAP_LOVELACE\|LOCATION_CHECK\|X_ENGINE_TOKEN_REQUIRED\|NODE_ENV)=' ~/.config/shelfie/dev.env` -> `0`, `on`, `real`, `live`, `200000000`, `200`, `50000000` (or more), `on`, `true`, `production`. The verifier refuses `NODE_ENV=production` with `VERIFIER_PAYMENT=off`, so with the fake template the verifier may be down and hidden by the fake client |
| 7 | Wallet balances | `cd ~/shelfie-deploy/dev/current/codigo && node --env-file=$HOME/.config/shelfie/dev.env --import tsx scripts/fund-check.ts` (needs `WALLET_ADDRESS_VBUY/PAY` in dev.env). Needed: see table below |
| 8 | Gemini works | one real call through the verifier dry route is not available in production, so run a known photo as a normal task (see 4.1 step 1) before the team arrives. Check quota in AI Studio (requests per minute and per day); a 429 shows as `vision client failed ... status:429` |
| 9 | Backup vision client | If `VISION_FALLBACK_*` is set: the fallback is built as an OpenAI client (`max_completion_tokens`, JSON mode, no temperature). Whether Gemini's OpenAI endpoint accepts that is unverified: stop the primary key once on purpose (wrong key in a copy of the env) and confirm `willFallback:true` then a verdict |
| 10 | Operator token stays on one device | Dashboard keeps it in memory only: a reload loses it. Keep the dashboard tab open on the laptop; a second device only via password manager |
| 11 | Cloudflare tunnel | `curl -s -o /dev/null -w '%{http_code}\n' https://api-dev.shelfieapp.fyi/api/health` -> 200 from a phone on mobile data, not only from the laptop |
| 12 | Freeze deploys | `systemctl --user stop shelfie-update@dev.timer`; announce "no push to dev until the test ends" |
| 13 | Evidence mode | `ALLOW_TEST_UPLOAD=false`, `ALLOW_DEMO_OVERRIDE=false`. Note the start time (UTC) for `evidence-preflight.ts --since` |

### T-5 min (each tester, on the phone)

| # | Check |
|---|---|
| 1 | iPhone: Safari (not an in-app browser from WhatsApp, Instagram, Mail: those often have no camera API and the app then shows the "camera is blocked" text). Android: Chrome |
| 2 | URL is `https://api-dev.shelfieapp.fyi/w`, tab not private (private tabs lose the stored address and consent) |
| 3 | iPhone: Settings > Privacy > Location Services > Safari Websites = While Using and Precise Location ON; Safari > Camera = Allow (or Ask, then allow once and keep the tab); Low Power Mode off; Screen Time/Focus not blocking |
| 4 | Android: Chrome site settings: Location precise, Camera allow; battery saver off |
| 5 | Mobile data on (store Wi-Fi is not ours); airplane mode off; brightness up; auto-lock 5 min; battery > 50% |
| 6 | Open the app, accept consent, enter the payout address (copy/paste, starts with `addr_test1`), one distinct address per phone (the engine refuses a second active claim for the same address) |
| 7 | Grant permissions now: claim any test task, open the camera, accept camera and location, give the task back |
| 8 | Standing in the store, the location line in the camera sheet reads "Location ok, accuracy N m" with N below 100 before you start |

### Wallet amounts for N runs

Per verified submission (pass or fail): 1 tADA to W-SELL plus about 0.17 tADA fee from W-VBUY (`tx-hashes.md`: fee 0.1686). Per PASS: 3 tADA plus about 0.17 fee from W-PAY. A failed verification costs the 1.17 tADA but no payout. A vision outage (HTTP 503 from the verifier) costs nothing: x402 cancels settlement on any response of 400 or higher.

| Plan | Submissions | PASS | W-VBUY | W-PAY | Caps hit? |
|---|---|---|---|---|---|
| Quick check | 8 | 4 | 9.4 tADA | 12.7 tADA | no |
| Full script 4.1 | 20 | 8 | 23.4 tADA | 25.4 tADA | no |
| Stress | 40 | 16 | 46.8 tADA | 50.7 tADA | payout daily cap 50 tADA = 16 payouts: queue pauses on the 17th |

Balances on 2026-10-30 (`verified.md`): W-PAY about 10,000 tADA, W-VBUY about 9,600 tADA, so funds are not the limit. The limits are the daily payout cap (UTC day), the x402 run cap (item 2 above), `VISION_RUN_CAP=200` (resets when the verifier restarts) and the Gemini quota.

## 1b. Before leaving for the store

Tick every line before anyone leaves. People: Isabel owns env and payments, Fernando wallets and tx logging, Lorenz verifier and timers, Helmut hub laptop, dashboard and recording.

| # | Item | Who | Done when |
|---|---|---|---|
| 1 | Real switches verified by Helmut in `~/.config/shelfie/dev.env`: `FAKE_PAYMENTS=0`, `VERIFIER_PAYMENT=on`, `VERIFY_CLIENT=real`, `VERIFIER_MODE=live`, `VERIFY_RUN_CAP_LOVELACE=200000000` (values never printed or pasted) | Helmut; secrets from Isabel (A-21) | `curl -s https://api-dev.shelfieapp.fyi/api/health \| jq` shows `fakes.payments:false`, `fakes.verifier:false` |
| 2 | Wallets funded: W-PAY (payouts) and W-VBUY (verifier fees) at least 100 tADA each, more than the "Wallet amounts" table needs | Isabel (A-22) and Fernando | `fund-check.ts` output pasted into `codigo/docs/verified.md` |
| 3 | Gemini primary `gemini-3.5-flash-lite` and the Gemini backup each tested once with a known photo (see item 8 and 9 of the T-30 table) | Lorenz with Helmut | one verdict from each, `visionConfigured:true` |
| 4 | Timers re-read from code after Lorenz's PR (C-17) and this runbook's numbers updated | Lorenz | no old 90/300/480/900 value left in this file unless it still matches code |
| 5 | Auto-update timer paused: `systemctl --user stop shelfie-update@dev.timer`; team told not to push to `dev` | Helmut | timer inactive |
| 6 | Phones use `https://api-dev.shelfieapp.fyi/w`, not `dev.shelfieapp.fyi` (rate limits are per IP behind Vercel, D-32 unmeasured) | all testers | URL checked on each phone |
| 7 | Camera and location granted on each phone (T-5 table), one distinct payout address per phone ready to paste (`addr_test1...`) | each tester | location line reads "Location ok" |
| 8 | Operator token loaded on the dashboard device (laptop tab stays open; a reload loses it) | Helmut | dashboard shows jobs and ledger |
| 9 | Jobs created just before use (or with a long `windowSec`, section 3) | Helmut | tasks visible in the feed |
| 10 | Tx logging ready: every tx hash from the test goes into `codigo/docs/evidence/tx-hashes.md` with an explorer screenshot; `evidence-preflight.ts` run | Fernando | script output clean |
| 11 | Recording: hub laptop on power, OBS tested, dashboard visible | Helmut | test clip exists |

Funds: the client side (the brand) needs no funds for the direct dashboard path. Money moves only from W-PAY (payouts to workers) and W-VBUY (x402 verifier fees). The Sokosumi path needs test USDM or credits in the buyer account (a paid Task cost 100 credits, 16 were left on 2026-10-30, `ai-log.md`): verify the balance before relying on that path. This is not checked yet.

## 2. Failure catalogue

"Who": H = Helmut at the laptop, T = tester on the phone, F = Fernando (payments), L = Lorenz (verifier/vision), I = Isabel (engine/shell). Messages are the exact text from `messages.ts` / `labels.ts`; `jq` filter for the log column: `journalctl --user -u shelfie-engine@dev -o cat -f | jq -c 'select(.errorCode=="X")'`.

### 2.1 Open app, onboarding, address

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| "Service busy, your task is kept; try again." on the feed, nothing loads | none on the engine; client `dependency_unavailable` "Cannot reach the server." | Phone offline, tunnel down, laptop asleep | Phone: toggle data. H: `systemctl --user status shelfie-tunnel.service`, health curl from mobile data | T, H |
| "Request failed (502)." / Cloudflare error page | no engine line | Tunnel or engine down, restart in progress (auto-update) | Wait 10 s; `systemctl --user restart shelfie-engine@dev` | H |
| "Host not allowed." (HTTP 421) | `errorCode forbidden` | Host header not in `PUBLIC_BASE_URL`/`ALLOWED_HOSTS` (Vercel not forwarding Host, custom hostname) | Use `api-dev.shelfieapp.fyi/w`; add the host to `ALLOWED_HOSTS`, restart engine | H |
| "Cross-origin request refused." on claim/submit | `errorCode forbidden` | Opened from a Vercel preview URL or a host not in `ALLOWED_ORIGINS` | Use `api-dev.shelfieapp.fyi/w` or `dev.shelfieapp.fyi` | T |
| "Open the secure link to take the photo." | client only | Page opened over `http://` | Open the https URL | T |
| "The camera is blocked. Allow the camera for this site ..." though permission is fine | client `CameraError "unsupported"` shares this text | In-app browser (WhatsApp, Instagram), or `getUserMedia` missing | Open the link in Safari/Chrome | T |
| "Request does not match the expected schema." or "Unexpected response from the server." | `errorCode input_schema_violation` / client `internal` 502 | Stale cached web build while the engine already runs a newer contract (Vercel and the laptop deploy separately) | Hard reload; freeze deploys (checklist 12) | T, H |
| "That is not a Cardano preprod address. It starts with addr_test1." | `invalid_payout_address` (claim) | Typo, mainnet `addr1...`, truncated paste | Re-paste from the wallet; one address per phone | T |
| "Finish or give back your current task first." | `claim_already_active` | Same worker or same payout address has an ACTIVE claim (second phone with the same address, closed tab) | Give the task back, or wait up to 300 s for expiry; second phone uses another address | T |
| App asks for consent and address again every reload | client storage | Private tab or cleared site data | Normal tab; re-enter once | T |

### 2.2 Feed and live updates

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| "No tasks in Munich right now. New ones appear here as they arrive." | `GET /api/tasks` 200 empty | No job created; every open task was already claimed or its job closed; phone coarse location outside the Munich box (city `__none__`) | H: create a job (dashboard or curl); T: check location permission and that the phone reports Munich | H, T |
| "Allow location (city level) to take this task. It is only used to check the city." on the feed | `location_required` 403 | Location denied/off or timed out (8 s) at start | Allow location, pull to reload | T |
| New tasks appear only after a manual reload or after several seconds | SSE status `reconnecting`; polling every 3 s | Stream cut (tunnel restart) or buffered by the Vercel rewrite (unverified) | Use the api host; the feed now also reconciles every 15 s while the stream looks open (`hooks.ts`) | T |
| "Too many requests, wait a moment." | `rate_limited` 429, `Retry-After` | Shared IP behind Vercel (worker 90/min counts feed polls, reveal, release, result polling every 2 s per phone) | Switch to the api host; wait 60 s | T, H |
| "Too many open streams." | `rate_limited` | More than 10 open SSE connections from one IP (dashboards + phones behind one IP, or tabs that reconnect) | Close extra tabs; api host | T |
| Task visible although the tester is far from the store | by design | The feed is city-level only; the geofence applies at the shutter | none | - |

### 2.3 Claim

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| "Another worker was faster." | `task_not_open` 409 | Race lost, or task already claimed | Pick another task; expected in test 4.1 #7 | T |
| "Too late to start this task." | `claim_window_closed` 409 | Job older than 480 s | H creates a fresh job | H |
| "Allow location (city level) ..." | `location_required` | Claim sent without location | Allow location, retry | T |
| "This task is in Munich; you appear to be elsewhere." | `wrong_city` 403 | Coarse fix outside the Munich box, or stale 60 s cached fix | Wait for a fix, retry | T |
| "Too many requests, wait a moment." on Take this task | `rate_limited` (claim 6/min per IP) | Many testers claiming at once behind one IP | api host; stagger by 10 s | T |

### 2.4 Hand sign (gesture), late reveal, screen gate

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| Camera sheet says "Loading your hand sign…", shutter disabled | `POST /api/claims/{id}/challenge`; revealError text under the video | Request failed (network, rate limit) or still in flight | Close and reopen the sheet: the call is idempotent and returns the same sign and deadline | T |
| Countdown hits 0 and the app returns to the feed ("Claim expired, take the task again.") | `claim_expired`; verifier `challenge_stale` if it was uploaded | 90 s from reveal ran out: permission prompts, slow GPS, long look at the preview, slow upload (the clock stops at server receipt) | Pre-grant permissions; shoot within 30 s, tap "Use photo" at once | T |
| "Open the camera first to see your hand sign." | `challenge_not_revealed` 409 | Submit before the reveal call succeeded | Reopen the camera sheet, wait for the sign | T |
| "We could not see the hand sign you were given. Keep your hand and the tag in frame and try again." | verifier gate `code_match`: `gesture_missing`, `gesture_mismatch`, `gesture_low_confidence` | Hand outside the frame or covering the tag; wrong finger count (thumb counts, folded fingers); wrong side (side is as seen in the photo); motion blur; gloves; model misread (unmeasured: `gemini-3.5-flash-lite` on gestures, ai-log C-16) | Hand flat at tag height, fingers spread, 2 s still, tag fully visible. The rejection never names the sign | T |
| "The photo came too late after the hand sign was shown. Take the task again." | `challenge_stale` (timing) | Photo received more than 90 s after the reveal | Retake faster; check mobile upload speed | T |
| "This looks like a photo of a screen. Photograph the real shelf." | `screen_recapture` (not_screen) | Real cheat attempt, or a false positive: electronic shelf labels (LCD/e-ink tags), a lit freezer door display, glare moiré | Choose a product with a paper tag; if false positives repeat, kill switch is a pack change (`pack.ts` `not_screen enabled:false`) plus a deploy | T, L |
| Rejected although hand and tag were fine | gate order: `image_ok`, `code_match`, `not_screen`, `readable`, ... | Only the first failed gate is shown | Read `failedGates` in the verifier log line `verify` | H, L |

### 2.5 Camera capture

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| "The camera is blocked. Allow the camera for this site in the browser settings, then open the camera again. There is no upload alternative." | client | iOS asks again per page load or "Deny" was tapped; Android permission off | iOS: aA menu > Website Settings > Camera > Allow; reload. Android: padlock > Permissions | T |
| "No camera was found on this device." | client | `NotFoundError` or constraints not satisfiable | Another browser | T |
| Black video on iPhone | client | Another app holds the camera (FaceTime, screen recording), Low Power Mode | Close the other app, reopen the sheet | T |
| "The photo could not be taken. Try again." | client | Shutter before the first video frame (`videoWidth` 0) or canvas encode failed (low memory) | Wait one second after the preview appears; close other tabs | T |
| Photo too blurry/dark to read | `readable` fails: `price_unreadable`/`low_confidence`; or `image_blank` | Indoor light, glare on the price tag, hand shake. There is no torch control in the app | Step back 30 cm, angle 15 degrees off the tag to avoid glare, steady against the shelf | T |
| Every photo rejected as unusable on one phone | `image_not_decodable` or gate `image_too_small` | Phone delivered 640x480 (browser default) before the HD request was added in this branch | Fixed in `lib/camera.ts` (asks 1920x1080); confirm on each phone with `userAgent` and `width/height` in the submission journal | H |

### 2.6 Upload, size, format

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| "The photo could not be used. Retake it." | `image_too_large` 413 (over 2,000,000 bytes) or `image_not_decodable` 422 (not JPEG, short side < 600, long side < 800 or > 4096) | Very detailed scene; unusual camera size | Retake; the app sends canvas JPEG at quality 0.85, longest side 1600 (HEIC never reaches the server) | T |
| "Request failed (413)." | client, no engine line | A proxy limit before the engine (Vercel body limit unverified) | api host; test one real photo through the chosen URL in pre-flight | H |
| Spinner "Sending…" then "Service busy, your task is kept; try again." | engine `requestTimeout` 30 s (the body must arrive in 30 s) | Weak mobile data in the store | Move to better signal; retake (about 0.5 to 1 MB per photo) | T |
| "This photo was already used." | `duplicate_image` 422 | Same bytes resubmitted (rare: each canvas capture differs) | Retake | T |
| "Use the in-app camera." | `capture_mode_not_allowed` | Not `getUserMedia` (only if someone scripts the call) | n/a | - |

### 2.7 Location precheck at submit (before any verifier call, no fee, no attempt)

Rule (`geo.ts`): pass if `distance <= 150 + min(accuracy, 100)`; `location_inaccurate` if accuracy > 300 m or the fix is older than 30 s; 3 failures release the claim.

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| "You are about N m from the store. Move closer and shoot again." | `location_mismatch` 422, `details.distanceM/allowedM/triesLeft`; ledger `LOCATION_CHECKED` | Indoors GPS drift (a supermarket often reads 30 to 120 m, worse near walls), wrong store job, tester outside | Walk to the shelf, wait 10 s, shoot again. H checks the ledger note for `distanceM` and `allowedM` | T, H |
| "Weak location signal. Wait a few seconds or step outside, then shoot again." | `location_inaccurate` 422 | Accuracy above 300 m (iOS Precise Location off gives km), or fix older than 30 s. The age counts the time since the shutter, so staring at the preview for 30 s fails and the photo is discarded | Precise Location on; tap "Use photo" within a few seconds; otherwise retake | T |
| Claim suddenly gone after 3 tries | `details.claimReleased:true`, next call `claim_expired` | Three failed location checks | Take the task again | T |
| Job for REWE passes while standing in the Lidl next door | no error | REWE and Lidl are 13 m apart; the geofence cannot separate them | The test lead states the store; product and price decide | H |
| HoC job fails from inside REWE (and the reverse) | `location_mismatch` | HoC to REWE is 254 m; the maximum allowance is 250 m | expected | - |
| Location "ok" at claim, "off" at shutter | `location_required` | Permission revoked mid-session | Re-allow | T |

### 2.8 Verification: x402 payment, vision, retries

What the tester sees: "Checking your photo ... This can take up to a minute." Then either a verdict or, after the engine gave up, "Not accepted / We could not verify this photo." with "Try again (new code)" (the button text is stale; it opens a new claim). The task is reopened and the attempt is not consumed (`verifyErrorFinal`).

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| Spinner longer than 60 s, then "We could not verify this photo." | engine `verify_transport_error {attempt, code}` x3 then `verify_error_final`; ledger `ADMIN_ACTION verify_error_final operatorAlert` | Any row below | Tester retakes; H reads the verifier log | H |
| same | verifier `vision client failed {reason:"timeout"}` | Gemini slower than 20 s (`VISION_TIMEOUT_MS`); only `gemini-3.5-flash-lite` answered in tests (mean 8.5 s, p95 13.2 s, `verified.md`) | Wait; do not change model mid-test; raise `VISION_TIMEOUT_MS=30000` and restart verifier if p95 grows | L |
| same | `vision client failed {status:429 or 503, providerMessage}` | Quota or "high demand" | Fallback is tried automatically if configured; else pause testers 60 s | L |
| same | `vision client failed {status:404}` or 400 | Wrong model id, or the fallback rejects `max_completion_tokens` | Fix env, restart verifier | L |
| same | `vision reply is not JSON` / `vision reply failed schema` / `extraction failed schema` | Model returned prose or off-schema JSON; corrective retry already used | Retake; if repeated, see model in env | L |
| same | verifier 503 `vision_unavailable`, `details.reason:"run_cap_reached"` | `VISION_RUN_CAP` (200) used up in this verifier process | `systemctl --user restart shelfie-verifier@dev` (resets the counter), raise the cap | H |
| same | engine/payments log `verify run spend cap reached`, `details.reason:"run_cap_reached"`, `paymentSent:false` | x402 run cap, see section 0 item 2 | Raise `VERIFY_RUN_CAP_LOVELACE`, restart engine | H |
| same | `verify payment outcome unclear, key frozen`, `reason:"payment_uncertain"` | Connection lost or a 402 after signing, or a restart during payment | Look at W-VBUY on the explorer for that time; the next photo uses a new key and pays again; frozen keys are never re-signed | F |
| same | `reason:"payment_refused"` (402, `payment_required`) | Facilitator offered a different price/network than `VERIFY_MAX_PRICE_LOVELACE` allows, or `SELLER_ADDRESS` mismatch | Compare `/v1/price` with env; restart | F |
| same | `reason:"network_or_timeout"` | Verifier down (crash loop), or W-VBUY empty/unsignable (reported as "unreachable"), or hosted facilitator down | `systemctl --user status shelfie-verifier@dev`; fund-check; try again | H, F |
| same | `reason:"missing_payment_receipt"` / `settlement_not_confirmed` | Facilitator did not return a settlement header | Check explorer; do not resend payments by hand | F |
| Verdict arrives after a long wait | `payments` timeout 120 s per attempt | 1-confirmation settlement took 96 s in M1; with `l1Confirmations:0` it is fast, but depends on the hosted facilitator | none; keep `15df7ec` behaviour | F |
| After a restart, a submission sits in "Checking" | `engine.resume()` re-runs unfinished verifications; a payment that was mid-flight becomes unclear | Deploy or crash during verify | Wait 2 minutes; if ERROR_FINAL, retake | H |
| Pass verdict shows "Not accepted" with the text "Verified. Payment is on its way." | ledger `ADMIN_ACTION late_verdict` | Verdict arrived after the job window closed; a decision never flips | Avoid late claims (cutoff 480 s makes this rare); explain to the tester | H |

### 2.9 Gate reason codes (first failed gate decides the message)

Each failure uses one of 3 attempts and 1 tADA of verify fee. Product text is matched on name tokens (score 0.8) or a valid EAN-13 barcode if readable.

| Gate / code | User sees | Likely cause in a store | Fix |
|---|---|---|---|
| `image_ok`: `image_undecodable`, `image_too_small`, `image_too_large`, `image_blank` | "The photo could not be used. Take a new one." | Covered lens, black frame, tiny image | Retake |
| `readable`: `price_unreadable` | "The price tag is not readable. Move closer and avoid glare." | Price not parsed (no EUR amount, only a per-kg or deposit line, glare), non-EUR currency | Frame the main price, avoid Grundpreis (price per litre) as the biggest number |
| `readable`: `product_unreadable`, `low_confidence` | same | Name cropped, confidence below 0.6 | Show the whole tag |
| `product_match`: `product_mismatch`, `ean_mismatch` | "This does not look like {product}. Check that you are at the right product." | Wrong product; tag name differs from catalog name and aliases; two products in frame (a barcode of the neighbour is read and wins over the name) | One tag per photo; add the shelf wording as alias in `products.json` |
| `price_sanity`: `price_format`, `price_out_of_range`, `price_deviates_from_reference` | "That price looks wrong. Check the tag again." | More than two decimals read, price outside the product band (Coca-Cola 1.29 to 1.89, Nutella 2.79 to 3.99, Barilla 1.69 to 3.99, Red Bull 0.88 to 1.99; no band means 0.20 to 60) | A real REWE price can sit above the researched band: check the band before the test, adjust `products.json` |
| `timing`: `submitted_too_early` | "Your claim expired. Take the task again." (wording is wrong for this case) | Photo less than 5 s after the claim | Wait; do not script |
| `timing`: `claim_expired`, `window_closed` | same | Claim over 300 s, or job window over | New claim |
| `not_duplicate`: `duplicate_image`, `near_duplicate_image` | "This photo was already used." | Same photo twice, or a near-identical photo of a task that already passed in this job | Different angle |
| OOS `label_visible`: `label_not_visible`, `label_unreadable` | "The shelf label is not readable. Take the photo again with the label in frame." | Label missing, glare, too far | Closer |
| OOS `label_match`: `label_product_mismatch`, `label_ean_mismatch` | "This label is for another product. Find the label of {product}." | Empty slot belongs to a different product | Pick the right slot |
| OOS `slot_empty`: `product_present`, `slot_not_empty`, `facing_not_in_frame` | "A product is visible at this spot. If it is there, use the normal price photo." | Product still there, or the space above the label is cropped | Include label plus the empty space above it |

### 2.10 Decision, window, payout, ledger

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| "Verified" but "Payment pending" for minutes | payout QUEUED or SUBMITTED; polls every 3 s, confirmations on preprod take about 20 to 60 s | Normal; or queue paused | `curl -s 'https://api-dev.shelfieapp.fyi/api/payouts?jobId=JOB' \| jq` | H |
| "Payment pending" never ends | log `payout queue paused {reason}`; ledger `ADMIN_ACTION payout_queue_paused operatorAlert` | `insufficient_funds` (balance < amount + 0.5 tADA), `daily_cap_reached` (50 tADA = 16 payouts per UTC day), `balance_check_failed` (Blockfrost), `persist_failed` | There is no HTTP resume. Fund the wallet or raise `PAYOUT_DAILY_CAP_LOVELACE` in dev.env, then `systemctl --user restart shelfie-engine@dev`; QUEUED payouts continue on start | H, F |
| Second of two quick payouts is late by 2 to 3 minutes | log `payout send failed` then UNKNOWN, reconcile after the 120 s settle delay | Back-to-back sends from one wallet: Blockfrost lists only confirmed UTxOs, so the second transaction may reuse the first one's input (unverified, not exercised by B-07) | Wait; `POST /api/admin/payouts/{id}/reconcile`; never resend by hand. Test it in 4.1 #9 | F |
| "Payment pending" with state UNKNOWN | log `payout submit outcome unknown` | Submit timeout or network cut | Auto-reconcile every 30 s after the settle delay; or reconcile via admin | F |
| "Payment delayed. The operator will fix it." | payout FAILED_FINAL after 3 attempts | Repeated build/submit failures | `POST /api/admin/payouts/{id}/retry`; `mark-paid` only after seeing the tx on the explorer (it is flagged `operatorMarkedPaid`, not evidence) | F |
| Payout went to a wrong but valid address | none | Address typed wrong | Not reversible; compare the printed address with the tx output on the explorer before the next run | T |
| Dashboard shows red wallet banner for W-VBUY although it is funded | `vbuy` balance reported `"0"` in real mode | `wiring.ts` TODO | Ignore; use fund-check | H |
| Job shows WITHHOLD | `reason:"no_passing_photo"` | Window closed with no PASS (expected for scenario 4.1 #8) | n/a | - |
| Ledger stream empty on dashboard | `/api/ledger/stream` | SSE cut; dashboard falls back to polling every 3 s | Reload dashboard (re-enter token) | H |

### 2.11 Infrastructure

| User sees | Code / log | Likely cause | Fix on the spot | Who |
|---|---|---|---|---|
| Everything fails at once | no engine log lines | Laptop slept, Wi-Fi changed, tunnel dropped | `systemctl --user restart shelfie-tunnel.service` (do not restart it for fun mid-demo); check power/sleep inhibitor | H |
| Engine restarts by itself | `journalctl --user -u 'shelfie-update@*'` shows a deploy | Auto-update picked up a push (the timer is every 60 s) | Stop the timer in pre-flight | H |
| Slow responses while a deploy builds | CPU busy (`npm ci`, `npm run check`) | Auto-update | Same | H |
| Dashboard 401 "The operator token was not accepted." | `unauthorized`; 20 failures lock the IP for 10 minutes (`rate_limited`) | Wrong token, or reload lost it | Re-enter; wait out the lock or restart the engine | H |
| Admin call "Reset is refused" | `forbidden` | `NODE_ENV=production` / evidence lock | By design; do not reset real data | - |
| Journal shows 0 images or disk full | `ENOSPC` in journal | Full disk | `df -h ~/.local/share/shelfie`; photos are about 0.5 MB each | H |

## 3. Live debugging commands (Helmut's laptop)

```bash
# status
systemctl --user is-active shelfie-tunnel.service shelfie-engine@dev shelfie-verifier@dev shelfie-update@dev.timer
curl -s https://api-dev.shelfieapp.fyi/api/health | jq
curl -s https://api-dev.shelfieapp.fyi/version.json; cat ~/.local/state/shelfie/dev.status

# errors as they happen (engine writes JSON lines; errorCode only on error responses)
journalctl --user -u shelfie-engine@dev -o cat -f | jq -c 'select(.errorCode)'
journalctl --user -u shelfie-engine@dev -o cat -f | grep errorCode          # raw
journalctl --user -u shelfie-engine@dev -o cat -f | jq -c 'select(.errorCode=="location_mismatch" or .errorCode=="location_inaccurate")'
journalctl --user -u shelfie-engine@dev -o cat -f | jq -c 'select(.msg|test("verify_|payout|challenge_|task_claimed|submission_received|job_decided"))'
journalctl --user -u shelfie-engine@dev -o cat -f | jq -c 'select(.msg|test("spend cap|outcome unclear|queue paused|payout (send|failed)|needs an operator"))'
# verifier: one line per verdict (failedGates, provider) and every vision problem
journalctl --user -u shelfie-verifier@dev -o cat -f | jq -c 'select(.msg=="verify" or .level=="warn" or .level=="error")'

# admin token without printing it
ADMIN=$(grep '^ADMIN_TOKEN=' ~/.config/shelfie/dev.env | cut -d= -f2-)
curl -s -H "X-Admin-Token: $ADMIN" https://api-dev.shelfieapp.fyi/api/jobs | jq
curl -s -H "X-Admin-Token: $ADMIN" "https://api-dev.shelfieapp.fyi/api/jobs/JOB/decision?waitSec=0" | jq
curl -s "https://api-dev.shelfieapp.fyi/api/payouts?jobId=JOB" | jq
curl -s "https://api-dev.shelfieapp.fyi/api/ledger?afterSeq=0&limit=50" | jq -c '.entries[]|{seq,kind,txHash,note}'
curl -s "https://api-dev.shelfieapp.fyi/api/submissions/SUB" | jq     # verdict, gates, failedGates, payout
# admin payout actions: POST /api/admin/payouts/{id}/reconcile | retry | mark-paid  (header X-Admin-Token)

# create a job with a long window (default dashboard window 900 s means claimable for 480 s only)
curl -s -X POST https://api-dev.shelfieapp.fyi/api/jobs -H "X-Admin-Token: $ADMIN" -H 'content-type: application/json' \
  -d '{"packId":"shelf-check","source":"demo","externalRef":"field-'$(date +%s)'","input":{"productEan":"EAN","stores":[{"id":"rewe-81671-august-everding-strasse-20"}]},"windowSec":3600}' | jq
# close a window now (forces WITHHOLD when nothing passed)
curl -s -X POST -H "X-Admin-Token: $ADMIN" https://api-dev.shelfieapp.fyi/api/admin/jobs/JOB/finalize | jq

# balances (public addresses only)
cd ~/shelfie-deploy/dev/current/codigo && node --env-file=$HOME/.config/shelfie/dev.env --import tsx scripts/fund-check.ts

# restart / pause / resume
systemctl --user restart shelfie-verifier@dev shelfie-engine@dev
systemctl --user stop shelfie-update@dev.timer      # during the test
systemctl --user start shelfie-update@dev.timer     # afterwards
~/.local/share/shelfie/bin/auto-update.sh dev --force   # deploy now (only outside the test)
```

Switch back to fakes in about 30 s (prepare once, before the test): keep `~/.config/shelfie/dev.env.real` and `dev.env.fake`; the fake file sets `FAKE_PAYMENTS=1`, `VERIFY_CLIENT=fake`, `VERIFIER_PAYMENT=off` for the engine and uses separate paths (`STORE_PATH`, `LEDGER_PATH`, `PAYOUT_STORE_PATH` under `~/.local/share/shelfie/dev-fake/`) so the real ledger stays clean. Then `ln -sfn dev.env.fake ~/.config/shelfie/dev.env && systemctl --user restart shelfie-engine@dev` (the verifier is not needed with the fake client; do not set `VERIFIER_PAYMENT=off` for the verifier while `NODE_ENV=production`, it refuses to start). Back: `ln -sfn dev.env.real ...` and restart. Fake runs are never evidence.

## 4. Test script for the store

Run order matters: each job is one task with 3 attempts. Create one job per scenario, a few minutes before use. Record every tx hash right away with the `log-evidence` skill (`/log-evidence M2 "<what>" <hash>`), which appends to `codigo/docs/evidence/tx-hashes.md`; copy hashes from the app or `/api/payouts`, never retype from memory.

### 4.1 REWE scenarios

| # | Scenario | Setup | Expected | Check |
|---|---|---|---|---|
| 1 | Calibration shot (before the team arrives) | Helmut alone, one catalog product with a paper tag, correct hand sign | PASS, "Verified", payout 3 tADA, tx hash on the explorer | verifier `verify` line `pass:true`, W-PAY drops 3.17 tADA, tx hash logged |
| 2 | Wrong hand sign | Show a different finger count than the sign | FAIL `gesture_mismatch`, attempts 2 left, no payout | message "We could not see the hand sign ..." (does not name the sign) |
| 3 | No hand in frame | Tag only | FAIL `gesture_missing` | same message |
| 4 | Blurry / glare | Move the phone during the shot, or shoot at the glare | FAIL `price_unreadable` or `low_confidence`, no payout | "The price tag is not readable ..." |
| 5 | Wrong product | Claim product A, photograph the tag of product B | FAIL `product_mismatch` | "This does not look like ..." |
| 6 | Outside the geofence | Phone in the car park (> 250 m), shoot | 422 `location_mismatch`, no verifier call, no fee, attempts unchanged, `triesLeft` 2 | ledger `LOCATION_CHECKED` note with distance |
| 7 | Two phones race | Two testers tap "Take this task" on the same task together | One 201, the other "Another worker was faster." and the task leaves the second feed | `task_not_open` in the log |
| 8 | Release and re-claim | Claim, give back, other phone claims | Task returns to every feed; second claim works | `TASK_OPENED` in the ledger |
| 9 | Two PASS within 30 s (payout contention) | Two phones, two jobs, both pass within 30 s | Two payouts, the second may be late up to 3 minutes; exactly two different tx hashes, no duplicate | `/api/payouts`, states end CONFIRMED |
| 10 | Out of stock | Only if the shelf really has an empty facing of a catalog product: "Product not on the shelf", label plus empty space plus hand | PASS `OUT_OF_STOCK`, payout 3 tADA | verdict outcome OUT_OF_STOCK. Do not remove goods from shelves; otherwise rehearse this at HoC |
| 11 | Product on shelf but OOS path | OOS mode with the product present | FAIL `product_present` | "A product is visible at this spot ..." |
| 12 | Screen cheat | Photograph a laptop showing the tag | FAIL `screen_recapture` | "This looks like a photo of a screen ..." |
| 13 | Window expiry | Job with `windowSec` 500 (claimable 80 s), nobody claims; or use `/api/admin/jobs/JOB/finalize` | Decision `WITHHOLD`, `reason:"no_passing_photo"`, no payout | `GET /api/jobs/JOB/decision` |
| 14 | Late location after 3 failures | Fail the location check three times | Claim released, then "Claim expired, take the task again." | `claimReleased:true` |
| 15 | Slow network | Throttle phone to 3G (iOS Developer/Android data saver) and shoot | Either verdict or "Service busy ..."; note the seconds from tap to verdict | measure against the 90 s window |

For each scenario write one line: time, phone, product, store, job id, expected, actual, error code, tx hash.

### 4.2 After the test

1. `systemctl --user start shelfie-update@dev.timer`.
2. Collect `journalctl --user -u shelfie-engine@dev --since "2 hours ago" -o cat | jq -c 'select(.errorCode)' > ~/field-errors.jsonl` (the log has no PII, no image data, no IPs).
3. Count: submissions, PASS, FAIL by `failedGates`, `location_*` codes, `rate_limited`, `verify_error_final`, payouts CONFIRMED.
4. Photos in `~/.local/share/shelfie/dev/images/` are personal data: delete after the event (`scripts/purge-evidence.ts`, `security.md` 4.9).

## 5. Stage variant: House of Communication

Store `demo-hoc-friedenstrasse-24` (chain DEMO, 150 m). Results are staged shelf checks, never presented as a real supermarket check.

| Item | Detail |
|---|---|
| Props | A table shelf with 3 to 4 catalog products with a valid EAN (Red Bull 0.88 to 1.99, Coca-Cola 1.29 to 1.89, Nutella 2.79 to 3.99, Barilla 1.69 to 3.99); one printed matte tag per product with the price inside its band (`2,49 EUR` style, name 28 pt, price 72 pt, no lamination); a spare tag with a price outside the band; a printed shelf label per product for the out-of-stock path; a laptop with an old tag photo for the screen cheat. No code cards (gesture mode) |
| Phones | Two worker phones on mobile data (not the venue Wi-Fi), pre-granted permissions, payout addresses entered, tabs open on `https://api-dev.shelfieapp.fyi/w`; dashboard on the presenting laptop with the token already entered |
| Jobs | Create them with `windowSec: 3600` via curl (section 3) right before the slot, one per planned run plus two spare. The dashboard form fixes 900 s, so a job made 8 minutes early is no longer claimable |
| What differs | Geofence centre is the venue (48.12755, 11.60937); stand within about 50 m of it. REWE jobs fail here (254 m) and HoC jobs fail at REWE. Indoor accuracy in a conference building can exceed 100 m: check "Location ok, accuracy N m" before going on stage. Light is stage light: avoid spotlights on the tag. The shelf is a table, so no Lidl/REWE ambiguity |
| Happy path (about 90 s) | Claim, camera opens and shows the sign, hold the sign next to the tag, shutter, "Use photo", wait about 15 to 30 s (Gemini p95 13 s plus payment), "Verified", payout tx link, show it on the explorer |
| Cheat demo | 1) Camera at the laptop showing an old tag: `screen_recapture`. 2) Wrong finger count: gesture rejection that does not reveal the sign. 3) Tag of another product: `product_mismatch`. 4) Photo from the gallery: impossible, there is no upload path. 5) Standing outside 250 m: `location_mismatch` before any fee |
| Rollback on stage | If a real run hangs for more than 60 s: say "network", switch to the pre-recorded video; do not debug live. If the backend is gone: `ln -sfn dev.env.fake ... && restart` gives a working fake run with the red banner, and must be called a simulation |
| Before going on | Run one full real PASS at the venue within 30 minutes of the slot (needs data, GPS and Gemini all working there); stop the update timer; battery on laptop and phones |

## 6. Risks found in the code

Ordered by likelihood of hurting the test. Estimates are for one developer including a test. "Done" = implemented in this branch with a test.

| # | Risk | Where | Fix | Est. | State |
|---|---|---|---|---|---|
| R1 | All phones behind the Vercel proxy share one client IP: claim 6/min, submit 6/min, 90 worker calls/min and 10 SSE streams are per IP. Result polling alone is 30 calls/min per phone | `apps/engine/src/http/app.ts:75` (`trust proxy "loopback"`), limits at `:88`, `security.ts` RateLimiter | Short term: test on the api host. Proper: trust Vercel's forwarded client IP (`x-vercel-forwarded-for`) or make the limits env-configurable and raise them for the event | 1 h | proposal |
| R2 | x402 run cap counts every stored receipt at the 2 tADA per-payment cap: after about 25 verifications in total the buyer refuses to pay and every submission ends "could not verify" | `packages/payments/src/verify-client.ts:160-175`, `core/src/env.ts` `VERIFY_RUN_CAP_LOVELACE` default 50 tADA | Set `VERIFY_RUN_CAP_LOVELACE=200000000` (and optionally `VERIFY_MAX_PRICE_LOVELACE=1500000`) in dev.env before the switch; better: store the paid amount in the receipt | env now; 1 h for the code | proposal (env change is Helmut's) |
| R3 | Camera asks for no resolution: phones often deliver 640x480; the engine rejects short side < 600 px and a price tag is unreadable | `apps/web/src/lib/camera.ts:31` | Ask for 1920x1080 ideal | 10 min | done (`camera.test.ts`) |
| R4 | Verifier size gate compared width with 800 and height with 600, so a 720x1280 portrait photo failed `image_too_small` although the engine accepts it | `apps/verifier/src/gates.ts:44` | Compare long side with 800 and short side with 600 | 10 min | done (`gates.test.ts`) |
| R5 | Feed freezes silently if a proxy buffers SSE: the EventSource reports "open", so the 3 s polling fallback never starts | `apps/web/src/lib/hooks.ts` (poll effect returned early on `status === "open"`) | Reconcile every 15 s while open | 15 min | done (`feed.test.ts`) |
| R6 | Photo is discarded and the message is wrong when the preview is looked at for over 30 s: `fixAgeMs` grows after the shutter and the engine answers `location_inaccurate` ("Weak location signal"); `setShot(null)` also drops the photo for network errors | `apps/web/src/worker/CameraSheet.tsx:190` and `:217`; limit `domain-shelf/src/pack.ts:72` | Keep the photo on 503/network errors; take a fresh fix at "Use photo" instead of ageing the old one, or raise `maxFixAgeMs` to 60 s | 1 h | proposal |
| R7 | Hand-sign window starts at sheet open (reveal call) while the camera and location prompts are still showing; first-time iPhone users can lose 20 to 40 of 90 s | `CameraSheet.tsx:74` reveal effect; `pack.ts` `maxSecondsAfterReveal: 90` | Start the reveal after the video has its first frame, or raise to 120 s | 1 h | proposal |
| R8 | Payout queue pause (`insufficient_funds`, `daily_cap_reached`, `balance_check_failed`) has no HTTP or admin way to resume; only an engine restart clears it. Workers see "Payment pending" forever | `packages/payments/src/payout-queue.ts:181` (`resume()` is never called outside tests) | Add `POST /api/admin/payouts/resume` calling `payoutQueue.resume()` | 1 h | proposal |
| R9 | `/api/health` reports W-VBUY as `"0"` whenever payments are real, so the dashboard shows a red banner and nobody can see the buyer balance | `apps/engine/src/wiring.ts:160`, `dashboard/Banners.tsx:24` | Add a balance read for W-VBUY to the payments package and wire it | 2 h | proposal |
| R10 | Back-to-back payouts may collide on one UTxO (Blockfrost lists only confirmed UTxOs); the second payout ends UNKNOWN and is retried only after the 120 s settle delay | `packages/payments/src/payout-adapter.ts:57`, `payout-queue.ts` `loop` | Verify with test 4.1 #9; if it fails, wait for one confirmation between sends or use a second wallet (`PAYOUT_WALLETS=2`) | 2 h | proposal (needs a real test) |
| R11 | Fallback vision client is always built as an OpenAI client (`max_completion_tokens`, no temperature); a Gemini backup behind the OpenAI-compatible endpoint may be rejected with 400 and then never works | `packages/vision/src/factory.ts:67` | Choose the preset by a `VISION_FALLBACK_PROVIDER` env, or test the backup once (checklist item 9) | 30 min | proposal |
| R12 | Verifier cannot start with `NODE_ENV=production` and `VERIFIER_PAYMENT=off`, while the deploy template sets both; with the fake client the engine still reports `verifier:"up"` (`ok: up \|\| fakes.verifier`), hiding a dead verifier until the real switch | `core/src/env.ts:211`, `engine.ts:1554`, `scripts/deploy/branch.env.example` | Check `systemctl --user is-active shelfie-verifier@dev` now; make health report the real verifier state even in fake mode | 30 min | proposal |
| R13 | A late verdict (job window already closed) shows "Not accepted" with the pass text "Verified. Payment is on its way." | `engine.ts:1259` | Map late passes to a clear message | 30 min | proposal |
| R14 | Dashboard hard-codes `windowSec: 900`, so jobs are claimable for only 480 s | `dashboard/RequestForm.tsx:42` | Add a window field (default 900) for the stage | 30 min | proposal |
| R15 | Wrong texts: "Try again (new code)" in gesture mode; `submitted_too_early` shows "Your claim expired"; camera "unsupported" shows the "blocked" text | `Result.tsx:132`, `domain-shelf/src/labels.ts` MESSAGES.timing, `messages.ts` S.cameraDenied | Reword | 30 min | proposal |
| R16 | Auto-update runs `npm ci` + `npm run check` on the laptop on every push to dev and restarts engine and verifier, including during an x402 payment (key becomes `payment_uncertain`) | `scripts/deploy/auto-update.sh` | Stop the timer during tests (done in the checklist); add a "deploy freeze" file the script honours | 30 min | proposal |
| R17 | Electronic shelf labels in the store may trigger `screen_recapture`, and the model's gesture reading is unmeasured | `pack.ts` `not_screen`, ai-log C-16 | Choose paper-tag products; run the 8-photo gesture eval (C) before the test | C-16 | open |
