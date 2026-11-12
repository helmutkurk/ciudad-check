# Slogans and taglines

All slogan options in one place, sorted by audience, with a recommendation and where each line is used. Created 2026-10-30 (Claude for Helmut, D). The canonical tagline stays in `storyline.md` ("Name and tagline options"); this file is the long list behind it.

## Current state

| Use | Line | Source |
|---|---|---|
| Main tagline (deck, Devfolio, video end card) | **Paid only when the photo is true.** | `slides/facts.tex` (`\Tagline`), `devfolio-description.md`, `video-script.md` |
| Three phrases judges must remember | "Paid only when the photo is true." · "The sign in the photo." · "Cardano escrow makes sure nobody pays for a photo that isn't true." | `storyline.md` |
| Vision line | "Proof first, payment second." | `storyline.md` |

Changing the main tagline means editing `slides/facts.tex` (one line), `devfolio-description.md`, `video-script.md` scene 11 and the three-phrases block in `storyline.md` at the same time.

## Criteria

1. Says the mechanism: payment depends on proof.
2. Short: at most 7 words for the tagline, readable on a slide from the back row.
3. True for the demo: nothing about speed, mainnet or real money that we cannot show on preprod.
4. Works for a business jury and for the Cardano judges.

## Options by audience

### A. Core promise (tagline candidates)

| # | Slogan | Words | Notes |
|---|---|---|---|
| A1 | **Paid only when the photo is true.** | 7 | Current. Clear mechanism; already in all pitch files. |
| A2 | **No proof, no payment.** | 4 | Shortest and most memorable; works as slide title and sticker. Does not say "photo" or "shelf". |
| A3 | Proof first, payment second. | 4 | Already the vision line; more abstract. |
| A4 | Pay for shelves you can see. | 6 | Brand-side angle; weaker on verification. |
| A5 | Every shelf check, proven on-chain. | 5 | Strong for the Cardano judges; "on-chain" covers the payments and evidence ledger, not the photo itself. |

### B. Brand-facing (the customer)

| # | Slogan | Notes |
|---|---|---|
| B1 | See every shelf. Pay for the true ones. | Two beats; good for the problem/solution slide. |
| B2 | Stop paying for blurry photos. | Names the pain from the storyline (agencies are paid per visit). |
| B3 | Your shelf, verified. | Minimal; good as a dashboard header. |
| B4 | Know your shelf price today. | Time claim: keep "today", avoid "in minutes" until measured. |

### C. Agentic commerce (track fit)

| # | Slogan | Notes |
|---|---|---|
| C1 | Agents that hire eyes. | Existing option 3; strong image, needs context. |
| C2 | AI thinks. People look. Cardano pays. | Three roles in three beats; good for the architecture slide or the video. |
| C3 | Cardano escrow makes sure nobody pays for a photo that isn't true. | Phrase 3 since the jury review (2026-10-30); keep verbatim. Old: "Agents hire people, and the blockchain pays the bill." |
| C4 | The agent can't see the shelf. So it hires someone who can. | Hook variant; good opening line, too long for a tagline. |

### D. Worker-facing (QR poster, worker page `/w`)

| # | Slogan | Notes |
|---|---|---|
| D1 | **The only selfie that pays.** | Uses the name pun; best for the QR code poster at the stand. |
| D2 | Snap a shelf. Get paid in tADA. | Honest about preprod; "in minutes" only after we measure payout time. |
| D3 | Your walk to the supermarket just paid off. | Friendly; long. |

### E. Playful (social posts, stickers; not for the jury)

| # | Slogan |
|---|---|
| E1 | Smile, shelf. |
| E2 | Say cheese. Prove the price. |
| E3 | Shelfie: proof you can price-check. |

### F. German (Munich audience, stand, posters)

| # | Slogan | Notes |
|---|---|---|
| F1 | **Kein Beweis, keine Zahlung.** | German version of A2. |
| F2 | Preis gesehen. Preis bewiesen. | Rhythm works when spoken. |
| F3 | Ein Foto. Ein Beweis. Eine Zahlung. | Matches the MVP rule: one job = one photo (ADR-16). |
| F4 | Das einzige Selfie, das bezahlt wird. | German version of D1. |

## Recommendation (Claude, 2026-10-30; team decides)

- **Keep A1 as the main tagline.** It already appears in the deck, video and Devfolio text and states the mechanism exactly. Changing it this late costs consistency for little gain.
- **Add A2 "No proof, no payment."** as the slide title for the verifier and escrow beat, and as the short claim on stickers or the stand.
- **Use D1 "The only selfie that pays."** on the QR code poster that brings people to the worker page.
- **Use C2 "AI thinks. People look. Cardano pays."** on the architecture slide if the team wants one line there.
- German lines (F1, F4) only for printed material at the venue; the pitch stays in English.

## Rules

- Do not paraphrase the three phrases in `storyline.md` in the video, the live pitch or Devfolio.
- No time or money claims we have not measured on preprod ("in minutes", euro amounts on worker-facing lines).
- New options go into the matching table above with a note; the chosen one is changed in `storyline.md` and the files listed under "Current state".
