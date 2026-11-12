# Risk register (top 15)

> Historical build reference (2026-10-30/31), retained for unique scenarios, risks or design rationale. Current operation: [STATE](../docs/STATE.md). The backend is offline; old service, timing and implementation instructions are not current.

L = likelihood, I = impact (H/M/L). Owner = role A–D.

| # | Risk | L | I | Owner | Mitigation | Trigger | Fallback |
|---|---|---|---|---|---|---|---|
| R1 | Masumi escrow cycle takes >=60 min and slips past the deadline | H | H | B | Start the first cycle Friday 18:00; last cycle by Saturday ~13:00 | No cycle started by 18:00 | Show lock tx and earlier-run evidence; escrow as roadmap |
| R2 | Payment Service setup (Postgres, seed, V2 registration) fails | M | H | B | Docker Postgres tested Thursday; follow pinned commits; Masumi 1:1 | Not registered by 17:00 | Demo M1-M3 + M6; escrow shown as design |
| R3 | Human payout is a plain transfer, not x402; SDK usage unclear | M | M | B | Verify Friday morning with Evolution SDK / workshop | Transfer not working by 15:30 | ADR-04 fallback order in `../diseno/decisions.md` (Lucid/Mesh transfer; worker address as `payTo` of a tiny engine seller route; labelled manual payout with tx hash) |
| R4 | Vision model misreads printed tags | M | H | C | Large high-contrast tags; test with real phone photos Friday 11:00 | >2 of 10 test photos misread | Labelled demo-only manual override; simpler tag layout |
| R5 | Facilitator or Blockfrost down/slow during judging | M | H | B | Local facilitator (`npm run facilitator`) ready; prior tx hashes in ledger | 402 retries fail twice | Replay recording + ledger of earlier txs |
| R6 | Double payment / stuck 402 retry | M | M | B | Check address on Cardanoscan before retrying; idempotent handlers | Timeout after ~1 min | Mark in ledger; continue from verified state |
| R7 | One wallet cannot pay concurrently | M | M | B | Serialise calls or separate wallets per role | Parallel call error | Queue the verifier calls |
| R8 | Worker process stops (two workers, sleep, grant_required) | M | H | A | One owner, PC awake, plugged in; follow pitfalls | Task stuck READY | Restart per runbook; no auto-retry of pending writes |
| R9 | Test funds unavailable (faucet/dispenser limits) | M | M | B | Request early; two sources; email code ready | Balance <10 tADA Friday 12:00 | Ask mentors/organisers; use smaller prices |
| R10 | Wrong tUSDM token / network mix-up | L | M | B | Price in lovelace; confirm Preprod everywhere (MCP defaults to mainnet) | Payment rejected for asset | Switch to lovelace routes |
| R11 | Leaked key or mnemonic in the public repo | L | H | B | .gitignore first; secret scan Saturday 13:30 | Scan hit | Rotate keys, rewrite history before public |
| R12 | Store b-roll refused or unusable | M | L | D | Ask permission; own shelf at the venue | Refusal | Own shelf footage |
| R13 | Location spoofing questioned by judges | M | M | D | Say it plainly: code proves freshness, not location; roadmap store-owned QR | Judge asks | Show the cheat-attempt rejection and roadmap |
| R14 | Team fatigue, scope creep | H | M | D | Freeze at Saturday 11:00; checkpoint 17:00; sleep in turns | Features added after freeze | Cut to the milestone ladder; M1-M3 + M6 suffice |
| R15 | Tracks/rules surprise (code before 09:00 ruling, multi-track, deadline) | L | H | D | Ask organisers Thursday; read Devfolio rules | Ruling contradicts plan | Adjust: nothing in the plan depends on pre-event code |
