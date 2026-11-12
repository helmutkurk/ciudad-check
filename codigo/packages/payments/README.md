# packages/payments

Status: implemented with fake and real preprod adapters. Historical transactions are in `codigo/docs/evidence/tx-hashes.md`; current operation is in [STATE](../../../docs/STATE.md). No live payments were repeated during cleanup.

## Purpose

Wallet signers, x402 buyer with spend cap, plain-transfer payout adapter, per-wallet serial queue with write-ahead log and on-chain reconcile, plus fakes.

## Owner and starting point

- Owner role: B (person per role: `scripts/team.conf` and `.github/CODEOWNERS`).
- Starts from: x402-express `buyer.ts` and `wallet.ts` patterns; Cardano SDK from the template (`@evolution-sdk/evolution`, pinned; verify Friday that plain transfers and metadata work).

## Responsibilities

- `VerifyClient` and `PayoutAdapter` / `PayoutQueue` per contracts section 4.
- `FakePayoutAdapter` and `FakeVerifyClient` with fault injection.
- Separate wallets W-VBUY and W-PAY; concurrency 1 per wallet.

## Interfaces

- [contracts.md section 3.3 and section 4](../../../diseno/contracts.md); [domain-model.md sections 2.4, 3, 4, 6](../../../diseno/domain-model.md); ADR-04 and ADR-08 in [decisions.md](../../../diseno/decisions.md).

## Milestones

- M1 (Fri 11:30), M2 agent pays agent and human (Fri 15:00).

## Definition of done

- M2: a payout tx confirmed on preprod; both hashes in the ledger; resending a submission does not pay twice.
- Fault-injection tests: timeout then reconcile gives exactly one payout; concurrent enqueue of one task gives one payout.
- If SDK plain transfers fail by 13:00 Fri, apply the ADR-04 fallback and tell everyone.

## Do not

- Do not move `UNKNOWN` to `QUEUED` without a reconcile that proves no transfer exists.
- Do not re-sign an x402 payment on timeout before checking history.
- Never commit mnemonics; one env variable per wallet.

## What exists (`src/`)
- `createVerifyClient(env, logger, { expectedPayTo?, fetchImpl?, statePath? })`: `VERIFIER_PAYMENT=off` -> `DryVerifyClient` (calls `POST /v1/verify-dry`, no money, tx hash is `dry-run:<key>`); else `FAKE_PAYMENTS` -> `FakeVerifyClient`; else `X402VerifyClient` (x402 buyer: `wrapFetchWithPayment`, `toClientCardanoSigner` from `VBUY_MNEMONIC_1/2`, `setSpendControls` with `VERIFY_MAX_PRICE_LOVELACE`, optional payee pin `expectedPayTo` = `SELLER_ADDRESS`, one payment in flight per wallet, round robin over `VBUY_WALLETS`, receipt per idempotency key, `Idempotency-Key` header). Returns `{ verdict, txHash, receipt }`. After a payment was signed and the outcome is unclear (connection drop, timeout, a 402 or a foreign error after signing, an unreadable verdict), the key is frozen (`uncertainKeys`, `resolveUncertain`): no automatic re-sign. With `statePath` (the engine uses `verify-client.json` next to its store) receipts, frozen keys and a write-ahead pending mark are kept in a JSON file (fsync, atomic rename): after a restart a paid key is answered from the file and a key that was mid-attempt at a crash loads as frozen; a corrupt file stops the client (`verify-state.ts`).
- `createPayoutAdapter(env, logger, walletIndex?)`: `FAKE_PAYMENTS` -> `FakePayoutAdapter`; else `EvolutionPayoutAdapter` (`@evolution-sdk/evolution` 0.5.14: seed wallet + Blockfrost, `payToAddress` + `attachMetadata({ label: 674, msg: [tag] })`, `build -> sign -> submit`; `find` by metadata tag, `confirmations`, `balance` via Blockfrost REST). Errors before submit carry `details.notSent = true`.
- `createPayoutQueue({ adapter, store, clock, logger, ids?, onEvent?, ...caps })`: write-ahead (`SENDING` durable before `send`), reconcile by metadata tag, `UNKNOWN -> QUEUED` only with proof (lookup succeeded, nothing found, settling delay over or `notSent`), never resends on an inconclusive lookup, pauses on insufficient funds / daily cap, hard cap `MAX_PAYOUT_LOVELACE`, concurrency 1, idempotent on `payout:<taskId>`. Extras: `recover()` (start-up), `reconcile(id)`, `pollConfirmations()` (also looks up `UNKNOWN` payouts once the settling delay is over, at most every `reconcileIntervalSec` = 30 s each; this automatic path only finds a transfer (`UNKNOWN -> SUBMITTED`) and never requeues on absence, since Blockfrost does not see mempool txs; absent, or `SUBMITTED` and unconfirmed after `staleAfterSec` = 600 s, emits `PAYOUT_STALE` once; requeue stays with `recover()` or the operator's `reconcile(id)`), `status()`, `resume()`, `retry(id)`, `markPaid(id, ref)`, `drain()`.
- `InMemoryPayoutStore`, `FilePayoutStore` (fsync + atomic rename; refuses a corrupt file).
- Fakes: `FakePayoutAdapter` (fault injection: `timeout_after_send`, `timeout_before_send`, `crash_before_send`, `crash_after_send`, `insufficient_funds`; `findFails`, `rejectTx`, `setBalance`), `FakeVerifyClient` (+ `fakeVerdict`, `failNext`). Fake hashes never look like real ones; `isRealTxHash` tells them apart.

## Env names
`FAKE_PAYMENTS`, `VERIFIER_PAYMENT`, `VERIFIER_URL`, `ENGINE_TOKEN`, `ADMIN_TOKEN`, `VERIFY_MAX_PRICE_LOVELACE`, `VBUY_WALLETS`, `VBUY_MNEMONIC_1/2`, `PAY_MNEMONIC_1/2`, `BLOCKFROST_PROJECT_ID`, `PAYOUT_LOVELACE`, `PAYOUT_MAX_ATTEMPTS` (the engine passes the last two to the queue). Only this package reads `*_MNEMONIC_*`.

## Run
`npm test -w @shelfie/payments`. Fault-injection tests (repo-layout section 4): timeout after send then reconcile gives one payout; crash between write-ahead and hash (no transfer, and transfer-but-hash-lost); concurrent enqueue of one task; insufficient funds pauses; caps; inconclusive reconcile never resends; automatic reconcile on poll (no lookup inside the settling delay, throttled, finds a timed-out transfer without resending, never requeues on absence, fails closed without `sendingSince`); stale alert raised once.

## Build-era open questions (reconcile with verified.md before reuse) (record answers in `codigo/docs/verified.md`)
- ADR-04: a plain preprod transfer with metadata from `EvolutionPayoutAdapter` was never executed. If it fails by 13:00 Fri: fallback order in ADR-04 (Lucid/Mesh behind `PayoutAdapter`; worker address as x402 `payTo`; manual `markPaid`, flagged).
- Metadata label 674 and `{ msg: [tag] }` shape; Blockfrost base URL (`BLOCKFROST_PREPROD_URL`); the REST shapes used by `find`, `confirmations`, `balance` (written from the public API reference). Blockfrost does not list mempool transactions, hence the settling delay before "absent" counts as proof.
- x402 buyer: whether 1 tADA passes the facilitator (else 2 tADA), `PAYMENT-RESPONSE` decoding (`getPaymentSettleResponse`), payee pin (`SELLER_ADDRESS` is now in the engine env schema and wiring passes `expectedPayTo`; a hosted paid run is still pending).
- Cardano validity interval (TTL) the SDK sets by default. Until it is known, a stale `SUBMITTED` payout (`PAYOUT_STALE`) is only an operator alert: the tx can still land until its TTL, so resending could pay twice.
- `PAYOUT_DAILY_CAP_LOVELACE` is validated in core and passed by engine wiring (default 50 tADA).
- Engine wiring now connects queue `onEvent` to the evidence ledger and defaults the file store beside the engine journal. Verify/payout hashes are covered by a fake integration regression. Queue observer exceptions are still swallowed; audit this before evidence runs.
