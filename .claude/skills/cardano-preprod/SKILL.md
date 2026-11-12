---
name: cardano-preprod
description: Use when any role funds, checks, pays, records evidence, or links a Cardano transaction for Shelfie.
---
# Cardano preprod (all roles)

## When to use

Use before wallet funding, x402, payouts, escrow, evidence capture, or explorer-link work.

## Read first

- [Cardano design and wallet names](../../../diseno/README.md), [payments rule](../../rules/payments-and-wallets.md)
- [Contracts, hub scripts](../../../diseno/contracts.md#56-hub-scripts), [decisions](../../../diseno/decisions.md), [x402 runbook](../../../investigacion/cardano/x402-runbook.md), [Masumi runbook](../../../investigacion/cardano/masumi-runbook.md)
- [Evidence log skill](../log-evidence/SKILL.md) and [milestone criteria](../../../diseno/repo-layout.md#5-definition-of-done-per-milestone)

## Commands and tests to run

From codigo/:

    node --import tsx scripts/fund-check.ts
    npm run verify-ledger -w @shelfie/evidence -- <ledger-path>
    npx vitest run packages/payments/src/verify-client.test.ts packages/evidence/src/evidence.test.ts

The funding check accepts public preprod addresses and has a no-key dry path. Use Sokosumi commands with the explicit --preprod flag from the runbook.

## Network and evidence invariants

- Cardano preprod and test ADA only. Separate W-VBUY (verifier buyer), W-SELL (verifier seller), and W-PAY (worker payouts); W-MPS is separate when Masumi escrow is used.
- Never use mainnet URLs, addresses, network flags, real money, or a wallet for two purposes. Lovelace remains an integer.
- Before a paid or on-chain resource creation, require written role-owner authorisation. Inspect and reuse saved wallets and resources on resume.
- Log only real hashes copied from tool output or the preprod explorer. Use the verified explorer pattern or @shelfie/evidence/explorer; include the milestone, screenshot, and whether output is real or fake.
- M1 records the paid x402 request; M2 records the verifier payment and confirmed payout. Fakes, stubs, and overrides are not evidence.
- For worker payouts, follow the ordered ADR-04 fallback: SDK transfer, Lucid/Mesh behind PayoutAdapter, worker-address x402 route, then flagged manual payout only as a last resort.

## Verify Friday

- Confirm wallet balances and faucet/dispenser limits, facilitator availability, the explorer URL pattern, and SDK transfer/metadata behavior.
- Record verified answers in codigo/docs/verified.md. Unknowns remain unknown until checked.

## Do not

- Never print, paste, store, or commit mnemonics, signing keys, Blockfrost keys, or Masumi secrets.
- Never invent a hash, address, balance, price, facilitator behavior, or explorer URL.
- Never label a fake transaction or stub result as real evidence.
