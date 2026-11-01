# CLAUDE CODE — Prioritization of requested *new* capabilities

These feature requests are real goals, but DO NOT assume they exist in the current API. Investigate, propose a contract and security plan, ask the team before adding backend dependencies or creating durable personal data. Incremental UI changes should be safe even if these features are deferred.

## Tier 0 (integrate existing behavior; no feature invention)
- Shared dark/light/system, consistent design tokens, navigation and responsive behavior.
- Worker live tasks, photo/gesture proof, payouts linked to a specific submission.
- Customer orders from catalog dropdowns; real jobs, report, ledger, wallets.
- Useful empty states / loading / errors; real SSE connection indicators; clear statuses.
- Local profile name and payout address display; show a neutral avatar fallback derived from the display name (not a pretend AI-generated user portrait). Do not change consent requirements.

## Tier 1 (top requested new feature): geolocated map

Data gap: current `TaskListItem` has no lat/lon, public `GET /api/catalog` strips coordinates though server catalog contains them. A map cannot be truly functional by matching arbitrary address guesses or placing artist mock pins.

Propose and obtain approval for one narrow trusted public map feed, e.g. `GET /api/map/stores` or augmentation of existing catalog contract, with only catalog-store `id,name,chain,lat,lon` and perhaps task id -> catalog store id relation when authorized. Validate zod, server limits, no private worker coordinates, limited caching, same-source filtering, no unmapped tasks shown as located. Link map marker and list via task ID. Camera capture-time precise coordinates remain separate and never persist in UI data/analytics. Respect current deployment CSP (`default-src 'self'`), licensing/attribution/offline fallback; additional map tile/server/network deps require explicit approval. Ideally use a small, vetted, self-hostable solution; no arbitrary map SDK injected from CDN.

## Tier 2 (user expressly wants, but requires separate design)

### Avatars / photos
- Always work with neutral initials/illustration fallback that needs no new personal data.
- Optional real photo upload only with affirmative consent, a separate profile media endpoint (never in proof camera/gallery), size/type scanning, storage/access rules, retention/deletion, account authentication, accessible alt text. Do not embed real third-party faces from mockups.

### Notifications
- Initially allow honest in-app new-task toasts/indicators from existing SSE, with no server-history claims. Reconnect and duplicate handling. Persisted notification inbox and web push require user permission, account/worker linkage, backend records/push infrastructure and privacy review. If not available, omit the bell or show only real current state.

### Ratings of workers AND customers
- Define each person's role, allowed rater and rated party, criteria, timing (only after real completed/verified job), immutable reference to job and identity, anti-Sybil/abuse, dedupe, opt-out, privacy; no global worker directory without protection. Ratings must be verified and aggregates disclose count/uncertainty; no synthetic 4.8 or star count. If auth is still merely local workerId + payout address, assess impersonation and fraud before writing ratings to a backend. Backend and contract changes require human product approval.

### Work and earnings history
- Brand: existing job, order and ledger history may already suffice for credible summaries, with correct filtering/coverage and security. Worker: existing last-result view is NOT a durable personal history API; do not infer "all earnings" from public ledger or browser-local caches. Design a scoped, authenticated worker history read API respecting privacy and retention, with payout states linked to submissions. Earnings are CONFIRMED payouts only when showing "earned"; never confuse payout address chain balance with earned rewards.

### Gamification
- Approved style: friendly progress, a small badge vocabulary, not manipulative autoplay/lootboxes. Only add counters/XP/levels if deterministic rules and persistent verified sources exist; label pilot/experimental status. Avoid projecting fictional level 4 / 84 tasks to anonymous user. Ranking users without secure identity is not safe.

## Tier 3: avoid unapproved scope expansion
- Dashboard employee management, availability/online status, invites/assignments, staff messaging, chains/locations CRUD, arbitrary e-commerce pricing, EUR real-money wallet, unsolicited push spam.

## Decision procedure before implementing a tier-2 feature

1. What real problem does it solve for customer/worker?
2. Which authoritative records and stable identifiers exist now? Where is missing data sourced?
3. Can a read-only derived UX satisfy intent instead of new DB/services?
4. What consent, identity, retention, moderation and fraud risks arise?
5. Who owns the contract, code and review? Does ADR or purpose-impact apply?
6. What loading/empty/error/permission-off state is honest?
7. What regression and security tests prove correct behavior?
8. Ask approval; then implement minimum vertical slice, typed with zod, tests and documentation.
