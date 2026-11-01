# Homepage decisions (`/homepage`), after the planner/investor/accuracy debate

Orchestrator: Claude Opus 5.5 for Helmut (D), 2026-10-30 night. Inputs, in order of authority when they disagree:
1. This file.
2. `homepage-debate-accuracy.md` (wording of every number, technical claim and legal text).
3. `homepage-debate-investor.md` (copy, order, ROI block).
4. `homepage-ia.md` (layout, components, routing, a11y, checklist).
5. `homepage-content-tech.md` (deep dives, receipts, roadmap, developers, legal drafts).
6. `homepage-market-research.md` (sources and arithmetic).

## Resolved trade-offs

| Topic | Decision | Why |
|---|---|---|
| Pitch page (T1) | Separate `pitch.html`, six snap screens per `../archive/homepage-brief.md`, built first | Both reviewers agree; the pinned cart room cannot snap one key per section |
| Pages (T4) | 9 files: `index`, `pitch`, `market`, `technology`, `roadmap`, `developers`, `imprint`, `privacy`, `terms`. `how` and `trust` fold into `technology.html` (`#how`, `#trust`, `#receipts`); build log folds into `roadmap.html#build`; license is a footer link to `LICENSE` on GitHub | The founder asked for roadmap, developers, process and read-more depth (investor's 6-page cut drops two of them); 13 is too many for the night |
| Assets (T3) | Fork into `public/homepage/` with relative links; `home.css` (fork of story.css + components), `doc.css` (subpages), `cart.js` (home only), `site.js` (all pages, never returns early); copy logo and team photos | `/story` stays byte-identical; offline copy works; avoids the reveal bug |
| Theme (T2) | Light only, story tokens | Same look as /story |
| Cart intro | Keep the four-beat cart room from /story, same height | Founder: same look and order as /story |
| FAQ | `<details>` on the home and technology page, never on `pitch.html` | Brief forbids click-only content only on stage |

## Numbers (final; anything else stays off the page)

Home market stats (4), each caption with publisher, year, scope:
- about 20% of CPG revenue goes into trade promotions (McKinsey, 2019)
- $1.7T: what inventory distortion costs retail a year, about two thirds of it out-of-stocks (IHL Group, 2026 estimate). Say "costs", never "sales lost". No $1.1T anywhere.
- about $6B in-store merchandising services (Beroe estimate, 2023)
- $2.35B mystery shopping, a neighbouring service (Straits Research, 2025)

Cost per check (home `#price` and `market.html#cost`): German test purchase from about EUR 50 (mystery.agency); US "quick audit visit" $30-45 (T-ROC 2026 price guide, US, never converted to EUR); Shelfie about EUR 12, illustrative, charged only when the photo passes.

ROI block: 50 stores a month. Test purchases from EUR 2,500; US audit visits $1,500-2,250; Shelfie EUR 600 (illustrative). Caption: a test purchase does more; a Shelfie check proves presence and the shelf price only. No savings percentage, no EUR 120k example.

Market page only: McKinsey 59% of promotions lost money (72% US), profitability wording; TAM = Beroe ~$6B (no SAM); "pilot math" 20 brands x 50 stores x 12 months x EUR 12 = EUR 144,000, labelled our assumptions; unit economics per check (price 12, payout 3.50, verifier < 0.10, escrow and fees ~0.60, all estimates from `slides/facts.tex`) shown as arithmetic with "illustrative target", no margin headline on the home. Dropped: Shop! 70/40, POPAI, Kimberly-Clark, lead times, "10x", Germany market size.

## Wording rules

- Never "agreed price", "enforce", "price compliance" as policing. Say: see what is on the shelf, what the tag says, and whether a paid promotion is visible; "we do not set prices".
- Never "earn" or "get paid" for checkers: "Take a check (test ADA)", "receive test ADA, no monetary value".
- "separate verifier service", not "agent", where it describes the deployment; verifier sold per check over x402.
- Trust cards use the accuracy file's softened wording (no "neither side can touch", no "cannot be hidden", no "refunds automatically" without the window condition).
- Every page footer: "Prototype on Cardano preprod, test money only. Student project at the TUM Blockchain & AI Hackathon 2026, not an official TUM product." No TUM logo.
- Foreign-market problem: the real request was exactly this, a maker abroad who knows nobody in Germany; "We start in Munich, where we can walk the stores ourselves."

## Receipts

Above the table: "Real test transactions from separate runs. No single job has yet gone through the whole chain with a verified real photo; that is our next milestone." Rows grouped by run with a status pill (real run / stub verdict / engine on fakes / no photo). Hashes copied from `codigo/docs/evidence/tx-hashes.md` only.

## Legal

Imprint, privacy and terms per `homepage-debate-accuracy.md` fixes (Art. 13 items incl. consequence of declining, no automated decision with legal effect wording, transfer mechanism, recipients incl. Google, Vercel, Cloudflare, Masumi/Sokosumi, Cardano ledger; BayLDA, Promenade 18, 91522 Ansbach). Missing facts stay as visible `[TO CONFIRM: ...]` markers: postal address, contact email, full legal names. These must be filled before the release to `main`.

## Open for the team

- Fill `[TO CONFIRM]` markers (Helmut).
- Hook photo for `pitch.html` screen 1 (Isabel's shelf photo, brands blurred): until then the screen is text only.
- Replace receipts once a job settles with a verified real photo.

## Update 2026-10-31 (Helmut)

`/homepage` is the startup site after the hackathon; the live pitch uses `/story` (Lorenz and Isabel). `pitch.html` was removed; its CSS in `home.css` is dead code and can go in a later cleanup.
