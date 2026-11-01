# QA acceptance checklist for the implementing agent

## Before edit
- [ ] Repo's context acknowledgment and hook requirements passed; correct role/tasks/peer review.
- [ ] Current branch, uncommitted files, latest changes, endpoints, schemas, exact gesture config and repo rules checked.
- [ ] Record every missing API needed by selected mockups; show human which features need approval.
- [ ] Mark visual mockup sample values as fabricated. No default fictional production fixtures.

## Worker (test on HTTPS real phone for camera)
- [ ] `/w` initial onboarding persists valid testnet payout address and privacy consent; decline stays browse-only.
- [ ] Existing worker profile can be edited; logo is legible.
- [ ] Location denied/weak/offline shows clear actionable message; task list remains coherent.
- [ ] Open tasks update through SSE and 3 s polling fallback; task_closed hides map/list together; don't reorder under thumb.
- [ ] Claim is atomic; "Another worker was faster" and TTL expiry handled.
- [ ] Hand gesture is NOT revealed in feed, task preview, detail, home or before camera.
- [ ] Camera opening calls **one idempotent gesture reveal**; actual finger count 2–5 and side left/right, timer bound by server reply + claim expiry. Never reset on reopening.
- [ ] Secure-context only, `getUserMedia` camera + fresh shutter location; no proof gallery upload; no photo persisted to disk/browser storage.
- [ ] Wrong side/count, no visible hand, failure, expired/late, lost claim and screen recapture handled without bypass.
- [ ] Observed price and OOS framing both work; preview, retake and retries correct.
- [ ] Verifier state, report/extraction, payout pending, confirmed and explorer link correct, no false success.
- [ ] Wallet shows no invented value; no EUR amounts or mock rating/level.
- [ ] Map uses real coordinate/source and attribution, has loading/no-permission/error fallbacks, link to actual task.

## Customer/operator
- [ ] `/dashboard` + `/dashboard?stage` usable; existing requests, order detail, ledger and report remain available.
- [ ] Catalog product dropdown, chain filter and native store multiselect work for real IDs only.
- [ ] Brand access code and operator token stay in transient memory; no localStorage, URL query or logs.
- [ ] Order idempotency preserved after network failure; multi-store selection creates separate store jobs.
- [ ] Real purchase is disabled unless live config permits; user gets clear explanation.
- [ ] Job report, OOS, withholding/refund, statuses, tx explorer still work; no fake activity.
- [ ] Engine/empty wallet/real-fake/verifier/override banners still visible when conditions apply.
- [ ] Ledger sequence check, verification wallet and payout wallet are separate and accurate.
- [ ] No fake Workers/Locations/Analytics data or unbacked management actions.

## UI and engineering
- [ ] Light, Dark, System work and persist without secrets, support OS changes.
- [ ] No horizontal overflow at 320/360/390/430, 768 and 1280+ widths; overlay/sheet scroll works; bottom nav safe areas.
- [ ] Touch targets >=44px, accessible focus/labels/aria live messages, contrast, 130% text, reduced motion.
- [ ] No hardcoded example activity, payouts, dates, prices, ratings, workers, personal photos or map pins in production rendering.
- [ ] Security reviews for any new personal-data storage or exposed map coordinates, team approval for dependencies/contracts.
- [ ] Run `cd codigo && npm run check` and `npm run build -w @shelfie/web`. Run `npm run smoke` if safe/available; report runtime blockers honestly.
- [ ] New/updated tests cover the actual feature states; no tampering with source to make tests pass superficially.
- [ ] Output screenshots from actual built app for both themes, worker flow, order form and ledger. Name which states are mock tests vs live preprod.
- [ ] Document changes/deferred items, tasks, peer-review and agent handoff via repo procedures; no secret disclosure or direct main push.
