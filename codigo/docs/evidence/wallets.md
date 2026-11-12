# Wallets

Network: Cardano preprod, test ADA only. Public addresses only: no mnemonic, key or seed is stored in this repo. Procedure: [`../../scripts/setup-wallets.md`](../../scripts/setup-wallets.md). Funding and milestone transactions: [tx-hashes.md](tx-hashes.md).

## Shelfie system wallets

Generated 2026-10-29/30 on the hub laptop (Isabel) with `@evolution-sdk/evolution` 0.5.14 from the x402 template, except W-MPS, which the Masumi Payment Service seed created. Recovery material is in git-ignored files on the hub only; the engine reads the mnemonics from the local `codigo/.env` (`PAY_MNEMONIC_1`, `VBUY_MNEMONIC_1`). These are dedicated system wallets, not anyone's personal wallet.

| Wallet | Role | Env name (public address) | Address | Explorer | Funded by |
|---|---|---|---|---|---|
| W-VBUY | Engine pays the verifier (x402 buyer) | `WALLET_ADDRESS_VBUY` | `addr_test1qpfzqn9cgf5m6cs7ghv60vj7qhjppuzm6cwf0mzxfv0ch75ajl3wd97306qw5qud3hv60zkqv7ycegq3gp5u53jfc8pqjuv0ut` | [cardanoscan](https://preprod.cardanoscan.io/address/addr_test1qpfzqn9cgf5m6cs7ghv60vj7qhjppuzm6cwf0mzxfv0ch75ajl3wd97306qw5qud3hv60zkqv7ycegq3gp5u53jfc8pqjuv0ut) | faucet, 10,000 tADA, Thu 2026-10-29 16:42 UTC (before the build window, tool test), tx `d037650bca3f15efbd055b2cac1e12fe7db38a01da42194ffcce0d491a81f831` |
| W-PAY | Engine pays workers | `WALLET_ADDRESS_PAY` | `addr_test1qqdwvv24gk8kewxcx7dm4mkvyv9enkzuw2f9c8jjwfff8y74tqr2sy68lmvt3u96kcwddktdyn83rqtekarva04znu6se4fjxy` | [cardanoscan](https://preprod.cardanoscan.io/address/addr_test1qqdwvv24gk8kewxcx7dm4mkvyv9enkzuw2f9c8jjwfff8y74tqr2sy68lmvt3u96kcwddktdyn83rqtekarva04znu6se4fjxy) | faucet, 10,000 tADA, Fri 2026-10-30, tx `566b34c363cca9648ee45d5454a65c6a3995e24f9a6a892f9acc34aa4fe2b70d` |
| W-SELL | Verifier receives x402 fees (address only) | `SELLER_ADDRESS` | `addr_test1qz3edturjtvrytfy933t927942auguhd0wxkrxkdv0mumwph9ehp5qhzatv4x6rpwxs7adkwplkl2gsudfxk052frhcq3tnrpj` | [cardanoscan](https://preprod.cardanoscan.io/address/addr_test1qz3edturjtvrytfy933t927942auguhd0wxkrxkdv0mumwph9ehp5qhzatv4x6rpwxs7adkwplkl2gsudfxk052frhcq3tnrpj) | not needed (receives only) |
| W-MPS | Masumi Payment Service selling wallet (escrow seller) | `WALLET_ADDRESS_MPS` | `addr_test1qqy2pzzes7znqcusru56fche6fqhed0gvtqzvza79uqx22x35yw9yar6m4r9a6ah8fh8dvqmt3chckwmvflh7wy87qrq5q7825` | [cardanoscan](https://preprod.cardanoscan.io/address/addr_test1qqy2pzzes7znqcusru56fche6fqhed0gvtqzvza79uqx22x35yw9yar6m4r9a6ah8fh8dvqmt3chckwmvflh7wy87qrq5q7825) | 200 tADA from W-VBUY, Fri 2026-10-30, tx `c217c66912949578922c7e4294e78d3be1a4211f0ebd8733f737a7b73d4efb92` |

## Demo worker wallets

Payout addresses for the four teammates acting as workers in the demo (they receive only; no funding needed). Each person holds their own recovery phrase.

| Person | Role | Address | Explorer |
|---|---|---|---|
| Helmut | worker | `addr_test1qzrxvj340lml3mntcdv7m63w26eq703emumaz7ysarysuwa3zw0f9ytqk6z6hwvxcukm3gcmywz5elyws5mkgflfawrs48ukwt` | [cardanoscan](https://preprod.cardanoscan.io/address/addr_test1qzrxvj340lml3mntcdv7m63w26eq703emumaz7ysarysuwa3zw0f9ytqk6z6hwvxcukm3gcmywz5elyws5mkgflfawrs48ukwt) |
| Isabel | worker | `addr_test1qpyc2zsham2gn649kck8rmjy27me7ydxgvxu7mdstn4xynuulakk68ef3nxncd87k9puuael87zwjzs6wzge4e95t87qdkdjcx` | [cardanoscan](https://preprod.cardanoscan.io/address/addr_test1qpyc2zsham2gn649kck8rmjy27me7ydxgvxu7mdstn4xynuulakk68ef3nxncd87k9puuael87zwjzs6wzge4e95t87qdkdjcx) |
| Fernando | worker | `addr_test1qqnh8wm48f3lhjmttvxc8tqw6vk583ccshhhz7lwjawp654ppgpngcx2q5w2xrs8a2j0prh297w3x5gd4sryx566wqrsh39gsk` | [cardanoscan](https://preprod.cardanoscan.io/address/addr_test1qqnh8wm48f3lhjmttvxc8tqw6vk583ccshhhz7lwjawp654ppgpngcx2q5w2xrs8a2j0prh297w3x5gd4sryx566wqrsh39gsk) |
| Lorenz | worker | `addr_test1qrxr692jxhyq0u37vvqqnzdkt0ysm3a6gany5mk85p7hg2vzrlu7uy3aglsn5hnlxfpgc4dgtvrduyxqqym0axfn75hs9t9ge7` | [cardanoscan](https://preprod.cardanoscan.io/address/addr_test1qrxr692jxhyq0u37vvqqnzdkt0ysm3a6gany5mk85p7hg2vzrlu7uy3aglsn5hnlxfpgc4dgtvrduyxqqym0axfn75hs9t9ge7) |
