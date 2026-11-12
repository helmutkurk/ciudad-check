---
name: x402-payments
description: Use when building or validating the x402 verifier seller, buyer payments, preprod facilitator, or worker payout path for role B.
---
# x402 payments (role B)

## When to use

Use for the verifier's paid seller middleware, the engine's buyer, or the W-PAY payout queue.

## Read first

- [Verifier README](../../../codigo/apps/verifier/README.md)
- [Payments README](../../../codigo/packages/payments/README.md)
- [x402 runbook](../../../investigacion/cardano/x402-runbook.md)
- [Contracts](../../../diseno/contracts.md) sections 3–4; [ADR-04](../../../diseno/decisions.md#adr-04-direct-transfer-for-worker-payouts); [milestones](../../../diseno/repo-layout.md#5-definition-of-done-per-milestone)
- [Payments rule](../../rules/payments-and-wallets.md)

## Commands and tests to run

From codigo/:

    npx vitest run packages/payments/src/verify-client.test.ts packages/payments/src/payout-queue.test.ts packages/payments/src/payout-store.test.ts apps/verifier/src/app.test.ts
    npm run check

Fake-first smoke: run npm run hub-up -- --fake, then npm run smoke, then npm run hub-up -- stop. Never call fake output milestone evidence.

## Contracts and invariants

- Preprod only. The verifier sells POST /v1/verify for 1,000,000 lovelace; the buyer cap is 2,000,000 lovelace. Use the hosted preprod facilitator listed in the runbook and verify it Friday.
- Keep W-VBUY (buyer), W-SELL (verifier income), and W-PAY (worker payouts) separate. Amounts stay integer lovelace.
- Verify idempotency key is verify:<submissionId>; payout key is payout:<taskId>. Same key means one effect. Serialize each sender wallet.
- Validate before x402 settlement. Pin the seller payee to SELLER_ADDRESS. A verifier payment does not make a failed verdict payable.
- On uncertain payment outcomes, check the receipt/history and reconcile before retrying. Never automatically re-sign or move UNKNOWN to QUEUED without proof of absence.
- M1 evidence is the paid request receipt/hash to W-SELL. M2 records the verifier hash and confirmed worker payout hash, with preprod explorer screenshots in the evidence log.

## Verify Friday

- Confirm the hosted facilitator, 1 tADA acceptance, PAYMENT-RESPONSE transaction decoding, and seller address pin with one authorised preprod run.
- Confirm plain SDK transfers and metadata before 13:00; follow ADR-04's ordered fallback if needed. Keep ENABLE_DRY=false for evidence runs.
- Record verified endpoints and explorer patterns in codigo/docs/verified.md; use the [evidence procedure](../log-evidence/SKILL.md).

## Do not

- Do not use mainnet, real funds, one wallet for multiple purposes, floating-point amounts, or an unbounded spend cap.
- Do not retry a timed-out payment before reconciliation or log secrets, receipts with private fields, or mnemonics.
- Do not expose the verifier through the public tunnel or use dry/stub output as M1/M2 evidence.
