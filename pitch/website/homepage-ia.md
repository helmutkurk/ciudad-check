# Homepage information architecture (`/homepage`)

Status: proposal for builder and reviewer (UX/IA pass, 2026-10-30). Inputs: `codigo/apps/web/public/story/*`, `pitch/archive/homepage-brief.md`, `codigo/vercel.json`, `diseno/ui-design.md`. Facts and numbers come only from `pitch/slides/facts.tex`, `codigo/docs/evidence/tx-hashes.md` and `codigo/docs/verified.md`; slots marked `[VERIFY]` wait for the number-checking agent.

## 0. Principles

1. Main page = scannable. Every section is: headline (max 8 words), 1-2 sentences, 3-4 cards, one "Read more" link into a subpage anchor. Depth lives on subpages.
2. Keep the /story identity: cream/forest/leaf palette, system fonts, cart canvas intro, rounded cards, same tone (plain, short, honest labels).
3. Honest labels everywhere: "Cardano preprod", "test ADA", "illustrative", "earlier test run". No EUR equivalent for tADA.
4. Public repo + CSP `'self'` only: no inline script, no `style="..."` attributes (blocked by `style-src 'self'`), no external fonts, images, scripts or analytics.
5. Pitch mode must never depend on a click (see section 2, "Pitch screens").

## 1. Site map

All files in `codigo/apps/web/public/homepage/` (copied as-is by Vite into `dist/homepage/`).

| Page | File | Holds | Why it lives here |
|---|---|---|---|
| Home | `index.html` | hero + cart story, problems, market (3 figures), cost bars + 10-store compare, how it works, two audiences, why trust (4 cards), receipts (5 rows), roadmap strip, developers strip, team, FAQ (6 questions), CTA | The sales path in one scroll, order identical to /story plus new blocks |
| Pitch | `pitch.html` | Exactly the six full-screen pitch sections of `../archive/homepage-brief.md`, scroll-snap, nothing else | The brief demands 6 x 100vh, one key each, no logo before the hook; the home has a 400vh pinned intro and richer sections, so the two orders differ (trade-off T1) |
| Problem and market | `market.html` | Anchors `#remote-market`, `#field-checks` (trade-promotion / price-tag compliance), `#gap` (verified figures with publisher and year, no added-up totals), `#cost` (full comparison table, assumptions, "illustrative" note) | Numbers need sources and caveats; too heavy for the home |
| How it works | `how.html` | Anchors `#order`, `#claim`, `#photo`, `#verify`, `#settle`, `#failures` (what happens on fail, timeout, refund), `#brands`, `#checkers` | Step-by-step with edge cases; home keeps one row of 5 cards |
| Technology | `technology.html` | One anchor per tech: `#cardano` (eUTxO), `#masumi`, `#x402`, `#sokosumi`, `#verifier-gates`, `#hand-sign`, `#location`, `#vision`, `#architecture` (inline SVG) | Each deep dive 80-150 words + "Why we chose it" + "Limits today" (honest) |
| Trust | `trust.html` | `#escrow`, `#receipts` (full table: lock, x402 fee, payout, settle, refund; hash, network, date, label, explorer link), `#how-to-verify` (3 steps to check a hash yourself), `#limits` (fake-payment banners, stub modes, preprod only), `#privacy` | The proof page; receipts must stay in sync with `tx-hashes.md` |
| Roadmap | `roadmap.html` | Now / Next / Later columns with status per item; ladder: shelf checks -> deliveries, opening hours, accessibility; multi-store jobs, store QR codes | Public promises need room for caveats |
| Developers | `developers.html` | `#repo`, `#api` (what is public, what is not), `#run-locally`, `#packages`, `#build-log` (timeline of the hackathon build), `#license` | Audience of builders; keeps code vocabulary off the home |
| Team | on home only (`#team`) | four people, photos from `/story/team` copied | No subpage needed |
| Legal | `imprint.html`, `privacy.html`, `terms.html`, `license.html` | Impressum (German DDG requirement), privacy (no cookies, no analytics, what camera/location do, retention), terms (prototype, test money, no warranty), license (BUSL-1.1 per `package.json`; confirm repo LICENSE text) | Required in footer; plain pages, no JS |

Total 13 HTML files. A 404 for typos is handled by Vercel default; no custom page needed.

Content-to-page rule: if a block needs a source, a table with more than 5 rows, an edge case, or a technical term, it goes to a subpage; the home carries a card with the claim and a link.

## 2. Home section order (`/homepage/index.html`)

Copy limits: headline max 8 words, body max 2 sentences (about 35 words), card title max 4 words, card body max 18 words. Each section ends with at most one "Read more" link, text pattern "Read more: <topic>" (no arrow glyphs needed; if used, same on all).

| # | id | Purpose | Layout | Copy limit | Read more -> | Pitch-brief map |
|---|---|---|---|---|---|---|
| 1 | `story` | Hero + origin: cart assembles on scroll, four beats unchanged from /story (hero line, real request, the idea, the payment) | Pinned canvas room (400vh, 360vh phone); beat 1 holds the H1, tagline, two CTAs (Start a check / Take checks) | Beat: headline max 8 words, 2 sentences | `#market` (scroll) | Pitch 2 (Hero) is beat 1; Pitch 6 (Close) echoes beat 4 |
| 2 | `problem` | Two problems in one view | Split, two cards: "Reach a market far away without knowing anyone" and "Pay field teams to check shelves and price tags" | 2 sentences each | `market.html#remote-market`, `market.html#field-checks` | Section 7+ |
| 3 | `market` | Market gap | Stat row, 3 figures from facts.tex with `data-count`; one slot card `[VERIFY]` for the gap statement; caption includes publisher and year | Caption max 12 words | `market.html#gap` | Section 7+ (figures) |
| 4 | `price` | Cost / ROI | Existing bars + 2 compare cards (EUR 50+, about EUR 12 illustrative, 10 stores EUR 500+ vs EUR 120); badge "illustrative" | as /story | `market.html#cost` | Pitch 5 (Today / next) |
| 5 | `how` | How it works | 5 step cards (Order, Claim, Photograph, Verify, Settle) as /story | Card max 18 words | `how.html` | Pitch 3 (4 cards in the brief; we keep 5 on the home, the pitch page shows 4) |
| 6 | `audiences` | Two audiences | Split, two columns: Brands (benefits, 3 bullets, CTA /dashboard) and Checkers (3 bullets, CTA /w) | 3 bullets each, max 10 words | `how.html#brands`, `how.html#checkers` | - |
| 7 | `trust` | Why trust: blockchain | 4 cards: Escrow, Public receipts, x402 per-check payment, Fixed verifier rules | Card max 18 words | `trust.html`, `technology.html#cardano` | Pitch 4 (intro line) |
| 8 | `proof` | On-chain receipts | Dark section (as /story `section-dark`): table of 5 rows, short monospace hash (first 8 + last 6), type, label "Cardano preprod, earlier test run", explorer link | 5 rows, 1 line each | `trust.html#receipts` | Pitch 4 (Receipts) |
| 9 | `technology` | Tech overview | Chip grid of 9 tech cards (name + 8 words), each linking to its anchor | 8 words per chip | `technology.html` | - |
| 10 | `roadmap` | Now / next / later | Timeline, 3 columns, 3 items each | item max 8 words | `roadmap.html` | Pitch 5 (Today / next) |
| 11 | `developers` | Builders | Split: left one paragraph, right code-like block (monospace, plain text, no highlighting JS) showing the order flow in 5 lines; links repo, run locally | 2 sentences | `developers.html` | - |
| 12 | `build` | Build process | Horizontal timeline, 5 milestones with dates (from `docs/ai-log.md` and git); no invented dates | milestone max 8 words | `developers.html#build-log` | - |
| 13 | `team` | Team | 4 portrait cards as /story | as /story | - | Section 7+ |
| 14 | `faq` | FAQ | `<details>`/`<summary>` list, 6 items (Is money real? Why Cardano? What if the photo fails? Who sees my photo? Can it be faked? Who is it for?) | answer max 40 words | `trust.html#limits` | Not used in pitch (FAQ is a click element; allowed on the public home, forbidden on `pitch.html`) |
| 15 | `start` | CTA | Centered, two buttons as /story, preprod note | headline max 6 words | - | Pitch 6 |

Footer (all pages): brand, 4 columns (Product: Home, How it works, Market; Technology; Trust and receipts; Developers: GitHub, Roadmap), legal row (Impressum, Privacy, Terms, License), line "Prototype on Cardano preprod, test money only. TUM Blockchain & AI Hackathon 2026".

### Pitch screens (`/homepage/pitch.html`)

Six `<section class="screen">` with `min-height: 100svh`, `scroll-snap-align: start`, `html { scroll-snap-type: y mandatory }` only on this page (class `pitch` on `<html>`). No nav, no links that need a click, no cart canvas.
1. Hook: full-width shelf photo (blurred brands, no people; placeholder file until Isabel supplies it) + one line, no logo.
2. Hero: "Shelfie", tagline, subline.
3. How it works: 4 cards.
4. Receipts: 5 rows + optional QR per row (QR as local SVG/WebP, generated at build time, not at runtime).
5. Today / next: price line (illustrative), today vs next.
6. Close: one sentence + tagline.
Below the close (Q&A): vision ladder, 3 figures with publisher and year, verifier gates row, team, links. These stay scroll-only too.
Heading max 6 words, body max 2 short sentences, as the brief says.

Why a separate file (T1): the home's pinned 400vh room and 15 variable-height sections cannot give "one Page Down = one section" without fragile JS. If the team insists on one URL, fallback: the home applies `pitch` snap behavior only when opened as `index.html?pitch` (JS adds `html.pitch` and hides sections 2-4, 6, 9-14). I do not recommend it: hidden-content logic is a risk on stage.

## 3. Shared layout for subpages

```
header.topbar (same markup/CSS as /story, nav changes)
  brand | Market | How it works | Technology | Trust | Roadmap | Developers | [Start a check]
nav.crumbs  Home / Technology / Masumi       (aria-label="Breadcrumb", ol)
main.wrap.doc
  h1 + one-sentence lead
  div.doc-grid: aside.toc (sticky, "On this page", anchor list) + article.prose
  a.back  "Back to home section <x>"  (links to /homepage/index.html#id)
section.section-cta (small): two buttons
footer.footer (same as home)
```

- Subpage CSS: `doc-grid { display:grid; grid-template-columns: 220px minmax(0, 68ch) }`; TOC `position: sticky; top: 84px`; on phone TOC becomes a `<details>` at the top (works without JS).
- Each tech anchor block: `h2` + 1 paragraph "What it is", 1 "What it does for Shelfie", 1 "Limit today", link to official docs allowed as plain external link (links are fine under CSP; they are not loaded resources). Mark external links `rel="noopener noreferrer"`.
- Anchors need `scroll-margin-top: 84px` (fixed topbar).
- Active nav item: `aria-current="page"`.
- The topbar nav on a phone: story hides links under 760px. On subpages show a `<details class="menu">` with all links (no JS).

### CSS and JS sharing: recommendation

Fork into `/homepage/` (copy), do not reference `/story/`.

Reasons:
1. `/story` must stay unchanged; shared files mean any homepage tweak risks it (and the pitch is built on the homepage while /story is the domain root target T-26).
2. Offline copy of the pitch screen: a saved `homepage/` folder must be self-contained. Use relative links (`../homepage/x.html`, `styles.css`) inside `/homepage/` so the folder works from `file://` or a USB stick. /story uses absolute `/story/...` paths, which break offline.
3. `story.js` aborts early when there is no `#cart-canvas` (`if (!canvas || !room) return;` runs before the reveal/count/bar modules) while it already adds `html.js` and `.reveal` starts at `opacity: 0`. Reused as-is on a subpage, every `.reveal` element would stay invisible. Splitting the JS fixes this.

File plan in `public/homepage/`:
- `home.css` = fork of `story.css` (tokens unchanged) plus new components (section 4). `doc.css` = subpage-only (crumbs, TOC, prose, tables); subpages load both.
- `cart.js` = cart canvas code (from story.js lines up to `render`), loaded only by `index.html`.
- `site.js` = reveal, count-up, bars, `html.js` flag, nav `aria-current`; loaded by every page. Written so that nothing is hidden before it runs and it never returns before registering modules.
- Assets: copy `shelfie-logo.webp` and `team/*.webp` into `homepage/` (about 23 KB + photos; avoids cross-folder coupling). Cost: duplicated bytes (small). Alternative if size matters: reference `/story/team/...` for photos only; I prefer copy for the offline reason.
- Fork drift: add one line in `codigo/apps/web/story/README.md` is NOT needed now; add `codigo/apps/web/homepage/README.md` later if the team wants docs (builder decides; this file is the spec).

## 4. Visual upgrades (same look as /story)

Keep tokens from `story.css` unchanged: `--forest #0b2e1f`, `--green #2e7d32`, `--leaf #6baf5b`, `--mint #cfe7c1`, `--cream #f5efe3`, `--card #fffdf8`, `--line`, `--radius 18px`, system fonts (`--display` stack). Light theme only, like /story (the cream-to-forest alternation already gives rhythm); no dark-mode toggle (T2: a dark scheme doubles the contrast checks and adds nothing for the pitch). Set `color-scheme: light` and `theme-color` as in /story.

Distinctiveness note: the page deliberately stays the green/cream shelf identity, not a SaaS-gradient kit. Rules: one border radius scale (18px cards, 999px pills, 8px tables), no gradient washes except the existing cart glow and CTA, avoid identical-card walls (alternate split layouts, tables and timelines), no tracked all-caps labels except where /story already has the eyebrow.

Components (all classes; no inline styles):
- Section eyebrow: reuse `.eyebrow`; use it only where it carries information (page category on subpages, "illustrative" or "earlier run" status), not above every heading. Home: eyebrow on hero beats and `#proof` only.
- Stat counters: `.stat` as /story; `data-count`, `site.js` animates once on enter; without JS the final number is in the HTML text. Add `.stat-src` (13px, muted) for "Publisher, year".
- Comparison table (market.html `#cost`): `<table class="cmp">` with `caption`, `th scope`, columns: method, cost per visit, billed when, proof quality, coverage. Styles: `border-collapse: separate; border-spacing: 0; border: 1px solid var(--line); border-radius: 12px; overflow: hidden`, zebra rows with `rgba(11,46,31,.04)`, Shelfie row `background: var(--forest); color: var(--cream)` with `--leaf` numbers; numerals `font-variant-numeric: tabular-nums`. On phone: `display: block; overflow-x: auto` wrapper `.table-scroll` with `tabindex="0"` and visible focus.
- Timeline (`#roadmap`, `#build`): `<ol class="timeline">`; grid of 3 columns for roadmap (Now / Next / Later), each item a card with a status pill (`Done`, `In progress`, `Planned`: mint, leaf, outline). Build timeline: horizontal line `border-top: 3px solid var(--forest)` with dots (`::before`, 14px, `--leaf`), on phone vertical with `border-left`. Numbers/dates only if sourced.
- Architecture diagram (`technology.html#architecture`): inline `<svg viewBox="0 0 960 420" role="img" aria-labelledby="arch-t arch-d">` with `<title>` and `<desc>`. Boxes: Brand (dashboard), Sokosumi / Masumi (escrow), Engine, Worker app, Verifier (x402), Cardano preprod. Use `fill="#fffdf8" stroke="#0b2e1f" stroke-width="2"` attributes (presentation attributes are allowed under CSP; `<style>` and `style=""` are not), text 16px minimum rendered at 1920 wide, arrows with `marker-end` defined in `<defs>`. Flow numbered 1-5 matching the step cards. A text list of the same flow follows the SVG for screen readers and no-CSS use.
- Receipts table (`#proof`, `trust.html#receipts`): `<table class="receipts-table">`; columns: Step (lock, x402 fee, payout, settle, refund), Hash, Network label, Date (UTC), Link. Hash in `<a>` with `font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 15px; letter-spacing: 0` and short form `cbc9cb5d...e1f2a3` (full hash in `title` and in `trust.html`); explorer link opens the preprod explorer (`rel="noopener noreferrer"`); never typed from memory: copy from `tx-hashes.md`; settle/refund rows carry "escrow test run" until the verified-photo settlement exists. On the dark section: borders `rgba(207,231,193,.18)`, text `--cream`.
- Two audiences split: two `.card` columns, the first on `--card`, the second `--forest` (as `.compare-card-us`), same height via grid.
- Tech chips: `.tech-grid` (3 columns desktop, 2 tablet, 1 phone), each an `<a class="tech">` (whole card is link, visible `:focus-visible`).
- FAQ: native `<details>`; `summary` min height 48px; marker styled with `::after` plus/minus; `details[open]` border `--green`. Open the first item by default? No: all closed on home.
- Buttons, topbar, cards, team: unchanged from /story.
- Motion: keep only the cart intro, count-up and bar fill (answering scroll position); remove the generic reveal on every card except the existing `.reveal` fade for stat/step/person; none on subpages.
- Type scale: body 17px (16 phone); h1 clamp(40px, 6.2vw, 84px) hero only; `.title` clamp(32px, 4.6vw, 60px); h3 20px; table text 15-16px; prose max 68ch.

## 5. Routing

Facts: `vercel.json` has `outputDirectory: apps/web/dist`, `framework: null`, rewrites only for `/api/*`, `/w/*`, `/dashboard/*`; no `cleanUrls`, no `trailingSlash`. Vercel serves files from the output directory before applying rewrites, so `/homepage/index.html` and `/homepage/market.html` work with no change. `/` redirects in `App.tsx` (`window.location.replace("/story/index.html")`): leave untouched (T-26).

Needed entries (add to `rewrites`; none changes `/` or `/story`):
```json
"redirects": [
  { "source": "/homepage", "destination": "/homepage/index.html", "permanent": false }
],
"rewrites": [ ...existing..., { "source": "/homepage/", "destination": "/homepage/index.html" } ]
```
Notes:
- `/homepage/` (trailing slash) is resolved by Vercel's static handler to `index.html` on its own; the explicit rewrite is a belt-and-braces entry the builder may drop after testing the preview.
- `/homepage` without slash: not guaranteed to resolve for a directory; the redirect (302 while testing, make it 308 `permanent` later) is the safe entry. Do not use a rewrite for it, because relative links on the page would then resolve against `/` and break.
- Do not enable global `cleanUrls: true`: it would redirect `/story/index.html` to `/story` and change `/story`'s behavior and its absolute asset paths. Subpage links always use the `.html` extension.
- The existing catch-all `/w/:path*` and `/dashboard/:path*` rewrites do not match `/homepage`.
- CSP header already applies to `/(.*)`: all homepage pages must pass it (no inline script/style, `img-src 'self' data: blob:`).
- Vite dev: `public/homepage/index.html` is served at `http://127.0.0.1:5173/homepage/index.html`. Like /story (README note), `/homepage/` may fall through to the SPA `index.html` in dev, which would render the worker app; use the explicit `.html` URL in dev and test the directory URLs on a Vercel preview. Builder: verify once and record the result in the log. Vite `build` copies `public/` as-is, no config change needed. Internal links use relative paths so that dev, Vercel and the offline copy all work.

## 6. Accessibility, performance, no-JS, motion, projector

- Semantics: one `h1` per page, ordered headings, `header/nav/main/footer`, skip link first in body (`<a class="skip" href="#main">`, visible on focus), `lang="en"`, unique `<title>` and meta description per page, `aria-current` in nav, tables with `caption` and `scope`.
- Contrast: body `#0b2e1f` on `#f5efe3` passes AAA; `--green #2e7d32` on cream is about 4.6:1: use it only for text at 18px+/bold or on links with underline; small muted text `--muted #3f5a4c` passes AA. `--leaf` text only on forest. Check every pill.
- Focus: keep `:focus-visible` 3px `--leaf` outline; on forest backgrounds use `--mint`. Touch targets at least 44px (nav links on phone, FAQ summaries, chips).
- Keyboard and snap: `pitch.html` works with Page Down/Space/arrows; no keyboard trap; `scroll-padding-top` for anchors.
- No-JS: `html:not(.js)` fallbacks as in /story (beats plain, canvas hidden, `.reveal` visible); numbers are real text; FAQ uses `<details>`; TOC and nav are plain links; hashes are plain text/links.
- Reduced motion: as /story (no pinned scrubbing, finished cart, no transitions, no count-up animation, no smooth scroll); `pitch.html` keeps snap but sets `scroll-behavior: auto`.
- Performance: no dependencies; each page under 150 KB transferred excluding images; images `width`/`height` set, `loading="lazy"` below the fold, WebP; `<canvas>` rAF only while the room is near the viewport (pause when `getBoundingClientRect` is outside); passive scroll listeners; `defer` scripts; no layout shift from counters (reserve width with `min-width` in `ch`); preload nothing external.
- Offline: all assets local and relative; no `fetch`; receipts hard-coded in HTML (updated by hand from `tx-hashes.md`); `pitch.html` verified by opening the folder from disk with the network off.
- Projector (1920x1080, zoom 125%): pitch screens body at least 22px, headings at least 56px, line length under 60ch, contrast at least 7:1, nothing smaller than 18px on `pitch.html`; test at 1536x864 effective viewport (125%). Avoid thin grey text and pale mint on cream there.
- Privacy: no cookies, no analytics, no fonts requests; photos with brands blurred, no people; no worker addresses or secrets; the real request told without names, drink, brand or country (as the story page).
- Copy honesty: label every price "illustrative" where facts.tex says so; no totals added up across market figures; claims about the verifier match `pitch/` after the 2026-10-30 tech check (hand sign, 12-15 s latency, no per-gate view promised).

## 7. Checklist (builder, then reviewer)

Structure
- [ ] 13 files exist under `public/homepage/`; every page has header nav, footer with Impressum, Privacy, Terms, License, GitHub.
- [ ] Home sections appear in the order of section 2; each has headline, 1-2 sentences, cards, a Read more link to an existing anchor.
- [ ] Every anchor named in section 1 exists; every Read more and TOC link resolves (script: extract `href`s, check files and ids).
- [ ] `/story/` files unchanged (`git diff --stat` shows nothing under `public/story/`); `/` redirect unchanged.

Content
- [ ] Four-beat cart story copy identical to /story; the acquaintance told without names, brand or country.
- [ ] Numbers match `facts.tex`; `[VERIFY]` slots filled by the checker or visibly marked; every figure has publisher and year on `market.html`.
- [ ] Receipts: 5 rows, hashes copied from `tx-hashes.md`, label "Cardano preprod", "test ADA", "earlier test run"/"escrow test run" where required; no EUR for tADA.
- [ ] Legal pages not placeholders pretending to be final: Impressum has the responsible person's details supplied by the founder (mark `[TO CONFIRM]` if missing), privacy matches reality (camera, location, no analytics).

Technical
- [ ] `npm run build -w @shelfie/web` copies `dist/homepage/*`; `npm run check` still passes.
- [ ] No inline `<script>`, `<style>`, `style=""`, `onclick`; no external URL loaded (grep for `http` in `src=`, `href` of stylesheets, `url(`); console clean under the Vercel CSP header (test with preview or `vite preview` plus header).
- [ ] `/homepage` redirects, `/homepage/` and `/homepage/index.html` load on a Vercel preview; dev URL with `.html` works; result of `/homepage/` in dev recorded.
- [ ] Offline test: copy `homepage/` to a temp folder, open `pitch.html` and `index.html` with network off; layout, images and links work.

UX and a11y
- [ ] `pitch.html`: 6 screens, one Page Down per screen (test 1920x1080 and zoom 125%), no clickable dependency, no autoplay, content visible without animation finishing.
- [ ] Reduced-motion and no-JS: all content visible, no pinned scrubbing; keyboard-only pass of nav, TOC, FAQ, tables; focus visible everywhere.
- [ ] Axe or Lighthouse accessibility at least 95 on home, technology, trust; contrast of pills and small text checked.
- [ ] Widths 375, 768, 1440, 1920: no horizontal scroll (tables scroll inside `.table-scroll`), cards stack, targets at least 44px.
- [ ] Architecture SVG has `title`/`desc` and the text alternative; no text in raster images.

## 8. Open trade-offs (to debate)

- T1: separate `pitch.html` vs making the home itself snap. Chosen: separate (reliability on stage, brief order differs from story order); cost: some copy duplication, and the team's wording "the pitch uses our homepage" is met by a sibling page.
- T2: light theme only, no dark mode (matches /story; less testing).
- T3: fork CSS/JS and assets into `/homepage/` (duplication, drift) vs reference `/story/` (coupling, offline breakage, reveal bug). Chosen: fork.
- T4: 13 pages is a lot for a hackathon deadline; minimum viable cut: `index`, `pitch`, `technology`, `trust`, `market`, `how`, `roadmap`, `developers`, plus 4 legal stubs; `how.html` and `roadmap.html` can start as stubs linking back to home sections.
- T5: redirect `/homepage` -> `/homepage/index.html` (302 now) instead of cleanUrls; ugly `.html` URLs accepted.
- T6: FAQ uses `<details>` on the public home although the pitch brief forbids accordions; acceptable because the pitch page excludes it.
- T7: 5 step cards on the home vs 4 in the pitch brief; keep both, same terms (order, claim, photograph, verify, settle; the pitch merges claim and photograph).
