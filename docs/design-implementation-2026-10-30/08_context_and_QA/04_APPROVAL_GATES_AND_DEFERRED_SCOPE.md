# What requires explicit scope review

Visual redesign and preservation of existing logic are approved intent. This ZIP does **not** grant blanket authority to alter backend, privacy, model gates, contracts, new dependencies, accounts or payments.

| Proposed addition | Minimum prerequisite | Suggested default |
|---|---|---|
| Worker map | Public safe catalog store coordinates / task-store IDs via approved contract, tile/provider licensing, CSP check, privacy | Plan first, implement as top priority after review; fallback live list |
| Dashboard locations map | Reuse agreed map data; customer-visible store filtering | Light derived view, not CRUD |
| Ratings (worker & customer) | Stable identity, completed job auth, anti-abuse, mutual criteria, storage + moderation | Design and approval before enabling |
| Personal worker job/earnings history | Authenticated privacy-safe backend source and payout-state semantics | Show current task/latest result only until ready |
| Profile images | Consent, validated media upload & secure storage/delete lifecycle | Initials/fallback avatar today |
| Persistent notification inbox/push | Identity, permission, subscription/delivery, privacy | In-app SSE indicator only |
| XP / levels / achievement badges | Auditable verified-event history, published deterministic rules | Purely aesthetic friendly styling, no imaginary counters |
| Full employee/worker manager, invite/assign | Business justification + new APIs, access control | Defer |
| Editable supermarket/store directory | Business justification + catalog ownership change/ADR | Defer |
| Advanced analytics dashboards | Sufficient complete real history, numeric semantics, performance limits | Only existing defensible KPI + concise filters |
| New navigation routes | Check `diseno/contracts.md` and `webapps.md`; required contract/ADR | Prefer internal view state first |

## Definitional cautions

A task acceptance is not an earned payout. A confirmed preprod on-chain transfer is not EUR income. A payout wallet balance is not the worker's earnings balance. An open order is not a verified job. A claimed task is not proof of a human worker's online availability. A mock rating/XP level is not a real reputation system. A map without real coordinates is not operational.

**ADR-19 gesture vs user's description:** backend currently supports 2–5 fingers and side, not one finger, and late reveal on camera. If stakeholders request count 1–5, explicitly propose a follow-up backend/verification change and evaluation; do not quietly modify enum/rules to match artwork.
