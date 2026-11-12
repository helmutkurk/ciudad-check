# apps/shell

Status: the bridge exists and is tested against a fake engine. The Masumi starter is pinned at `d93783b907a5b0b7008c67496c6e093faa70553f` and ran unpaid (M3) and paid (M4) Tasks on the hub with the starter's own prompt (2026-10-30, `codigo/docs/verified.md`). The bridge is wired in (A-10): with `SHELL_TOKEN` set, an unpaid Sokosumi Task went through the bridge and the engine (on fakes) to COMPLETED with the Shelfie report. M5: a paid Task through the bridge got no passing photo, the engine decided WITHHOLD, no result hash was submitted and the escrow refunded the buyer about 30 minutes after the lock (evidence in `codigo/docs/evidence/tx-hashes.md`). The shell stays JavaScript and is the only exception to the TypeScript rule. Links point to the canonical design in `diseno/` at the repo root.

Set up the starter (Windows needs the patch; it is a no-op change on Linux and macOS):

```sh
cd codigo/apps/shell
git clone https://github.com/masumi-network/tum-hackathon-quickstart.git starter
git -C starter checkout d93783b907a5b0b7008c67496c6e093faa70553f
git -C starter apply ../starter.patch
```

`starter.patch`: on Windows npm installs the CLI as `sokosumi.cmd`, which `execFileSync('sokosumi')` cannot start (`spawnSync sokosumi ENOENT`), so the worker crashed at boot. The patch adds `execSokosumi` in `sokosumi-runtime.mjs` (runs the CLI's JS entry with `node` on `win32`, unchanged elsewhere), uses it in `worker.mjs`, and accepts a `\skills\` path in the `sokosumi skills path` check. It also switches `client.mjs`: when `SHELL_TOKEN` is set, the exported `answer` is `createStarterAnswer(createBridge(loadBridgeConfig()))` from `../bridge/`; otherwise the starter's model call stays. The starter must therefore live at `codigo/apps/shell/starter/`.

Run with the bridge: add the bridge names (`bridge/.env.example`) to the starter's `.env`, start the engine, then `npm start` (Eve, still needed for the worker's health check) and `npm run worker` in the starter. The Sokosumi Task description is the job input. Every channel ends in the same ids-only input the dashboard's dropdowns send (`{ productEan, stores: [{ id }] }`, ADR-17); `bridge/catalog-input.js` resolves the other shapes against the engine's `GET /api/catalog`:

| Request shape | Example | Where it comes from |
|---|---|---|
| Catalog ids (passed through) | `{"productEan":"5449000000439","storeId":"rewe-81671-august-everding-strasse-20"}` | dashboard, scripts |
| MIP-003 dropdown indices | `{"productEan":[1],"storeId":[0]}` | Sokosumi hire form (`agent-api.mjs` `/input_schema` lists the catalog as two single-choice `option` fields; Sokosumi answers with the index) |
| Dropdown label text | `{"productEan":"Nutella 450 g (EAN 4008400402222)","storeId":"REWE, August-Everding-Straße 20, 81671 München"}` | copy of a label |
| Free text | `Check Nutella at the REWE on August-Everding-Strasse` | Sokosumi Task description |

Free text must name exactly one catalog product and one store (chain plus street, or the id); ties and unknown names are rejected as `input_schema_violation`, never guessed. The dropdown order is stable (sorted by id), so an index means the same entry in the schema and the resolver as long as the catalog is unchanged. With `SHELL_TOKEN` set, the patched `agent-api.mjs` serves that schema and accepts only `productEan` and `storeId`. The worker journal file name carries the Task id, which becomes the engine job's `externalRef`. DELIVER submits the report text; WITHHOLD and intake rejection throw `WithheldError`: the worker submits no result, logs "Withheld", and posts the bridge's comment on the Task once (`comments.mjs` `postWithheld`, guarded by `.local/<task>-withheld.json`). It is a comment only, with no status change, so a paid Task's escrow still refunds on its own. With `SHELL_TOKEN` set, `payment-registration.mjs register` registers the agent as "Shelfie" (name, description, tags, capability `shelfie-shelf-check`) instead of the template's name.

## Purpose
Thin Masumi/Sokosumi bridge: turns a Sokosumi task into an engine job, waits for the engine decision, delivers the report text (the starter hashes and submits it) or withholds it (no hash, so the buyer's no-result auto-refund applies), and reports settlement events. No business logic beyond the bridge.

## What exists
`bridge/` (ESM JavaScript with JSDoc types, no dependencies, Node 24):

| File | Content |
|---|---|
| `bridge/index.js` | Public exports: `createBridge`, `parseSokosumiInput`, `loadBridgeConfig`, `BridgeError`, `WithheldError` |
| `bridge/bridge.js` | `createJob` (idempotent on `externalRef` = Sokosumi task id, ids only), `awaitDecision` (long poll until `DELIVER`, `WITHHOLD` or submit deadline minus margin), `postSettlementEvent`, `run`, `answer`, `answerOrThrow` |
| `bridge/config.js` | `loadBridgeConfig(env)`: `ENGINE_URL`, `SHELL_TOKEN`, `SHELL_DECISION_POLL_SEC`, `SHELL_DEADLINE_MARGIN_SEC`, `PACK_ID`, `JOB_WINDOW_SEC`; reads no files, errors name the variable only |
| `bridge/errors.js` | `BridgeError` (engine codes kept: `intake_rejected`, `unauthorized`, ...) and `WithheldError` |
| `bridge/bridge.test.js` | 14 `node:test` tests against a fake engine on `node:http` |
| `bridge/.env.example` | Names only of our env additions |

Behaviour (contracts.md section 1.6):
- `answer(input, { sokosumiTaskId, deadline })` resolves to the report text on `DELIVER` and to `undefined` on `WITHHOLD`, on `intake_rejected`/bad input and when the shell deadline is reached. `undefined` means: submit no result hash. `answerOrThrow` throws `WithheldError` instead (`reason`, `comment`) for a starter that needs an error to skip the hash.
- `run(input, ctx)` returns `{ kind: "deliver" | "withhold", reason, comment, ... }`; use `comment` as the human-readable Sokosumi task comment.
- The create call is retried only on transient engine errors (safe: idempotent). Masumi writes are never retried here.
- On withhold the bridge posts `settlement-events` `WITHHELD` (best effort, never throws). The starter should post `ESCROW_LOCKED`, `RESULT_SUBMITTED`, `SETTLED`, `REFUND_OBSERVED` with `bridge.postSettlementEvent(jobId, ...)` for each observation it already logs (needs the job id: `createJob` returns it).

Run the tests: `npm test -w @shelfie/shell` (or `node --test bridge/` in this folder). They are not part of `npm run check` (the root vitest config excludes `apps/shell`); reported to the orchestrator.

## Fork steps for role A (Friday)
Everything about the starter below comes from `investigacion/cardano/masumi-runbook.md` (Codex research, clones were blocked, so unverified): mark `verify Friday` until you have read the starter's `README.md` and `AGENTS.md` yourself.

1. Authorisation stop (official-agent-prompt.md section 4): before any step that creates paid or on-chain resources (Payment Service database, seeded wallets, `payment-registration.mjs register`, funding), stop and get the role owner's yes in writing. Steps 1 to 5 create none.
2. Clone the starter next to the bridge, not into it: `git clone https://github.com/masumi-network/tum-hackathon-quickstart.git apps/shell/starter`, then `git -C apps/shell/starter checkout <commit>`. Candidate commit from the runbook: `d93783b907a5b0b7008c67496c6e093faa70553f` (verify Friday that it is still the head the organisers want; check the starter README for a newer pin). Record the commit and date in `codigo/docs/verified.md` (AGENTS.md: organisers' templates must be noted there). `apps/shell/starter/` is git-ignored (`apps/shell/.gitignore`); keep our diff small as a patch file `apps/shell/starter.patch`.
3. Node 24 with the starter's own pinned dependencies: `mise use --pin node@24` inside the starter (keeps a global Node 26 intact), `npm ci` (never `npm install`), Sokosumi CLI `@masumi_network/sokosumi@1.0.4`. The starter has its own `package.json`; it is not an npm workspace of this monorepo.
4. Copy the bridge in: either import it by relative path (`../bridge/index.js`) or copy `bridge/` next to the starter's `client.mjs`. No dependencies to install.
5. Wire the call (verify Friday: seam names): the runbook says `client.mjs` exports `answer(input, journal, deadline)` which runs the Eve model and returns a message string; `agent-api.mjs` and `worker.mjs` call it and the paid path hashes the returned text. Replace the model call with `createBridge(loadBridgeConfig()).answer(input, { sokosumiTaskId, deadline })`. Open points: (a) where the Sokosumi task id comes from inside `answer` (journal? input?); (b) the shape of `deadline`; (c) how to make the starter submit no hash on `undefined`: the runbook says stock errors block, "failed" text is payable, and a task failure does not refund, so test the withhold path against a throwaway task before any paid run; (d) update the `/input_schema` of `agent-api.mjs` to the ids-only form (`productEan`, `storeId` or `stores: [{ id }]`); use select fields only if Sokosumi supports them.
6. Env additions (names only, see `bridge/.env.example`): `ENGINE_URL`, `SHELL_TOKEN`, `SHELL_DECISION_POLL_SEC`, `SHELL_DEADLINE_MARGIN_SEC`, optional `PACK_ID`, `JOB_WINDOW_SEC`. Starter names stay as they are: `COWORKER_ID`, `EVE_PORT`, `EVE_URL`, `PAID_TASKS_ENABLED`, `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_MODEL`, `ZAI_CONTEXT_WINDOW_TOKENS`, `MPS_URL`, `AGENT_API_PORT`, `AGENT_AUTHOR`, `SOKOSUMI_ORGANIZATION_ID`, `SOKOSUMI_ORGANIZATION_SLUG`. Real values only in the local `.env` (`chmod 600`), never in chat or Git.
7. Reuse saved resources on resume: before creating anything, list what exists (`sokosumi --preprod auth whoami`, `workspaces list`, `vendors me`, `coworkers list --scope owned`) and read the starter's saved state (`docs/payment-state.json`, `docs/registration-state.json`, `.local/`). Create only what is missing; never a second Vendor, Coworker or wallet after a restart; no automatic retry of uncertain `*-pending` writes.
8. Workspaces (official-agent-prompt.md section 3): join the TUM Workspace before creating the Vendor (the guide requires an organization). Run M3 (unpaid task) and M4 (first paid task) in the **Personal Workspace**. For the Vendor and the demo, switch the worker to the **TUM Workspace** after the Personal test works (`coworkers connect ... --workspace-id <ORG_ID>`, `workspaces check`, then `SOKOSUMI_ORGANIZATION_ID` and `SOKOSUMI_ORGANIZATION_SLUG`, restart the worker). Exact commands: runbook sections 2, 3 and 6.
9. Against the engine on fakes first: `FAKE_PAYMENTS=1`, `VERIFIER_PAYMENT=off`, `VERIFIER_MODE=stub`, engine on `127.0.0.1:4000`, `SHELL_TOKEN` equal on both sides.

## Timing
The starter sets the Masumi submit deadline to payment request + 20 min (`paid-task.mjs`). The bridge stops waiting at `deadline - SHELL_DEADLINE_MARGIN_SEC` (300 s) and then withholds (contracts.md section 1.6). With the deadline known, the bridge clamps the `windowSec` it sends to `min(JOB_WINDOW_SEC, deadline - margin - now - 30 s)`, so a late escrow lock gets a shorter window instead of a window that outlives the bridge. Observed on 2026-10-31: payment request to lock confirmed in MPS 1-2.7 min (the Sokosumi buyer locks Tasks of one order in one tx), so `JOB_WINDOW_SEC=600` normally fits unchanged.

## Worker behaviour (A-25, 2026-10-31)
- Tasks run in parallel: one in-flight handler per Task id, so a decision long poll no longer blocks other Tasks (before, Tasks queued behind a 10-minute poll).
- Steps that need no outside wait are chained in one pass (payment request -> purchase event; lock confirmed -> engine job).
- `model-pending` after a crash or restart is retried for the bridge only (the engine create is idempotent on the Task id); with the deadline passed it becomes `withheld`. The model path keeps the starter's no-retry stop.
- Terminal local stages: `settled`, `refunded`, `expired` (never locked) and unpaid Tasks with a posted withhold comment are skipped. `withheld` and `awaiting-withdrawal` are observed once a minute.
- Settlement events to the engine: `ESCROW_LOCKED` (bridge, at job creation), `RESULT_SUBMITTED`, `SETTLED`, `WITHHELD`, `REFUND_OBSERVED` (worker, with the tx hash from MPS).
- Run exactly one worker per `.local/`: two workers on the same journals race on Sokosumi and MPS writes.

## Milestones
M3 hired via marketplace (Fri 13:00, unpaid); M4 paid escrow (Fri 20:00); M5 withheld result and refund. Definition of done: `diseno/repo-layout.md` section 5.

## Open (verify Friday)
- Starter seam (`answer` signature, `journal`, `deadline` type), how to submit no hash, input schema fields, `/input_schema` update.
- Whether Sokosumi offers select fields; free-text to ids fallback is not built (an unresolvable request is `input_schema_violation` and withheld with a comment).
- Whether the agent can decline before payment (no escrow at all) or only after lock; `REJECTED_INPUT` is now retained by the engine and its id is returned for `INTAKE_REJECTED`; verify this handoff with the real starter.
- Real Sokosumi task id source for `externalRef`.

## Do not
- Do not rewrite the starter or add business logic; do not retry uncertain Masumi writes automatically.
- Do not commit `.env`, keys or mnemonics.
- Do not create duplicate Vendor, Coworker or wallets on restart.

## ADR-20 order correlation

A Task description may include `{orderId,storeId,productEan}` as ids-only JSON. The bridge keeps the existing catalog-only job input and forwards `orderRef:{orderId,storeId}` separately to `POST /api/jobs`. The engine checks the reserved order/store/product and binds `externalRef` (the actual Task id) once. Older Tasks omit this optional reference. `order-input.test.js` proves the mapping without network sockets. B-15 must verify the real Task id / agent Job id / starter journal identity before real orders are enabled.
