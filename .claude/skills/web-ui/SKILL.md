---
name: web-ui
description: Use when changing role D's worker app, dashboard, camera/location flow, live feed, or M6 phone demonstration.
---
# Web UI (role D)

## When to use

Use for codigo/apps/web, /w, /dashboard, the design tokens, or phone/tunnel validation.

## Read first

- [UI design and tokens](../../../diseno/ui-design.md), [web app flows](../../../diseno/webapps.md)
- [Web README](../../../codigo/apps/web/README.md), [contracts](../../../diseno/contracts.md), [M6 acceptance](../../../diseno/repo-layout.md#5-definition-of-done-per-milestone)
- [Web rule](../../rules/web.md) and [security baseline](../../../diseno/security.md)

## Commands and tests to run

From codigo/:

    npx vitest run apps/web/src
    npm run build -w @shelfie/web
    npm run hub-up -- --fake
    npm run smoke
    npm run hub-up -- stop

## Contracts and invariants

- Keep /w mobile-first and /dashboard readable on stage. Use tokens in apps/web/src/styles/tokens.css and system fonts from ui-design.md.
- Import browser-safe shared contracts from @shelfie/core/browser and explorer links from @shelfie/evidence/explorer; keep server-only modules out of the browser graph.
- Capture uses the live in-app camera only. Do not add an input[type=file], gallery, or upload fallback. HTTP without a secure context is read-only.
- Ask for camera and geolocation from a user action; send capture location at shutter time. The engine checks the geofence before it calls the paid verifier.
- Keep the SSE feed with its 3-second polling fallback and show real/fake/stub/override states clearly. Every real tx hash links to the preprod explorer.
- M6 includes two real phones, first-claim race, live camera and geolocation, out-of-stock, catalog-only form, live ledger, and iOS Safari/Android Chrome checks.

## Verify Friday

- Test iOS Safari and Android Chrome over the HTTPS tunnel; confirm secure camera context, capture-time location accuracy, tunnel headers, and 150 m geofence adequacy.
- Check dark mode, 130% text, reload behavior, and Lighthouse accessibility before M6. No phone validation is implied by local tests.

## Do not

- Do not add a file picker, persist photos/tokens in the browser, add third-party scripts/fonts, or put secrets in VITE_ variables.
- Do not submit camera or location data over plain HTTP, invent endpoints, or present fake explorer links as real.
