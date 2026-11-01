# Homepage (`/homepage/index.html`)

Public site for Shelfie: a professional home page with the cart-room intro from `/story`, plus seven subpages and a separate pitch page. Static files in `public/homepage/` (copied as-is into the build). No dependencies, no inline script or style, system fonts. `/story` is unchanged.

## Files
| File | Role |
|---|---|
| `index.html` | Home: cart room (four beats), problem, market, price, how, audiences, trust, receipts, technology, roadmap, developers, build log, team, FAQ, CTA |
| `market.html`, `technology.html`, `roadmap.html`, `developers.html` | Depth pages; home sections link to their anchors ("Read more") |
| `imprint.html`, `privacy.html`, `terms.html` | Legal pages with visible `[TO CONFIRM]` markers to fill before release to `main` |
| `home.css` | Fork of `story/story.css` (same tokens) plus skip link, phone menu, footer grid, pills, tables, timelines, tech grid, FAQ, pitch screens. Light theme only |
| `doc.css` | Subpage-only styles (crumbs, TOC, prose, callouts) |
| `cart.js` | Cart canvas and room scroll logic, loaded by `index.html` only (fork of `story.js`) |
| `site.js` | Loaded on every page: `html.js` flag, reveal, count-up, bars, `aria-current`. Never returns early; shows everything if nothing animates |
| `shelfie-logo.webp`, `team/*.webp` | Copies from `public/story/` so the folder is self-contained |

All links inside the folder are relative, so a copy of `public/homepage/` also works from disk.

## Facts on the page
Source of truth: `pitch/website/homepage-decisions.md` (numbers, wording rules, receipts rule), then `pitch/website/homepage-debate-accuracy.md`. Market and price figures are only those listed there; every stat caption names publisher, year and scope. Receipt hashes are copied from `codigo/docs/evidence/tx-hashes.md` (short form first 8 and last 6 characters, full hash in the link title, link to the preprod explorer); update rows there first, and replace them once a job settles with a verified real photo. Build-log milestones follow `docs/ai-log.md` and `tx-hashes.md`. No "earn" or "get paid" for checkers (test ADA, no monetary value); no "agreed price".

## CSP rules (`codigo/vercel.json`)
`default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self'`. So: no inline `<script>` or `<style>`, no `style=""`, no `on*=` handlers, no external fonts, images or scripts. JavaScript sets widths through the DOM, which the CSP allows. External links are plain `<a>` with `rel="noopener noreferrer"`.

## Routing
`vercel.json` redirects `/homepage` to `/homepage/index.html` (temporary). `/` still redirects to `/story/index.html` (`src/App.tsx`).

## Run locally
`cd codigo && npm run dev -w @shelfie/web`, then open `http://127.0.0.1:5173/homepage/index.html` (use the explicit `.html` URL in dev; the dev server does not map directories). Build check: `npm run build -w @shelfie/web` creates `dist/homepage/`.

## Fork note
`home.css` and `cart.js` are copies of the `/story` files; later fixes to the cart scene or tokens are not shared. Changes here must not touch `public/story/`.
