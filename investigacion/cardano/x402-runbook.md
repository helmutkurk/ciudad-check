# x402 on Cardano preprod: runbook (2026-10-29)

Sources (all read 2026-10-29): [P] https://developers.cardano.org/x402/ · [A] https://developers.cardano.org/x402/agent.md · [E] template `x402-express` (https://github.com/cardano-foundation/developer-portal/tree/staging/examples/templates/x402-express; files cited as `src/...`, cloned read-only) · [N] https://developers.cardano.org/templates/x402-next/ · [D] https://github.com/cardano-foundation/x402-cardano-demo · [F] https://docs.cardano.org/cardano-testnets/tools/faucet · [M] https://dispenser.masumi.network/. "(inference)" = our reading, not stated by a source. Nothing below was executed.

## 1. Prerequisites

- **Node:** express/next templates need >=20.9 (`package.json` engines, [E]); the end-to-end demo needs 22+ [D]; Masumi guide says 24 (brief). Use 22+ for everyone (inference).
- **Pinned packages** (`package.json` [E]): `@x402/cardano`, `@x402/core`, `@x402/express`, `@x402/fetch` all `2.26.0`; `@evolution-sdk/evolution` `0.5.14`; `express ^4.21`, `tsx`, `dotenv`. [A] says newer versions exist; do not bump during the hackathon.
- **Blockfrost:** a free preprod project id (`BLOCKFROST_PROJECT_ID`) [E README]. Free account creation at blockfrost.io is a human step.
- **Facilitator: hosted, non-custodial, no key needed.** Preprod: `https://x402.preprod.dev.ecosyseng.cf-deployments.org` (default in `.env.example` [E]; [P]). The public x402.org facilitator does not support Cardano [A]. Fallback: `npm run facilitator` (~100 lines, only needs Blockfrost, `FACILITATOR_URL=http://localhost:4022`) [E README].
- **Buyer without a browser wallet:** `toClientCardanoSigner({ mnemonic, network, provider: { blockfrost } })` signs server-side from a 24-word mnemonic in `.env`; `npm run wallet` generates one (`src/wallet.ts`). The seller holds no keys, only `SELLER_ADDRESS` (`addr_test1...`) [E README]. Browser CIP-30 wallets are only for the Next/demo UIs [N][D].
- **Test funds:** tADA from the faucet (https://docs.cardano.org/cardano-testnets/tools/faucet; optional API key; limits not stated [F]). Masumi dispenser gives ADA/USDM and needs a verification code from the Masumi registration email, plus an optional 5 ADA collateral [M]; limits not stated. Test USDM from the SDK: https://tusdm.moneta.global/#manual (`src/wallet.ts`).
- **Two different tUSDM tokens:** SDK token (policy `e675b46e...`) vs Masumi dispenser token (policy `16a55b2a...`); a wallet funded with one cannot pay routes priced in the other [D][A]. For dispenser tokens set `USDM_ASSET=16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde.0014df10745553444d` [D]. Simplest: price in tADA (lovelace).

## 2. Step by step (express template, ~20 min, estimate)

```
npx giget@latest gh:cardano-foundation/developer-portal/examples/templates/x402-express my-app
cd my-app && npm install && cp .env.example .env
npm run wallet      # prints MNEMONIC + address (shown once)
```
(commands from [E] page and README). Then:
1. Put `MNEMONIC`, `BLOCKFROST_PROJECT_ID`, `SELLER_ADDRESS` in `.env` (never commit; use a throwaway wallet). Use a second address as seller so the receipt is a real transfer (inference).
2. Fund the printed buyer address (~10 tADA covers many 2 tADA calls + ~0.17 ADA fee each [A]); wait 1-2 min.
3. `npm run demo` starts the seller, runs the buyer, stops (`src/demo.ts`); or run `npm run seller` and `npm run buyer` in two terminals.
4. Buyer prints `Payment receipt: {... "transaction": "<hash>"}` and an explorer link. Expect 20-60 s [E].
5. Explorer URL: `https://preprod.cardanoscan.io/transaction/<hash>` (printed by `src/buyer.ts`). Address view: `https://preprod.cardanoscan.io/address/<addr>` (inference from the same host used in the README). Cexplorer preprod format was not in any source; unverified.
6. Save every tx hash from the first payment on (brief requires one in the submission).

## 3. Minimal code shape

**Seller, `src/seller.ts`:**
```ts
const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: facilitatorUrl }));
resourceServer.register(NETWORK, new ExactCardanoScheme());   // NETWORK = "cardano:preprod"
app.use(paymentMiddleware({
  "GET /api/message": {
    accepts: [{ scheme: "exact", network: NETWORK,
      price: { amount: PRICE_LOVELACE, asset: "lovelace" }, payTo }],
    description: "A message that costs 2 tADA", mimeType: "application/json" } },
  resourceServer));
app.get("/api/message", (_req, res) => res.json({ ... }));
```
Imports: `paymentMiddleware, x402ResourceServer` from `@x402/express`; `HTTPFacilitatorClient` from `@x402/core/server`; `ExactCardanoScheme` from `@x402/cardano/exact/server`. Unpaid request returns 402 + `PAYMENT-REQUIRED`; the seller never touches the chain [E seller.ts header].

**Buyer, `src/buyer.ts`:**
```ts
const client = new x402Client().setSpendControls({
  allowedAssets: [{ network: "cardano:*", asset: "lovelace", maxAmountPerPayment: "5000000" }] });
const signer = toClientCardanoSigner({ mnemonic, network: "cardano:preprod",
  provider: { blockfrost: { baseUrl: blockfrostBaseUrl, projectId } } });
client.register("cardano:*", new ExactCardanoScheme(signer));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const response = await fetchWithPayment(url, { method: "GET" });
const receipt = new x402HTTPClient(client).getPaymentSettleResponse(n => response.headers.get(n));
```
Imports: `x402Client, wrapFetchWithPayment, x402HTTPClient` from `@x402/fetch`; `toClientCardanoSigner` from `@x402/cardano`; `ExactCardanoScheme` from `@x402/cardano/exact/client`. Lovelace is rejected by default (not USD-pegged), hence `allowedAssets`; always set a cap [A]. Flow: 402 -> sign tx -> retry with `PAYMENT-SIGNATURE` -> `PAYMENT-RESPONSE` receipt [E buyer.ts header, D].

## 4. Plugging it into the Masumi/Sokosumi agent

What [D] actually shows (relevant for us):
- **The demo's x402 buyer is a browser CIP-30 wallet** (`frontend/src/x402/flow.ts`, `cip30Signer.ts`); it is not a headless agent. The headless buyer is the express template's `buyer.ts` (inference: combine them).
- **Masumi agent as x402 seller** (`masumi/src/agent.ts`): `POST /start_job` is the standard MIP-003 path that Sokosumi uses; `POST /x402/start_job` is an x402 path where the 402 carries Masumi escrow terms (`masumi` option of `ExactCardanoScheme`) and the paid retry carries the signed escrow lock. The seller later runs `npm run collect`. Registration: `npm run register`; needs ~20 tADA seller wallet and a public HTTPS URL (e.g. Cloudflare tunnel) [D README].
- [A] gotcha 14: Masumi Payment Service does not manage locks created by `@x402/cardano`; result/refund/dispute follow Masumi escrow. Fields of the `masumi` extra are not documented in [A]; read `masumi/src/agent.ts` (`x402Offer`) and `masumi/docs/FLOWS.md` in [D].

**Proposed wiring for our idea (inference, not tested):**
1. Customer hires the lead agent through Sokosumi (MIP-003 `/start_job`, escrow by Sokosumi; other researcher's scope).
2. Inside the lead agent's job handler (TypeScript, same process), call the specialist "competitor price" API with `fetchWithPayment(specialistUrl)` from section 3, using the lead agent's own preprod wallet (`MNEMONIC` from env, `maxAmountPerPayment` capped, 1-2 tADA per call). The specialist is a plain express seller as in section 3 with its own `SELLER_ADDRESS`.
3. Log `receipt.transaction` per sub-call and include the hashes in the final report: that is the "agent hires agent" proof for the demo.
4. Use plain address-payment x402 for the specialist (fast), not Masumi-escrow x402, until the main flow works [A advice: start with address-payment routes].
5. Python is not supported for Cardano x402 ("don't hand-roll a Python client; call a small TypeScript service") [A]. Keep the lead agent or at least the paying part in TypeScript.

## 5. Pitfalls, estimates, open questions

Pitfalls (sources: [E] README troubleshooting table and [A] gotchas):
- **Double pay:** `HTTP 402` after ~1 min or a dropped connection means the payment may still settle; check the buyer address on preprod.cardanoscan.io before retrying.
- **One wallet cannot pay concurrently** (first UTxO is the nonce) [A]: parallel sub-calls need separate wallets or serialization.
- Lovelace routes >= 1 tADA (min-UTxO); network fee ~0.17 ADA per payment [A].
- `/verify` rejection arrives as HTTP 200 with `isValid:false`; read `invalidReason` [A]. Seller 500 "no supported payment kinds" = facilitator unreachable [E].
- Paid handler runs after verify, before settle, and again on retries: make side effects idempotent (e.g. do not call a metered upstream API twice) [E README].
- Facilitator `/verify` and `/settle` spend the host's Blockfrost quota; a local one binds 127.0.0.1 by default [E].
- Demo state is in memory and lost on restart [D]. Blockfrost key in a browser frontend is visible [D]. Mnemonic in `.env`: throwaway wallet only.
- Faster responses: `extra.confirmationPolicy.l1Confirmations = 0` (hosted facilitators accept) [A]; default is 1 confirmation.

Time estimates (ours, not from sources): first paid tx with the template 30-60 min incl. keys and faucet; specialist API behind x402 1-2 h; lead agent calling it inside a Masumi job 2-3 h; Masumi-escrow x402 variant 4+ h (skip unless time remains).

Open questions for mentors (Cardano workshop Fri 10:30, Masumi 1:1):
1. Faucet / dispenser per-claim amounts and limits; where to get the dispenser verification code before Friday.
2. Recommended way for a headless agent to pay a Masumi-escrow `/x402/start_job` (mnemonic signer with `masumi` option?) and whether that counts for the track.
3. Is hosted facilitator capacity fine for a live demo 15:00-17:00, or should we run a local one?
4. Does a plain x402 payment to the specialist plus a Sokosumi job satisfy "agents hiring agents", or is the escrow route expected?
5. Cexplorer preprod URL form and whether judges prefer a specific explorer.
6. Rules on using template code in the repo (code before Friday 09:00 is unpublished in the brief).

Extras: Cardano Dev Skills plugin for Claude Code/Codex: `/plugin marketplace add cardano-foundation/cardano-dev-skills` then `/plugin install cardano-dev-skills@cardano-dev-skills` (its README). Exact scheme spec: https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_cardano.md [P].
