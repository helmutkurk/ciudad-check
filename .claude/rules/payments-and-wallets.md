---
paths:
  - "codigo/packages/payments/**"
  - "codigo/apps/engine/**"
  - "codigo/apps/verifier/**"
  - "codigo/scripts/**"
---
# Payments and wallets

- **Preprod only.** Never configure, call or document mainnet. Test ADA only; no real money, no real names or addresses of third parties.
- Wallets (see `diseno/README.md`): `W-SELL` (verifier receives x402 fees), `W-VBUY` (engine pays the verifier), `W-PAY` (engine pays workers), `W-MPS` (Masumi seller wallet). Never reuse one wallet for two purposes.
- Amounts are integers in **lovelace** (1 tADA = 1_000_000). Convert to tADA only for display.
- Every payment-causing operation takes an **idempotency key** (domain-model section 6). Same key twice = one transaction, same result. Write-ahead log before sending; reconcile on-chain after a timeout.
- One serial queue per sender wallet (concurrency 1).
- The x402 buyer has a spend cap; do not remove it.
- **Never log, print, commit or paste mnemonics, signing keys, Blockfrost keys or Masumi `ADMIN_KEY` / `ENCRYPTION_KEY`.** They live in the local `.env` only; `.env.example` has names only.
- Fakes first: `FAKE_PAYMENTS=1` must work without any wallet. Real runs are marked in the UI and logs.
- Every real transaction hash goes to `codigo/docs/evidence/tx-hashes.md` (skill `log-evidence`).
- Plain transfers from the SDK are a "verify Friday" item; record the answer in `codigo/docs/verified.md`.
- Security baseline (`diseno/security.md` section 3.1): hard caps in code (`MAX_PAYOUT_LOVELACE`, per-run and daily totals); payout address comes from the stored claim, never from the triggering request; payee of an x402 payment must equal `SELLER_ADDRESS`; only this package reads `*_MNEMONIC_*`.
- Never move `UNKNOWN` to `QUEUED` without a successful reconcile; never resend after an inconclusive reconcile.
- A payout needs an effective pass Verdict, unique `payout:<taskId>` and the fault-injection tests (timeout, crash after write-ahead, concurrent enqueue) in the same commit.
- Verifier: `POST /v1/verify` only behind x402; `ENABLE_DRY=false` outside dev; `X-Engine-Token` required; bind `127.0.0.1`.
