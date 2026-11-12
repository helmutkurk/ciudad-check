# Pitch jury review, 2026-10-30

Simulated jury of five subagents on `pitch/live-pitch.md` (commit 1845c3a) and `pitch/slides/shelfie.pdf`, then a moderator round. Not applied to the script yet.

## Round 1 scores

| Judge | Score | Strongest | Biggest weakness |
|---|---|---|---|
| Cardano Foundation | 7.0 | Cheat first, then green, then payout | Chain visible in one live tx only; "why Cardano" only in backup; verifier payment looks circular |
| VC | 6.0 | Real first-person hook | No customer evidence; top-down market only; beyond slide dilutes the beachhead |
| Technical skeptic | 7.0 (honesty 9, robustness 5) | "What is real today" slide | "Separate verifier agent" overclaimed; code proves freshness, not the shop; latency unmeasured |
| Pitch coach | 7.0 | Opening without "hello"; callback close | Tagline said once; slide reading after the payout peak; jargon; 7-box diagram |
| Target customer (export manager) | would buy 6/10 | The real request is his situation | Blockchain framing, global market numbers, beyond slide; needs many stores per job (roadmap) |

All five: replace the hook placeholder with a real photo; fill or cut every `[TODO]`/`[XX]` in the backups.

## Round 2 decisions (moderator)

| Conflict | Decision |
|---|---|
| Market slide live vs backup | Three-number slide to backup; one spoken line led by the $6B spend and EUR 12 vs EUR 50 |
| Vision beat vs honesty | "Today / next" replaces "beyond"; roadmap slide to backup |
| More chain vs less jargon | Name each receipt once in plain words; show the x402 fee tx live next to the payout; new slide "Every step is a receipt on Cardano" |
| Location limit | One clause in the "today" beat, not at the green moment |
| "Separate verifier agent" | "Separate service. Today we run it; the brand can swap its URL." |
| Competitors | Q&A only |
| Tagline | Three times: hook, 0:28, close |
| Close | "Cardano escrow makes sure nobody pays for a photo that isn't true." |
| "Every store by Friday" (customer) | Rejected: bundles are roadmap |

Revised run of show: 298 words, 6 live slides (hook, 4-step flow, live demo, receipts, today/next, close). Estimated consensus 6.6 before, 7.4 after; VC and customer stay capped by missing customer evidence and single-store jobs.

## Q&A to rehearse

1. "Both wallets are yours, why a blockchain?" The brand's money sits in escrow, not with us, and returns automatically if no photo passes; the verifier is a URL the brand can swap; every check is a public receipt.
2. "Second phone, wrong shop?" The code proves fresh and made for this task, not the shop; store-owned QR codes close that gap, not built yet.
3. "Who pays; BeMyEye, Roamler?" One real request, no brand interviews yet. They sell per visit, usable or not; we charge only for a photo that passes, and an agent can hire us without a contract.

Open check before adopting: confirm the x402 verifier fee appears as its own preprod tx on the explorer (B), else the receipts slide and the 1:45 line must say "logged" instead of "on preprod".
