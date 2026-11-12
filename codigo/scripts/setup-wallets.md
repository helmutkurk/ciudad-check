# Wallet setup (instructions only)

Status: instructions only, `verify Friday`. This file generates nothing and stores nothing. No script in this repo creates, derives or prints keys or mnemonics.

## Rules

- Cardano **preprod** only. Test ADA only. Throwaway wallets, never reused from anywhere else.
- Wallets are generated **locally on the owner's machine** into git-ignored files (`.env`, `secrets/`, `*.skey`, `*.pem` are all ignored by `.gitignore`). Nothing derived from a mnemonic is committed, pasted into chat, put in a screenshot or written to a log.
- One wallet per purpose, never reused for two purposes (`.claude/rules/payments-and-wallets.md`):

| Wallet | Role | Holds | What goes where |
|---|---|---|---|
| `W-SELL` | verifier receives x402 fees | address only (the verifier holds no key) | public address -> `SELLER_ADDRESS` |
| `W-VBUY` | engine pays the verifier (x402 buyer) | mnemonic, 100 tADA | mnemonic -> `VBUY_MNEMONIC_1` (and `_2` if `VBUY_WALLETS=2`); public address -> `WALLET_ADDRESS_VBUY` (proposed name) |
| `W-PAY` | engine pays workers | mnemonic, 100 tADA | mnemonic -> `PAY_MNEMONIC_1` (and `_2` if `PAYOUT_WALLETS=2`); public address -> `WALLET_ADDRESS_PAY` (proposed name) |
| `W-MPS` | Masumi Payment Service seller wallet | managed by the Masumi service | independent; its own setup in the Masumi runbook |

- Mnemonics live **only** in the local `.env` of the machine that runs the engine, one variable per wallet, never a list. Only `packages/payments` reads them.
- Public addresses are not secret, but keep them out of commits until the evidence log (`codigo/docs/evidence/wallets.md`), where public addresses are expected.

## Who decides the tool (B)

Role B (Fernando) decides how the wallets are generated. Candidates, all `verify Friday`:

1. The SDK pinned by the x402 template (`@evolution-sdk/evolution` 0.5.14) if it can generate a mnemonic and derive a preprod base address. Check the template README first.
2. A local wallet app on preprod (a browser or desktop wallet in testnet mode): create the wallet, write the mnemonic on paper or in a password manager, copy the address.
3. `cardano-cli` on a trusted machine (`address key-gen`, `address build --testnet-magic 1`). Preprod magic is `1` (verify Friday).

Whichever tool is used: check the generated address starts with `addr_test1`. An address starting with `addr1` is mainnet and must be discarded.

## Steps

1. Generate the wallets (tool per above) on the owner's machine.
2. Put mnemonics into the local `codigo/.env` (copy `.env.example`, replace `CHANGE_ME`). Never into another file in the repo.
3. Put the **public** addresses into `.env` (`SELLER_ADDRESS`, and the `WALLET_ADDRESS_*` names in contracts §5.6; `scripts/fund-check.ts` reads them).
4. Fund `W-VBUY` and `W-PAY` from the Cardano preprod faucet (official faucet, address from step 3; limits and cool-down: `verify Friday`). Domain-model budget: at least 100 tADA each; `W-SELL` only needs to exist.
5. Check balances: `cd codigo && node --env-file=.env --import tsx scripts/fund-check.ts`. It needs `BLOCKFROST_PROJECT_ID` (a **preprod** project) and refuses mainnet.
6. Record the public addresses and the faucet transaction in `codigo/docs/evidence/wallets.md` and `tx-hashes.md` (hashes copied from the explorer, never typed).

## After the event

Delete the local `.env` secrets and the wallets' recovery material; the funds are test ADA, but the habit matters.
