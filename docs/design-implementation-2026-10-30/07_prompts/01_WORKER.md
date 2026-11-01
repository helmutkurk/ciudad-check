# CLAUDE CODE — Worker `/w`: preserve the verified-photo mission

Apply AFTER master prompt and repository context gates. Primary visual guidance: `02_primary_worker/01...05`; secondary standalone views `04_secondary_worker/`. The selected board defines the look, but the actual `WorkerApp.tsx` state machine / claim/camera/verdict flows define the behavior.

## Existing functional path to preserve

W0 onboarding (`Onboarding.tsx`): name shown to worker only, **preprod `addr_test1` payout address**, consent `consent-v1`, decline -> read-only. This is not a conventional login. Respect current profile storage rules and never imply real identity authentication.

W1 Feed (`Feed.tsx`, `useTaskFeed`): permission request, coarse city location, city-filtered OPEN tasks, SSE notifications (open/closed) with polling fallback, no unexplained reordering while scrolling, reconnect states, another worker first-claim win. All values `TaskListItem` typed; actual source does NOT include store lat/lon. Preserve task order and closure semantics.

W2 Detail (`TaskDetail.tsx`): store address, product, test ADA reward, time left, location checks, instructions, claim. **Replace the stale literal handwritten-code STEPS copy in gesture mode only** while maintaining code fallback behind server config. Never display the expected gesture before reveal.

W3 Claimed (`Claimed.tsx`): claim TTL, Open camera, Product not on shelf, Give task back/cancel, no fake challenge. Gesture intro can say "Your hand sign is revealed when the camera opens"; never leak count or side.

W4 Camera (`CameraSheet.tsx`): secure HTTPS + `getUserMedia`, live view, server `revealChallenge(claimId)` invoked when camera opens, show returned **2–5 fingers and left/right of tag**, answer deadline from API and actual claim expiry; photograph label + hand together, with genuine capture-time geolocation. No file/gallery upload or code printed as fake UI. Preserve Product not on shelf, preview, retake, retry, weak location, errors and read-only notice on insecure HTTP.

W5/W6 Result (`Result.tsx`): submit and verify asynchronously; show actual verifier outcome / plain-word reason, remaining tries, payout states and real Cardano preprod tx explorer link, including OOS result. Never treat pending / UNKNOWN payout as confirmed.

## Target main navigation from selected art

- **Home** (new shell over existing feed): warm welcome using local name only; one prominent next AVAILABLE task, honest number of OPEN tasks, simple actions to Tasks/Map/Wallet/Profile. No pretend earnings/progress/bonus. If no tasks, show explanatory empty state.
- **Tasks**: available tasks and current active claim, with clear activity segmentation. Existing `useTaskFeed` is source of live AVAILABLE tasks. **There is currently no cross-session personal history API**; completed tab must use real data if later added or be absent / genuinely empty. Preserve single active claim state; avoid irreversible navigation away from camera or expiry.
- **Map** (priority 1 planned functionality): map real catalog stores and existing OPEN tasks, pins mapped by stable IDs after an approved safe data source is created. Selected pin opens the same TaskDetail as the list. Filters must filter both list and map; task_closed removes pins promptly. Geolocation denied -> manually accessible task list, map may still show permitted store positions. No fake task/worker points, no precise location persistence or unapproved third party tracking.
- **Wallet / Earnings**: **do not present a fake spendable wallet balance.** Existing worker has a preprod payout address and per-submission payout state; its actual on-chain wallet balance and lifetime payment history are not currently fetched. Clearly distinguish Address / test ADA / Pending payouts / Confirmed payouts. Add confirmed earnings totals only when a trustworthy, privacy-safe transaction/history API exists. A link to supported explorer is safer than a made-up balance.
- **Profile**: existing local name and payout address, privacy/consent/edit and optional settings. Add deterministic initials/avatar fallback or self-contained illustration; do not use generated stranger portraits as real user photos. Profile picture upload is new functionality, not a photo-proof upload; requires separate authorization, privacy/retention policy, endpoint, validation and approval. Ratings/XP display only with persistent verified logic; otherwise omit.

## Worker visual treatment

Cream/sage surfaces, forest-green buttons and headers, restrained orange warning/achievement accent, friendly readable type, real iconography, 44px targets, bottom 5-way nav on small devices with appropriate safe-area padding. Full height must scroll with no clipped content, while nav remains accessible; camera view may be full-screen independent of tab shell. Provide light/dark/system modes, reduced motion and contrast. Don't make progress bars/earnings cards a marketing fake. Maps need loading, insufficient precision, empty and offline states.

## Feature consent / new API gates

Notification indicator: use actual SSE arrival/closure events initially, such as "new tasks" count, with appropriate foreground context. No pretend push/notification history and no invented bell count. Native push needs explicit user permission, subscriptions and server infrastructure; defer without approval.

Ratings for **workers and customers** are desired but currently not in `@shelfie/core` contracts. Propose trustworthy post-job identities and both-sided criteria tied to completed verified jobs, abuse controls, min-sample handling, moderation/privacy, API events and displays. Never hardcode "4.8" from mockups.

Gamification: no gamified payouts; keep real completion stats from real records only. Reward badges, XP/levels and streaks must be derived from auditable events and persist safely across devices if built; otherwise aesthetic inspiration only.

## Acceptance walkthrough

On iOS Safari/Android Chrome HTTPS: onboarding/decline -> location permission -> list/map real open task -> TaskDetail -> claim -> camera/reveal -> correct hand (count and side) + price tag / OOS photo -> genuine verify -> payout link. Repeat with wrong city, denied GPS, first-claim collision, task expired, no secure context, re-opened camera (idempotent challenge), rejected evidence/retry, and task closed by other worker. Test scroll, tap targets, system theme and RTL-safe/responsive layout where relevant. Assert no gesture count is visible before camera reveal and no demo EUR/ratings/XP appear unless real.
