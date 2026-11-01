# Homepage brief (pitch screen)

Decision (team, 2026-10-30 evening): the live pitch uses our homepage instead of the Beamer deck. The homepage explains the vision and is **scrolled only, never clicked** during the pitch. Style reference: [omarchy.org](https://omarchy.org): one long page, big hero, then short sections (heading, one or two sentences, a few cards).

The UI team builds it; this file is the content brief from the pitch side (C, Lorenz). Where it lives, stack and look are the builders' call (look: `../diseno/ui-design.md` tokens if they fit). The deck in `slides/` stays as the offline backup.

## Rules for the page

| Rule | Why |
|---|---|
| Scroll only: no tabs, accordions, carousels, hover-only content, modals, or "read more" | Nobody clicks on stage; what is hidden is not seen |
| Pitch sections 1-6 below are each one full screen (`100vh`), in this order; one Page Down / Space lands exactly on the next one (e.g. `scroll-snap-type: y mandatory` or anchors) | Fernando scrolls with one key per beat, no fine scrolling |
| Readable from the back row on a projector at 1920x1080, browser zoom 125%: heading at most 6 words, body at most 2 short sentences per section | Judges glance, they do not read |
| No autoplay video, no animation that must finish before the content is visible, no sound | Timing is tight (2:45 of 3:00) |
| Static and offline-capable: all images and fonts local, no live API calls to engine, verifier or explorer | Venue network may fail; the page must still render from a saved copy |
| Honest labels: "Cardano preprod", "test ADA", "earlier run" next to every tx; prices marked illustrative | Same honesty rule as the pitch (`pitch-plan.md` section 1) |
| Privacy: shelf photos with brands blurred and no people; never name the person, drink, brand or country of the real request | Consent rule (`pitch-plan.md` section 2) |
| No secrets, no full worker addresses; tx hashes copied from `../codigo/docs/evidence/tx-hashes.md`, never typed from memory | Repo is public |

## Sections in scroll order

Facts (tagline, prices, market numbers, team) come from [`slides/facts.tex`](slides/facts.tex), the single source; copy values from there. Timings refer to the run of show in [live-pitch.md](live-pitch.md).

| # | Section | Shown at | Content |
|---|---|---|---|
| 1 | Hook | 0:00-0:27 (Isabel) | One real shelf photo from Isabel's walk, full width. At most one line, e.g. "An AI can't see a shelf." No logo or tagline yet |
| 2 | Hero | 0:27-0:35 (Lorenz) | "Shelfie", tagline "Paid only when the photo is true.", subline "For brands entering a market without a field team." |
| 3 | How it works | 0:35 (Fernando), before switching to the demo tabs | Four steps as four cards: brand posts a job (fee in escrow on Cardano) -> a person in the store takes the photo with a one-time hand sign -> a verifier agent checks it (paid per check over x402) -> pass: worker paid, report delivered; fail: brand refunded |
| - | (live demo) | 0:35-2:00 | Not on the homepage: Sokosumi, app, verifier and explorer tabs |
| 4 | Receipts on Cardano | 2:00-2:17 (Lorenz) | Five rows: lock, x402 fee, payout, settle, refund; each with a short hash and "Cardano preprod, earlier run". Optional QR code per row (to be scanned, not clicked). The x402 fee is its own tx (checked, M1). Settle and refund rows say "escrow test run" until a Shelfie job with a verified photo has settled (the settlement on record is from the starter agent, the refund from a run on fakes; `live-pitch.md`) |
| 5 | Today / next | 2:17-2:35 (Lorenz) | "Test purchase: EUR 50+. Shelfie check: about EUR 12." (illustrative). Today: one shelf, preprod, one real request. Next: store QR codes for location, multi-store jobs |
| 6 | Close | 2:35-2:45 (Isabel) | "Nobody pays for a photo that isn't true." plus the tagline. Nothing else |
| 7+ | Below the close (Q&A, Devfolio visitors) | not scrolled on stage | Vision: "Agents will need eyes in the physical world; we make those eyes verifiable and paid." with the ladder (shelf checks -> deliveries, opening hours, accessibility). Market: the three figures with publisher and year (`pitch-plan.md` section 4). The verifier gates in one card row. Team: four names and roles. Links: repo, video |

Spoken text stays in `live-pitch.md`; the page shows less than is said, never more.

## Timeline

| When | What |
|---|---|
| Sat 09:30 | Usable version for rehearsal 3 (sections 1-6 complete, placeholders allowed in 7+) |
| Sat 11:00 | Frozen with the script (feature freeze); saved offline copy on the pitch laptop and a USB stick |
| Sat 12:30 | Rehearsal 4 on the real flow, page served from the offline copy |

Open (UI team): URL for Devfolio (`devfolio-description.md` links), who updates the hashes in section 4 after the last escrow cycle.
