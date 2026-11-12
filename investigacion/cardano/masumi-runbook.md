# Masumi / Sokosumi runbook — shop research agent

Codex, 2026-10-29. [Context/rules](../tracks-oficiales-2026-10-29.md). **All durations are estimates; assignments are recommendations.**

Read-only; clones blocked (path/review), used GitHub. [agent-guide.md](https://www.masumi.network/tum-hackathon/agent-guide.md)/[SKILL.md](https://www.masumi.network/tum-hackathon/skill/SKILL.md) fetches failed: unverified. Unexecuted commands.

## 1. Preparation

**Each person:** Git, Node **24.x**, **@masumi_network/sokosumi@1.0.4**; own Preprod/TUM login ([G] invite). Node 26 unsupported; Linux auth needs Secret Service/OS vault. ([C] package.json, README.md)

**One team stack:** Vendor/private Coworker/worker; model account/key (ZAI_API_KEY/ZAI_BASE_URL/ZAI_MODEL; optional ZAI_CONTEXT_WINDOW_TOKENS); Blockfrost **Preprod** account/key; dedicated MPS DB/encryption/admin keys/seller wallet. MPS: **Node ≥24.22.1 <25**, **pnpm 10.30.2**, PostgreSQL ≥13 (recommend 15); manifest supersedes README. ([T] .env.example; [M] package.json, README.md)

Operator: Personal credits; organization membership before Vendor creation (one/account). Human OAuth ≠ runtime key. Seller needs tADA; buyer spends credits; quote **1 test USDM**. Dispenser: email code, separate optional 5 ADA collateral; confirm Preprod. ([G]; [T] paid-task.mjs; [K]; [D])

**Tonight Thu 29, 45–90 min/person:** A/operator tools/login/TUM/vault/credits; B/payments DB/pnpm/Blockfrost/dispenser; C/agent brief/report/rubric on paper; D/React public sources/journey. Implement Fri 09:00; confirm starter rules. ([G]; [track brief](../tracks-oficiales-2026-10-29.md))

**Friday 09:00:** A stock 30–60 min; B MPS 60–120 min + settlement; C report/check 2–4 h; D UI/evidence 2–4 h. Paid proof before lunch. Saturday demo/video; final paid cycle by 13:00.

## 2. Clone → first COMPLETED task

Commands: [G], [T] README.md. Use returned IDs; local pin preserves global Node 26. ([MI])

```bash
git clone https://github.com/masumi-network/tum-hackathon-quickstart.git
cd tum-hackathon-quickstart
git checkout d93783b907a5b0b7008c67496c6e093faa70553f
mise use --pin node@24
mise exec -- node --version
mise exec -- npm install --global @masumi_network/sokosumi@1.0.4
mise exec -- sokosumi --version
mise exec -- npm ci
cp .env.example .env
chmod 600 .env
```

Use **`mise exec --`** for subsequent commands unless shell selects pinned Node. Sign up [Preprod](https://preprod.sokosumi.com/), join TUM [G], read `sokosumi skills`/help:

```bash
sokosumi --preprod auth login
sokosumi --preprod auth whoami --json
sokosumi --preprod workspaces list --json
sokosumi --preprod vendors me --json
sokosumi --preprod coworkers list --scope owned --json
# Create only missing resources:
sokosumi --preprod vendors create --name "Shop Team" --slug UNIQUE_SLUG --json
sokosumi --preprod coworkers register --vendor-id VENDOR_ID --name "Shop Research" --capability tasks --personal --json
sokosumi --preprod coworkers connect COWORKER_ID --vendor-id VENDOR_ID --personal --json
# ONCE, direct pipe into vault:
sokosumi --preprod coworkers api-key COWORKER_ID --json |
  sokosumi --preprod runtime key-import --coworker-id COWORKER_ID --api-key-stdin
```

Require personal GRANTED. Private .env: model/COWORKER_ID, EVE_PORT=21949, EVE_URL=http://127.0.0.1:21949, PAID_TASKS_ENABLED=false; organization fields blank. Two terminals: `npm start`, `npm run worker`; wait “Continuous worker running”. ([T] .env.example, worker.mjs)

```bash
sokosumi --preprod tasks create --personal --coworker-id COWORKER_ID --name "Smoke" --description "Suggest five shop research team names." --status READY --json
sokosumi --preprod tasks get TASK_ID --personal --json
sokosumi --preprod tasks comment TASK_ID --personal --comment "Which name is clearest?" --json
```

Web Personal Workspace: verify COMPLETED/result/follow-up; save Task ID. **No payment proof yet.** 5–15 min. ([G])

## 3. First PAID task on Preprod

MPS ([M] README.md), 45–90 min.

```bash
git clone https://github.com/masumi-network/masumi-payment-service.git
cd masumi-payment-service
git checkout a846392ccfc8f5a85aee594ad9441dc90820dab0
mise use --pin node@24.22.1
mise exec -- npm install --global pnpm@10.30.2
createdb masumi_shop_preprod
cp .env.example .env
chmod 600 .env
```

Private .env: DATABASE_URL, fresh ENCRYPTION_KEY (≥32 chars), ADMIN_KEY, BLOCKFROST_API_KEY_PREPROD, PORT=38127; automatic withdrawals/refunds on, V2 seed/V1 off. **Seed prints mnemonics: operator only/no recording.** ([M] .env.example)

```bash
mise exec -- pnpm install
mise exec -- pnpm run prisma:migrate
mise exec -- pnpm run prisma:seed
mise exec -- pnpm -C frontend run build
mise exec -- pnpm run dev
```

Open http://127.0.0.1:38127/admin/ and /docs: GET /api/v1/payment-source?filterNetwork=Preprod → V2 source; GET /api/v1/wallet/list?paymentSourceId=SOURCE_ID&walletType=Selling → id/walletAddress/walletVkey. Fund seller/collateral via [D], verify balance (15–30 min); default collection=seller. ([M] src/routes/api/{payment-source,wallet}/schemas.ts, .env.example)

Back in starter: `mkdir -p docs .local`; docs/payment-state.json:
```json
{"sourceId":"SOURCE_ID","walletId":"WALLET_ID","sellerAddress":"SELLER_ADDRESS"}
```

Private .local/mps.env (600): ADMIN_KEY. Starter .env: MPS_URL=http://127.0.0.1:38127, AGENT_API_PORT=21950, own AGENT_AUTHOR/Blockfrost key. Change team-name metadata. ([T] payment-registration.mjs)

```bash
node --env-file=.env --env-file=.local/mps.env payment-registration.mjs key
node --env-file=.env --env-file=.local/mps.env payment-registration.mjs register
# Repeat READ until RegistrationConfirmed:
node --env-file=.env --env-file=.local/mps.env payment-registration.mjs
```

Key → .local/mps-runtime.env. docs/registration-state.json needs confirmed agentIdentifier, actual supportedPaymentSourceIndex integer, sellerVkey=walletVkey. Run `npm run api`; PAID_TASKS_ENABLED=true; restart worker. **Unready falls back unpaid:** verify registration/key (10–30 min). ([T] payment-registration.mjs, worker.mjs)

Fresh Task (§2): masumiPayment → Core credits/purchase → confirmed FundsLocked → answer/hash → confirmed ResultSubmitted → COMPLETED. Needs deployed V2 support; **≥60 min/cycle**. ([T] paid-task.mjs; [K])

```bash
sokosumi --preprod runtime receipt TASK_ID --coworker-id COWORKER_ID --json
```

Require settled:true/txHash and .local/TASK_ID.json paid.settlement verified:true/positive netAtomicUnits (Core/MPS withdrawal + Blockfrost seller net). Save Task ID/receipt/hash; lock/registration hash insufficient. ([T] settlement.mjs)

Paste receipt txHash into [Preprod Cardanoscan](https://preprod.cardanoscan.io/); inspect confirmed seller token output; save resulting explorer URL. Exclude private journals.

## 4. Structure, quality gate and refunds

Source [T]:
- agent/instructions.md: prompt; agent/agent.ts defineAgent(): model/defaultTools:false, no research tools.
- client.mjs answer(input,journal,deadline): Eve → result.message string; rejects failed/empty/input-request turns. **Proposal:** new research.mjs buildReport()/checkReport() here; return Markdown on pass.
- worker.mjs polls 5s; unpaid text → .local/TASK_ID.txt → runtime complete --result-file. paid-task.mjs createPaidAdapter().advance(): hash → /payment/submit-result → event {status:'COMPLETED',comment:result}. Gate before result-saved/hash.
- agent-api.mjs calls answer(); update /input_schema. Preserve nonce-based API versus raw-text Task hash.

**Inference:** gate sections/sources/counts/arithmetic before hash; persist quality-failed, withhold hash/completion, explain in Task. Stock errors block; **“failed” text is payable; Task failure does not refund.** ([T] client.mjs, worker.mjs, paid-task.mjs; [V])

Offsets: pay-by+5 min (API+10), submit+20, unlock+36, external dispute unlock+52. V2 seller auto-withdraw: hash + eligible ResultSubmitted after unlock+10 min, or WithdrawAuthorized; cooldown can delay. Buyer no-hash auto-refund: FundsLocked/RefundRequested after submit+10 min, or RefundAuthorized. **Inference:** ~46 min payout/~30 min refund queue eligibility + confirmation; verify buyer automation. ([T] paid-task.mjs, agent-api.mjs; [V]; [M] packages/payment-source-v2/src/services/payments/collection/single.ts)

Refund: buyer POST /api/v1/purchase/request-refund → RefundRequested → seller POST /api/v1/payment/authorize-refund; body {network:"Preprod",blockchainIdentifier:...}. Seller requires RefundRequested/Disputed; buyer collects separately. No-result auto-timeout needs no request. Docs'12h defaults differ; no instant/trustless quality promise. ([RF]; [M] src/routes/api/payments/authorize-refund/index.ts; [V])

## 5. Hiring a specialist

MCP https://mcp.sokosumi.com/mcp: OAuth, list_agents/get_agent_input_schema/create_job/get_job/add_job_to_task. Confirm Preprod; mainnet default. ([MC])

REST https://api.preprod.sokosumi.com: GET /v1/agents/AGENT_ID/input-schema; POST /v1/agents/AGENT_ID/jobs {inputSchema,inputData,maxCredits,name}; poll GET /v1/jobs/JOB_ID; Bearer auth. Coworker-bound POST /v1/tasks/TASK_ID/jobs adds agentId; authority differs. ([HTTP] server.py)

**Inference, 2–4 h:** fixed specialist/schema, cap/deadline, saved child ID, merge. **Sokosumi credits ≠ x402.** Chosen x402 specialist needs separate client/payment/tx evidence (3–6 h after parent payment). Pick one transport. ([MC]; https://developers.cardano.org/x402/)

## 6. TUM demo, pitfalls and 1:1

Finish Personal Tasks/receipts, stop worker. ([G]; [T] README.md)

```bash
sokosumi --preprod workspaces list --json
sokosumi --preprod coworkers connect COWORKER_ID --vendor-id VENDOR_ID --workspace-id ORGANIZATION_ID --json
sokosumi --preprod workspaces check ORGANIZATION_ID --json
```

Require GRANTED/taskSeatEligible:true/credits. Set SOKOSUMI_ORGANIZATION_ID and SOKOSUMI_ORGANIZATION_SLUG in .env; restart worker. Tasks use slug, runtime/connection ID; web switcher doesn't select CLI context. ([C] README.md)

```bash
sokosumi --preprod tasks create --organization-slug ORGANIZATION_SLUG --coworker-id COWORKER_ID --name "Shop demo" --description "Research this shop using supplied public sources." --status READY --json
```

Demo: input→specialist payment→report/check→receipt/explorer; separate refund proof. Workspace 15–30 min + settlement. Cardano payment evidence/business case/video/hash: [track brief](../tracks-oficiales-2026-10-29.md).

Pitfalls: one worker, awake machine, preserve journals/keys/.env. grant_required: stop/approve grant; confirm READY/no execution/payment; only then back up solely {"phase":"starting"} journal/restart. No auto-retry of uncertain *-pending writes. Review dependency findings before exposure. ([G]; [T] worker.mjs, paid-task.mjs, README.md)

**1:1:** compatible MPS/V2 source/forceLayer/sellerReturnAddress? Credits/dispenser? Refund automation/cooldown/faster approval? Quality-failure UX? TUM seats/grants/child budget/Preprod MCP? Loopback URL needs hosting? Dependencies/pre-event rules? ([T] paid-task.mjs, payment-registration.mjs; [RF]; [MC])

[T]: https://github.com/masumi-network/tum-hackathon-quickstart/tree/d93783b907a5b0b7008c67496c6e093faa70553f
[C]: https://github.com/masumi-network/sokosumi/tree/8850b8f228217eae3ae2f4aeedcab4f14570749b/apps/cli
[M]: https://github.com/masumi-network/masumi-payment-service/tree/a846392ccfc8f5a85aee594ad9441dc90820dab0
[G]: https://www.masumi.network/tum-hackathon
[MI]: https://mise.jdx.dev/dev-tools/index.html
[D]: https://dispenser.masumi.network/
[K]: https://github.com/masumi-network/sokosumi/blob/main/apps/core/src/routes/v1/tasks/%5Bid%5D/events/post.ts
[V]: https://github.com/masumi-network/masumi-payment-service/blob/a846392ccfc8f5a85aee594ad9441dc90820dab0/packages/payment-source-v2/src/services/payments/automatic-decisions/service.ts
[RF]: https://www.masumi.network/dev/masumi/core-concepts/refunds-and-disputes
[MC]: https://www.masumi.network/dev/sokosumi/mcp
[HTTP]: https://github.com/masumi-network/Sokosumi-MCP/blob/main/server.py
