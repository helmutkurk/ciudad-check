# Pitch plan (live pitch, video, tools)

Synthesis of eight advisor passes (market, hook, judges, tools, skeptic, vision, video, delivery) on 2026-10-30. Owner: Lorenz. Once adopted, `storyline.md`, `live-pitch.md`, `video-script.md` and `slides/facts.tex` follow this file; until then they still describe the fictional persona.

## 1. Decisions

| Topic | Decision |
|---|---|
| Hook | The real request replaces the fictional persona (Katharina, Isarquell). Isabel tells it in first person. |
| Customer | "A brand entering a market without a field team: before launch it needs competitor prices and availability in specific stores." One verified photo per product per store. |
| Market | One spoken line on stage, led by the $6B in-store merchandising spend and EUR 12 vs EUR 50; the three-number slide and the vision ladder are backups. No summed markets, no unsourced Germany figure. |
| Arc of the demo | One live photo (green), then the payout tx; the cheat (red, no money) is shown as a screenshot from the morning test while the verifier works (about one minute per check). Script: [director-script.md](director-script.md). Jury review: `../review/pitch-jury-2026-10-30.md`. |
| Voices | Two main voices (Isabel, Lorenz), Fernando one line on the tx, Helmut runs backup and time. |
| Screen | The story page `/story` (2026-10-31; replaces the homepage idea and the Beamer deck), one key press per beat or section. Order: story beats, how it works, receipts on Cardano, price, market, team, close. The Beamer deck stays as offline backup. |
| Honesty | Say "live", "earlier run" or "mocked" for every step. State the limits before a judge does. |

## 2. The hook

Facts to confirm with Isabel before the pitch (her words, not ours): when the request came, how many stores and photos they actually did, how long it took, how many photos were usable. Use only real numbers.

Consent: ask the acquaintance (via Isabel's father) whether the story may be told in public. Never name the person, the drink, the brand or the country of origin. A message screenshot only as a reconstruction, fully redacted, labelled "reconstructed". No reply by Saturday morning: "an acquaintance of my father", no screenshot.

**English (spoken by Isabel, 62 words, about 26 s; source of truth: [live-pitch.md](live-pitch.md)):**
> "A friend of my father's wants to bring a drink to Germany. He asked Helmut and me to photograph his competitors in a few shops: the price, and is it on the shelf. He can't check our photos, and an AI can't see a shelf. So we built an agent that hires a person, and pays only if the photo is true."

**German (if the pitch is in German):**
> "Ein Bekannter meines Vaters will ein Getränk nach Deutschland bringen. Er hat Helmut und mich gebeten, seine Konkurrenz in ein paar Läden zu fotografieren: den Preis, und ob sie im Regal steht. Er kann unsere Fotos nicht prüfen, und eine KI sieht kein Regal. Also haben wir einen Agenten gebaut, der einen Menschen beauftragt und nur zahlt, wenn das Foto stimmt."

Behind her: one or two of their real shelf photos (brands blurred, no people), ideally one blurry or wrong-shelf photo ("he would have paid for this one too").

Thread through the pitch:
- Demo job = "the question he asked us": one competitor drink, one Munich store.
- Isabel during the photo: "This is what I did by hand for him."
- Close: "Next time he doesn't call us. He posts a job. Cardano escrow makes sure nobody pays for a photo that isn't true."

Wording rules:
- Say "a real request", never "our customer", "pilot" or "validated".
- The product proves **price and presence**. Do not claim placement, facings, share of shelf or "market research".
- A study needs many data points; each job buys one; multi-store bundles are roadmap (ADR-16).
- **Check before Saturday (A, C):** the seeded product catalog (ADR-17) must contain the competitor drink used in the demo. If it cannot, say "the demo uses our catalog".

## 3. Run of show (3:00)

The timed script with every spoken line is in [live-pitch.md](live-pitch.md) (one source): 281 words, about 2:00 of speech, about 2:45 with camera, verifier and explorer (15 s slack in a 3:00 slot). The market sentence is optional (only when ahead of time).

## 4. Market (what goes on the slide)

Pain, TAM and neighbour market were checked at the source on 2026-10-30 (values in `slides/facts.tex`). Market-research figures are publisher estimates and differ by definition; always name the publisher and year.

| Layer | Slide text | Source |
|---|---|---|
| Pain | "$1.1T of retail sales lost to out-of-stocks per year" (label: "loss, not revenue") | IHL Group via [Retail Insight Network](https://www.retail-insight-network.com/features/how-overstock-stockouts-and-returns-cost-retail-1-75tn/) (2026-08-06): inventory distortion about $1.7T in 2026, out-of-stocks 65.6% of it. Older IHL figure (2015): $634B |
| TAM | "$6B spent on in-store merchandising per year" | [Beroe](https://www.beroeinc.com/category-intelligence/instore-merchandisers-market/), $6-6.2B, 2023 est., about 5% a year. A "$15-16B third-party merchandising services" figure exists only in a weak aggregator: do not use |
| Neighbour market | "Mystery shopping: $2.35B, paid per visit, usable or not" | [Straits Research](https://straitsresearch.com/report/mystery-shopping-services-market), 2025; $3.75B by 2034 (5.3% CAGR) |
| Software layer (Q&A only) | Shelf image recognition $1.4-3.1B (2024), estimates differ by publisher | Credence, Grand View; not checked at source |
| Bottom-up | "10 stores: EUR 120 with Shelfie vs EUR 500+ for test purchases" (illustrative pricing) | `market-pricing.md` |
| Vision (forecast) | "Agentic commerce forecasts: $0.1-5T by 2030" (the full range, not the top) | McKinsey, Bain, eMarketer |

Spoken (on stage): "Out-of-stocks cost retail a trillion dollars a year, and one test purchase costs fifty euros. Shelfie: about twelve, paid only when the photo is true."

Vision (15 s): "Today it is one shelf in Munich. The same engine works for any fact an agent cannot find online: is the delivery there, is the shop open, is the ramp accessible. Agents will need eyes in the physical world; we make those eyes verifiable and paid."

Do not use: "$1.7T market" (loss incl. overstock and returns), the sum of several markets, the Trax valuation as market size, any Germany market figure (none found), "10x cheaper", EUR next to tADA.

Why making it look bigger than it is backfires: the product claim is "paid only when the evidence is true"; one inflated number that a judge googles discredits every other claim, including "live on preprod". The legitimate way to look big is the ladder: beachhead (brands entering Germany) -> FMCG retail execution DACH -> EU -> any proof-of-physical-world task for agents.

## 5. Defuse inside the pitch, not in Q&A

1. **Demand is not validated.** "One real request; we have not run brand interviews yet. Today we prove the mechanism."
2. **Why a blockchain / the verifier is ours.** Name what is on-chain (escrow lock and settle/refund, payout tx, x402 verifier fee) and say "the verifier is a separate paid endpoint; an independent one is just another URL" (a config change today, not a brand setting).
3. **Location is not proven.** "The hand sign proves the photo is new and made for this task, not where it was taken. Store QR codes are next." Also: "Agencies also fix shelves; we replace only the 'is it there, at what price' check."

Top Q&A to drill (answers in `qa-prep.md`): why blockchain / why not Stripe; GPS spoofing; who the workers are and cold start; Trax, Roamler, BeMyEye exist; what is live vs recorded vs mocked (prepare one honest table on a backup slide); legal: photographing in stores.

## 6. Programs

| Need | Primary | Fallback |
|---|---|---|
| Screen | Story page `/story`, one key press per beat or section | Offline copy (`bash scripts/story-offline.sh`); then committed `slides/shelfie.pdf` on USB and phone |
| Presenting | Story page in Chrome tab 1, full screen (F11) | Backup deck: `pdfpc` / `evince -s` |
| Demo switching | One Chrome window: Sokosumi, verifier, explorer, report; `Ctrl+1..9`; homepage in tab 1; zoom 125%, notifications off | Screenshots in the backup deck |
| Phone on the big screen | The web app (worker verdict card) and the dashboard job page (verdict rows; no per-check view is built), no cable. For the claim and hand-sign moment: `scrcpy` over USB (Android) | iPhone: QuickTime on a Mac; or the phone's screen recording played from the laptop |
| Video capture / edit | OBS Studio + Kdenlive, 1080p30, one headset mic, one narrator | CapCut on a Windows laptop |
| Captions | `whisper video.mp4 --model small --output_format srt`, or Kdenlive speech-to-text | CapCut auto captions |
| Rehearsal | Phone timer at 3:00 + a phone stopwatch held by a non-speaker; `/qa` skill for questions | |
| Network | Phone hotspot on a second device, tested at the venue | Offline kit: PDF, video, step screenshots, tx hashes as text |

Install (Ubuntu; OBS is already there): `sudo apt install pdfpc scrcpy adb kdenlive ffmpeg`. Do not use OBS scenes live; it adds a failure point.

## 7. Video (max 2:30)

| # | Time | Visual | Voice-over |
|---|---|---|---|
| 1 | 0:00-0:12 | Real store, hands only, photographing a drinks tag | The request (short form of the hook) |
| 2 | 0:12-0:24 | Quick cuts: aisles, a blurry photo, a gallery of 40 photos | "Hours of walking, photos nobody can verify, and an agency bills every visit, usable or not." |
| 3 | 0:24-0:32 | Text card | "An AI can write a report about a shelf. It cannot see it." |
| 4-9 | 0:32-2:15 | Sokosumi job and lock tx; cheat red; claim, hand sign, photo, green; payout tx; report and refund | As in `video-script.md` shots 4-10 |
| 10 | 2:15-2:28 | Isabel's real photo, then title card | Callback + tagline |

Rules: store footage is story only, never shown as a demo verification. Ask the store manager; shelves only, no people, staff, screens or receipts. Every earlier-run clip carries "recorded earlier". Minimum viable video: same voice-over over six screenshots, about 1:45.

## 8. Timeline and owners

| When | What | Who |
|---|---|---|
| Fri 15:00 | Story lock: Isabel tells it aloud in 45 s, Lorenz writes it down; real numbers; consent request sent | Isabel, Lorenz |
| Fri today, daylight | Store B-roll, 30 min, 2 shops | Helmut, Isabel |
| Fri 18:30 | Rehearsal 1: paper, timing only, 15 min | all |
| Fri 21:00 | Rehearsal 2: with the demo on fakes, 15 min; no pitch work after 22:00 | all |
| Sat 09:30 | Script frozen; rehearsal 3 full dress with the kill-the-demo drill | all |
| Sat 11:00 | Story page frozen (= feature freeze), offline copy rebuilt | Lorenz |
| Sat 11:00-13:00 | Final demo take on the printed shelf; last paid escrow cycle started by 13:00 | Lorenz (footage), Fernando |
| Sat 13:00-14:15 | Edit, captions, export | Helmut |
| Sat 12:30 | Rehearsal 4 on the real preprod flow | all |
| Sat 14:30 | Devfolio submitted, links checked by a second person | Helmut, Isabel |

Rehearsal protocol: timer held by a non-speaker, stop hard at 3:00; kill-the-demo drill (someone says "dead", switch to the recording within 5 s, same words); Q&A drill, 10 questions, answer starts with the limit, then the mitigation.

Stage rules: no "hello, we are team Shelfie"; open with the first sentence of the story, looking at a judge. One idea per homepage section, at most six words. Pause after the hook and after the red cheat. Non-speakers stand still and face the judges.

## 9. Pitch-day checklist (Sat)

- [ ] Format confirmed with the organisers (2 or 3 min, table or stage); 2-minute cut ready
- [ ] Consent for the story confirmed, or the anonymous wording in use
- [ ] Fresh job pre-created; one settled and one refunded job open in tabs; lock tx tab pre-loaded
- [ ] Laptop on power, zoom 125%, notifications off, no secret in any tab
- [ ] Phone: web app logged in, brightness max, do-not-disturb, screen recording running
- [ ] Props: printed tag of the demo drink, old photo for the cheat on a second screen, code cards only for the `card-pool` fallback (ADR-19)
- [ ] Backup: video and screenshots on USB and phone, tx hashes as text, backup laptop, hotspot, HDMI/USB-C adapter, power strip
- [ ] Balances checked (`W-VBUY`, `W-PAY`)
- [ ] After the pitch: questions we stumbled on into `docs/ai-log.md`
