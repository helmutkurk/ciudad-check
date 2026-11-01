# UI design: visual system and screens

Status: design spec for `apps/web` (owner D), written 2026-10-29 for Helmut's brief: clean, Apple-like, intuitive, one common structure on both apps, and not recognisable as AI-generated. Docs only; nothing is built before Friday 09:00. Behaviour, endpoints and flows: [webapps.md](webapps.md) and [contracts.md](contracts.md) (they win on behaviour; this file wins on looks). Inputs applied: the Apple Human Interface Guidelines (principles, not assets), the `hks-frontend-design` skill (no templated defaults, plain copy, restraint) and the Web Interface Guidelines (accessibility, focus, forms, motion, typography, touch, dark mode). Items marked *decide Friday* are open.

## 1. Subject and principles

Subject: a tool that proves a fact about a shelf and pays for it. The user's real objects are a price tag, a short code, a location, a verdict and a receipt. The design should feel like a well-made utility: calm, exact, a bit like a receipt. The one memorable element is the **challenge code** (large, steady, the only thing on its screen) and the **verdict with its receipt** (one line, one tx link). Everything else stays quiet.

Apple HIG, applied:
- **Clarity**: one job per screen, one primary action, legible type at small sizes, no decoration that carries no information.
- **Deference**: the content (task, photo, verdict) is the interface; chrome is thin, translucent only where it helps (navigation bar over scrolling content), never everywhere.
- **Depth**: layers show hierarchy (page, grouped surface, sheet), done with surface colour and one shadow level, not with gradients or stacked glows.
- Also: direct manipulation where natural (swipe back, sheet drag handle), consistent placement (back left, primary action bottom), the system's own controls for pickers (native `<select>`, native date), and respect for the user's text-size settings.

Structure common to both apps (so they feel like one product): navigation bar with large title, grouped lists on a grey page, one primary button per screen, sheets for focused flows, status pills for state, the same copy voice. Worker app is a single column on a phone. Brand app is the same components in a list-detail layout on wide screens and a single column on a phone.

## 2. Tokens

Define everything as CSS variables; components never use literal colours. One theme: light, on `:root` in `src/styles/tokens.css`. No dark mode and no theme selector (decision Fernando, 2026-10-30); the app stores no theme preference. Palette follows the approved board in `docs/design-implementation-2026-10-30/` (forest, green, light green, sage, cream). Contrast ratios below were computed (WCAG): text at least 4.5:1, large text and UI at least 3:1.

### 2.1 Colour

Brand: forest `#0B2E1F`, green `#2E7D32`, light green `#6BAF5B`, sage `#CFE7C1`, cream `#F5EFE3`. Green is the one accent (primary button, links, selection, focus ring). Amber and red are semantic and appear only as status. Cream is the page. No gradients anywhere. The logo sits on a cream tile (`--logo-tile`).

| Token | Value | Use / contrast |
|---|---|---|
| `--bg` | `#F5EFE3` | page behind grouped lists; text 12.9:1 |
| `--surface` | `#FFFFFF` | grouped list, card, sheet; text 14.7:1 |
| `--surface-2` | `#EDE6D4` | fields, segmented track, pressed row; text 11.8:1 |
| `--text` | `#0B2E1F` | primary text (see the surface ratios above) |
| `--text-2` | `#4A5C52` | secondary text; 6.2:1 on `--bg`; 5.7:1 on `--surface-2` |
| `--separator` | `#DCD3BF` | hairlines (1 px), no borders around cards |
| `--accent` | `#256A2B` | links and text actions; 5.8:1 on `--bg` |
| `--accent-fill` | `#2E7D32` | primary button background; white label 5.1:1 |
| `--success-text` / `--success-bg` | `#1E6B2A` / `#E3F1DA` | pill; 5.6:1 |
| `--warning-text` / `--warning-bg` | `#7A4A00` / `#FBEBC4` | pill; 6.3:1 |
| `--error-text` / `--error-bg` | `#B3261E` / `#FCE8E6` | pill and inline errors; 5.6:1 |
| `--accent-soft` / `--accent-soft-text` | `#CFE7C1` / `#0B2E1F` | tinted chips; 11.1:1 |
| `--camera-chrome` | `#000000` | camera sheet is always black, like the system camera |

State is never colour alone: every pill has a word, and an icon where it helps. Use `rgba` overlays only for the sheet scrim (`rgba(11,46,31,.4)`).

### 2.2 Type

Font stack (decided, Helmut 2026-10-29: system fonts only, no bundled web font): `-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. SF Pro appears where the OS provides it (iPhone, Mac); other devices use their own system font. Nothing is downloaded, so no font request on venue Wi-Fi. The pitch deck uses the same colour tokens and the same type hierarchy as the web app (Helmut, 2026-10-29). Use `font-variant-numeric: tabular-nums` for prices, amounts, countdowns and table columns. Monospace (`ui-monospace, "SF Mono", Menlo, monospace`) only for the challenge code and for hashes, where telling `O` from `0` matters; not for ordinary labels.

| Style | Size / line | Weight | Use |
|---|---|---|---|
| Large title | 34 / 41 | 700 | top of a main screen, collapses to the nav bar title on scroll |
| Title | 22 / 28 | 600 | sheet titles, section screens |
| Headline | 17 / 22 | 600 | row title, button label |
| Body | 17 / 24 | 400 | default text, form values |
| Subhead | 15 / 20 | 400 | secondary lines in rows |
| Footnote | 13 / 18 | 400 | helper text, timestamps, group footers |
| Code display | 48 / 52 | 600, mono, +0.06em | the challenge code, one per screen |
| Number display | 28 / 32 | 600, tabular | payout amount, price read |

Body text never smaller than 15 px on phones; honour the user's font size (use `rem`, test at 130 %). Line length under 70 characters. Sentence case everywhere, including buttons and headings. No all-caps labels, no letter-spaced eyebrows above headings, no accenting a single word in a title.

### 2.3 Spacing, radii, elevation

- **8-pt scale**: 4, 8, 16, 24, 32, 48, 64 (`--s-1` to `--s-7`); 4 only for tight icon gaps. Page gutter 16 px on phones, 24 px on tablets, content max width 640 px on the worker app and 1120 px on the brand app.
- **Tap targets** at least 44 by 44 px; row height 52 (one line) or 64 (two lines); primary button height 52.
- **Radii by role** (not one radius for all): controls and buttons 12, grouped lists and cards 16, sheets 24 on the top corners, pills and the shutter fully round, thumbnails 8. Photos in the job detail use 12.
- **Elevation**: three layers only. Page (no shadow), grouped surface (no shadow; separation by colour), floating (sheet and toast): one shadow `0 8px 32px rgba(0,0,0,.16)`. No glow, no coloured shadow.
- **Translucency**: only the sticky navigation bar and the camera controls (`backdrop-filter: blur(20px)` over `--surface` at 80 %), with a solid fallback when unsupported or when `prefers-reduced-transparency` is set. Nowhere else.

## 3. Components

A small set, written once, used on both apps. Each is a semantic element first (button, a, select, dialog, table).

| Component | Spec |
|---|---|
| **Navigation bar** | 44 px bar with back (left, text "Tasks" or chevron plus label), centred small title that appears when the large title scrolls away, optional text action on the right. Solid `--bg` at the top, translucent on scroll. |
| **Large title** | Left-aligned 34 px title under the bar on top-level screens (Tasks, Requests). One per screen. |
| **Grouped list** | White (`--surface`) rounded 16 group on `--bg`; rows separated by 1 px hairlines inset 16 px from the left; a row has title, optional secondary line, optional trailing value and a chevron when it navigates. Group footer in Footnote for explanations. This replaces most "cards": use a group, not a card per item. |
| **Card** | Only for one self-contained object that is not a list item (the photo with its verdict). Same surface, radius 16, no border, no shadow. Never nested in another card. |
| **Segmented control** | Two to four options (job filters: All, Active, Done; photo type labels). Native-feeling track `--surface-2`, selected segment `--surface` with a subtle shadow. Not used as tabs for more than four items. |
| **Primary button** | Full width on phones, fixed to the bottom safe area (`env(safe-area-inset-bottom)` plus 16 px) with a blurred bar behind it when content scrolls under it; height 52, radius 12, `--accent-fill`, white label in Headline. One per screen. |
| **Secondary action** | Text button in `--accent`, Headline weight, 44 px target, placed directly under the primary button ("Product not on the shelf", "Give task back"). Visually secondary, always visible. |
| **Destructive** | Text button in `--error-text`; confirm in a small action sheet, never a silent delete. |
| **Fields** | Native `<select>` and `<input>` styled with `--surface-2`, radius 12, height 48, a visible `<label>` above (Footnote); helper and error text below; error uses text plus icon, not colour alone; `autocomplete`, correct `type`, never block paste (the wallet address field must accept paste). Dropdowns are native selects so phones show their own pickers. |
| **Sheet** | Native `<dialog>` as a bottom sheet, radius 24 on top, drag handle, scrim, `overscroll-behavior: contain`, focus moved in and returned on close, Escape and the Cancel button close it. The camera flow is a full-height sheet. |
| **Status pill** | Footnote text, 8 by 4 padding, fully round, tinted background plus text from the semantic tokens, with a word: "Open", "Claimed", "Verifying", "Verified", "Not on the shelf", "Rejected", "Paid", "Withheld", "Refunded". |
| **Countdown** | Tabular numerals `04:32`, text colour normal; under 60 s switch to `--warning-text`; the remaining time also in `aria-label`. Not a ring or animation. |
| **Tx link** | Truncated hash (`1a2b...9f`, mono) plus the words "View on explorer", opens in a new tab, `rel="noopener"`, copy button. The link text says the destination. |
| **Toast** | Floating pill at the bottom (above the primary button), one line, auto-dismiss after 4 s, `role="status"` / `aria-live="polite"`, same vocabulary as the action ("Task taken", "Task given back"). Errors that need a decision are inline, not toasts. |
| **Empty state** | Centred on the page: one plain sentence, one line of help, one action if there is one. No illustration, no emoji. |
| **Banner** | Full-width strip for system state (fake payments, override, offline, secure link needed); `--warning-bg` or `--error-bg`; text explains what to do. |
| **Table** (brand) | Real `<table>`, sticky header, tabular numerals, hairline row separators, no zebra stripes; collapses to grouped-list rows below 640 px. |

Icons: a small inline SVG set (about 12 line icons, 1.75 px stroke, 20 px) copied into the repo, `aria-hidden` unless alone; icon-only buttons have `aria-label`. No emoji as icons, no icon font, no icon in front of every heading.

## 4. Motion

Motion explains a change; it does not decorate. Durations 150 to 250 ms, ease-out (`cubic-bezier(.2,.8,.2,1)`), only `transform` and `opacity`, never `transition: all`, and every animation is interruptible.
- Used: sheet slide up and down, a task row fading out when another worker claims it (and a row sliding in when a new task arrives, 200 ms), pressed state on rows and buttons (surface colour), verdict panel appearing once when the result arrives (opacity and 8 px rise), the shutter press.
- Not used: entrance animations on every section, hover lifts on cards, parallax, looping animations, confetti. The only attention-seeking moment is the verdict.
- `@media (prefers-reduced-motion: reduce)`: sheets and rows change by opacity or appear instantly; no slides.
- The live feed must not reorder rows under the user's thumb: new tasks insert at the top only when the list is scrolled to the top, otherwise a "1 new task" pill appears.

## 5. Copy

Plain verbs, short, active voice, sentence case, no hype, no emojis, no apology. A button names what happens ("Take this task", "Open camera", "Request check"), and the same word is used through the flow (take, give back). Name things as the user does: task, code, photo, store, payout, not "claim token" or "attempt id". Errors say what happened and what to do:
- "Another worker was faster." / "You are about 240 m from the store. Move closer and shoot again." / "Weak location signal. Wait a few seconds or step outside."
- "We could not read the code K7Q-4XM. Hold the paper closer and try again."
- Empty feed: "No tasks in Munich right now. New ones appear here as they arrive."
- Brand: "Request check", "Not on the shelf at Store A, 14:32", "Result withheld. Your fee is refunded."
Use `translate="no"` on codes, hashes and addresses. Numerals for counts, `Intl.NumberFormat` and `Intl.DateTimeFormat` for amounts and times, a non-breaking space between number and unit (`3 tADA`, `150 m`), the ellipsis character in loading text ("Getting location…"). Never show a EUR equivalent of tADA. English in the MVP; strings live in one catalogue (webapps.md section 2.6).

## 6. What reads as AI-generated, and what to do instead

| Tell | Do instead |
|---|---|
| Purple-blue or any gradient, gradient blobs, glow behind a hero | Flat `--bg`; one accent used for actions only |
| Glassmorphism on every card | Translucency only on the nav bar and camera controls |
| Generic hero ("Revolutionize retail with AI") | No hero. The first screen is the task list; the first brand screen is the request form or job list |
| Emoji or colourful icon sets as decoration | Thin line icons, only when they aid recognition |
| Everything in identical rounded cards with the same soft shadow | Grouped lists with hairlines; a card only for one self-contained object; radii by role |
| Tracked-out caps eyebrow above each heading, middle-dot meta strings, "→" in buttons, "WORD — fragment" labels | Sentence case; one title per screen; a secondary line in Subhead; chevrons only on navigating rows |
| A big number with a small label plus a stat row as the default dashboard | Show the job, its state and its receipt; numbers only where they answer a question (verification spend, payout) |
| Fade-and-slide-up on every section, hover lifts | One verdict moment, sheet and row transitions; reduced-motion honoured |
| Numbered 01/02/03 step markers on non-sequences | Number only the four task steps (a real sequence) |
| Tinted near-black everywhere, monospace for small labels | `--text` on `--bg` as above; mono only for code and hashes |
| Filler copy and exclamation marks | The copy rules in section 5 |

Self-check before showing a screen: cover the logo; if it could be any SaaS landing page, remove decoration until it is a shelf tool. Remove one element from each screen before shipping it.

## 7. Screens

Wireframes with behaviour are in webapps.md (W0 to W6b, C1 to C4). Here is the visual structure per screen. Worker app: phone portrait, single column, 16 px gutters. All screens use the light theme only, 130 % text and VoiceOver/TalkBack order = visual order.

### 7.1 Worker app

**W0 Sign in with wallet.** Centred content in the upper half; no logo block, the product name as Large title ("Shelfie") and one sentence under it ("Get paid for photos that prove the shelf."). Group with one row "Connect wallet" (only rendered if `window.cardano` exists) and a field "Payout address" (paste allowed, validated on blur, error inline) plus "Name". Primary button "Continue" at the bottom. Group footer: "Shelves only. No people in photos. Your address is where payouts go; nothing else is stored." The wallet connection is read-only: no signing prompt.

**W1 Task feed.** Large title "Tasks in Munich"; the wallet short address as a trailing text in the nav bar. One grouped list; each row: product (Headline), store and street (Subhead, `--text-2`), trailing reward "3 tADA" (tabular) with time left under it, chevron. No cards, no avatars, no map. Rows animate out when claimed by someone else, in when new. Empty state and location-off banner as in section 3. Pull to refresh is a fallback only (the list is live).

**W2 Task detail.** Large title is the product; subtitle the store. Group 1: the four steps as a numbered list (a true sequence, so numbers are allowed): find the product, write the code on paper, hold it next to the price tag, take one photo with the in-app camera. Group 2: reward and attempts left as two key-value rows. Footer: "No product there? You can report the empty shelf spot." Primary button "Take this task". No secondary action yet.

**W3 Claimed: code.** The calmest screen. Countdown in the nav bar. The code in Code display, centred in a `--surface` group with generous padding (this is the single memorable element); under it two lines of instruction in Body. Primary "Open camera". Directly beneath, in order: secondary "Product not on the shelf", then "Give task back" (destructive weight only after a confirm sheet). The code stays visible when the sheet is closed again.

**W4 Camera capture sheet.** Full-height sheet, black chrome, live preview filling the width. Top bar (translucent): "Cancel" left, title "Price photo" (or "Empty shelf spot" in out-of-stock mode) centre. A thin frame guide with a one-line hint under it ("Keep the price tag and the paper in frame"). Bottom controls: code and countdown in small mono and tabular text on the left, shutter (72 px round) centre; below it the text action "Product not on the shelf" (or "Back to price photo" in out-of-stock mode). Above the shutter a **location status line** with an icon and a word: "Getting location…", "Location ok, 22 m from the store" (success text), "Weak signal, wait a moment" (warning text), "Location off. Allow it in browser settings" (error text, shutter disabled). No gallery thumbnail, no file button. After the shutter: a preview with "Retake" and "Use photo" (primary), then upload progress as an inline line, not a modal. Over HTTP the sheet is replaced by a banner: "Open the secure link to take the photo."

**W5 Rejected.** Result page (not a sheet). Status pill "Rejected", Title with the reason from `workerMessage`, attempts left as a row, primary "Try again (new code)", secondary "Back to tasks". A location refusal never reaches this page; it appears inside W4 as an inline message and the sheet stays open.

**W6 Verified.** Pill "Verified", Number display for the payout ("3 tADA") and a grouped list: price read, payout status (Queued, Sending, Confirmed), tx link. Primary "Next task". Status text changes in place (aria-live), no confetti.

**W6b Verified, not on the shelf.** Same layout; pill "Not on the shelf"; title "Verified: not on the shelf"; rows: label read, payout (same amount), status, tx link.

### 7.2 Brand app

Layout: on widths from 1024 px a sidebar list-detail (left column job list 360 px, right detail), on narrower screens a single column with a back button. Top navigation: a segmented control at the top of the list column (Requests, Ledger) rather than a nav menu; the operator tools are hidden until the admin token is entered. Stage mode (a URL flag) raises the base size to 20 px and hides operator controls.

**B1 New order (`/dashboard`, ADR-20 amended Helmut 2026-10-30).** Product dropdown, chain filter and labelled native multi-select of catalog stores. No free-text order fields. Brand access code outside the form, in tab memory only. Available price information as read-only text; unknown prices explicit. Primary "Place order". Each order shows per-store status and opens the existing B3 timeline/report. Operator demo/override controls are in a collapsed Operator disclosure and require the operator token. Existing tokens/components stay; D-37 is separate.

**B2 Job list.** Large title "Requests". Segmented filter All, Active, Done. Grouped list; row: product and store (Headline, Subhead), trailing status pill, and a time. Rows update live (SSE). Empty state: "No requests yet. Create one to see it here." with a text action "New shelf check". Banners above the list for fake payments, override and low wallet balance.

**B3 Job detail.** Nav bar back to "Requests". Title: product; subtitle: store and time window. Sections in order: (1) status pill and one sentence ("Waiting for a worker", "Photo is being verified", "Delivered", "Withheld, fee refunded"); (2) the photo card, the only card on the page: the worker's photo at full width with the extracted price highlighted by an overlay box, below it the verdict as a grouped list (code matched, product matched, price 2.49 EUR, taken at 10:42:07, within 18 m of the store) each row with a pill; (3) receipts group: escrow lock, verification payment, worker payout, settlement or refund, each a tx link; (4) report group: "Download report". Failed attempts show as collapsed rows "Attempt 1: Rejected, code not readable" so the history stays but does not dominate.

**B4 Out-of-stock result.** Same layout as B3 with: the pill "Not on the shelf"; the sentence "Not on the shelf at Store A, 14:32. The shelf label for Example Pale Ale was read and the spot above it was empty."; the photo card shows the label region highlighted; verdict rows: label matched the product, shelf spot empty, code matched, within 22 m of the store. A footnote states what the observation means and what it does not (a single worker observation at one time; it does not say why the product is missing). The report is delivered and the escrow settles; the receipts group is identical.

**B5 Ledger.** Large title "Ledger". A real table (seq, time, event, detail, tx) that becomes a list on phones; wallet balances in a small group at the top; live connection state as a banner only when it drops.

## 8. Implementation hints for Friday (D)

- Plain CSS with variables in one `tokens.css` plus one `components.css`; no CSS framework required. A heavy UI kit (MUI, Chakra, Ant) fights this look and costs build time; decide with D, default is none. If D wants utility classes, Tailwind via the build is acceptable, with the tokens above mapped into its theme.
- About 14 React components: `NavBar`, `LargeTitle`, `Group`, `Row`, `Button`, `TextButton`, `Field`, `Select`, `Segmented`, `Pill`, `Sheet` (on `<dialog>`), `Toast`, `EmptyState`, `Banner`, `TxLink`, `Countdown`. Build them in the first two hours against fixtures, before the data is real.
- Camera: `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })`, draw a frame to a canvas, `toBlob("image/jpeg", 0.85)`, resize to the size limit; read `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }` at shutter time and send both. Do not render any `<input type="file">` in the worker app (a component test asserts it).
- Live feed: `EventSource` on `/api/tasks/stream`, reconnect with backoff, 3 s polling fallback; keep the list keyed by task id.
- Accessibility floor: visible focus ring (`outline: 2px solid var(--accent); outline-offset: 2px`), `touch-action: manipulation`, `aria-live` for results and countdown text, semantic table, form labels, `env(safe-area-inset-*)` on the bottom bar, test with the system font size at 130 % on a real phone.
- Check before M6: Lighthouse accessibility, one run on iOS Safari and Android Chrome, one with reduced motion on.
- Not decided here: app icon and name lockup (text-only "Shelfie" in the nav bar is enough), screenshot style for the pitch, and whether the pitch slides adopt these tokens (they do not have to).
