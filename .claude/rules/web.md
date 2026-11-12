---
paths:
  - "codigo/apps/web/**"
---
# Web app (worker page and dashboard)

- Two surfaces: `/w` (worker app, **mobile first**, one hand, bad light, one task at a time) and `/dashboard` (stage layout for the live demo, readable from the back of a room). A customer view is a section of the dashboard, not a separate app.
- Worker page works on iOS Safari and Android Chrome. Camera needs a secure context; without it, keep the worker app read-only (no file picker or submission).
- Show PASS or FAIL with the plain-words reason from `diseno/verifier-rules.md`, then the payout hash.
- Every tx hash is a link to the preprod explorer (helpers from `packages/evidence`).
- Banners are mandatory and visible when active: "fake payments", "verifier stub", "operator override".
- No secrets in the browser bundle. Only `VITE_` variables that are public by design.
- Do not store photos in the repo. Test with fixtures under 200 KB.
- Component tests for claim, capture fallback and verdict rendering from fixtures.
- Security baseline (`diseno/security.md` section 3.4): no token or secret in `localStorage` or the bundle (the session is an HttpOnly cookie); no `dangerouslySetInnerHTML`; render worker strings as text; show the consent screen (`consent-v1`) before the first claim; send location only at claim and at capture; the server re-checks and strips every upload and trusts nothing the client says about it.
- Camera and location are requested on a user gesture with a plain-words reason; no analytics, no third-party scripts or fonts (CSP is `default-src 'self'`).
