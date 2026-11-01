# Shelfie — approved visual direction / implementation handoff

> Historical build reference (2026-10-30/31), retained for unique scenarios, risks or design rationale. Current operation: [STATE](../STATE.md). The backend is offline; old service, timing and implementation instructions are not current. Spent worker mockups, flow experiments and implementation prompts were removed; retained branding, dashboard concepts and QA are review references.

**Repository:** https://github.com/helmutkurk/shelfie  
**Target:** existing Vite + React + TypeScript web app (`codigo/apps/web`): worker `/w`, customer/operator `/dashboard`.  
**Prepared:** 2026-10-30. This package is DESIGN REFERENCE + IMPLEMENTATION INSTRUCTIONS, not implemented code. All written prompts are in English.

## Start in this order

1. Open `00_reference/APPROVED_DIRECTION_BOARD.png`. This is the team's **chosen visual direction** (warm cream, forest green, friendly and lightly gamified worker experience, clean restrained dashboard). The board contains visually invented examples; it is NOT a product specification.
2. Use `01_branding/logo_D_approved_original.png` as the **approved logo** (two interlocking oval links only between the two cubes; tiny friendly robot is the dot over the "i"). The larger PNG is interpolated, NOT a vector master.
3. Dashboard concepts remain in `03_primary_dashboard/` and `05_secondary_dashboard/`, including deferred worker-management ideas. They are visual references, not implemented feature promises.
4. Worker mockups and old flow experiments were retired after implementation; current source and tests are authoritative for those flows.
5. One-use implementation prompts are retired. Retained `08_context_and_QA/` and `UI_INVENTORY.md` are dated audit references, not instructions to replay the redesign.

## Interpretation hierarchy (highest first)

1. Security, team governance, protected code, working behavior, backend contracts, current repo source and accepted ADRs.
2. This handoff's explicit functional constraints and approved feature priorities.
3. Chosen board and approved logo (visual identity only).
4. Individual mockups (visual ideas only).
5. Older flow concepts (optional, lower-priority visual aid).

**No hardcoded mock data:** NO invented users, avatars, rewards, ratings, balances, fiat-equivalent tADA, shop locations, activity, orders, transactions or analytics in production views. All sample data in images is fictional. Present honest loading, zero/empty, error, permission-denied and unsupported states instead.

**Critical gesture correction (ADR-19):** The real repo has a server-generated **2–5-finger and left/right-of-label challenge**. It is revealed only on camera-open via `POST /api/claims/{claimId}/challenge`; the late-reveal window currently defaults to 90 seconds. Do NOT display a finger count in the feed, task detail or before the reveal despite the pictures. Do NOT substitute the old handwritten-code mode unless current server config requests it. One finger shown in artwork is NOT the accepted default. Do not weaken anti-replay gates.

**Map is a priority, but genuine coordinates are required:** The server's seeded store catalog has coordinates, while public `GET /api/catalog` deliberately omits them. The implementation must propose a narrowly scoped, approved read-only store-map data contract or an equally validated existing source, and respect map licensing, location privacy, dependencies and CSP. Never put arbitrary mock pins on a supposed live map.

## What to avoid

- A disconnected clone of the screenshots.
- Overbuilding dashboard pages for "staff management", arbitrary shop CRUD, marketing analytics, messaging, bonus rewards, fiat payments, or fictional push notifications.
- Changing claim, camera, location, gesture reveal, verifier, payouts, contracts, or ledger logic to match an illustration.
- Replacing real Cardano preprod balances with EUR (many visual drafts include € as irrelevant placeholder text).
- Breaking dropdown catalog-only order inputs, multi-store order as **multiple single-store jobs**, brand access code in tab memory, idempotency, error banners, operator disclosure, read-only fallback, or existing test behavior.

## Required deliverables from implementing agent

- A component/flow inventory and mockup-to-source mapping BEFORE edits.
- A small, reviewable phased plan with feature classification: (A) styling/reorganization, (B) already possible using real data, (C) requires new API/storage/security/approval, (D) defer.
- Incremental changes and tests, with screenshots from the **running real application**, not just revised mockups.
- A list of deliberate omissions and why.
- Proof that `/w` and `/dashboard` still work as before; `npm run check` and web build/smoke results, plus real phone QA where possible.
