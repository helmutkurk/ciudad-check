# Start here, team

Shelfie is ready for component work on fakes locally; the shared deployments are moving to real vision and real preprod payments (see below). Real vision on phones, a full real cycle through the deployed engine and Masumi escrow with a store photo still need validation. Use [codigo/README.md](../codigo/README.md) for commands and its complete verify-Friday status table. Canonical acceptance is [diseno/repo-layout.md §5](../diseno/repo-layout.md). Times below are Europe/Berlin targets, not proof that a milestone passed.

## Hackathon day, 2026-10-31 (current)

Older sections below describe the pre-hackathon plan; where they disagree, [ADR-21](../diseno/decisions.md) (brand app) and [ADR-22](../diseno/decisions.md) (demo runtime) win.

| Person | Role | Works on |
|---|---|---|
| Helmut | D | `/dashboard`, `/w`, hub engine + verifier, Vercel |
| Isabel | A | Sokosumi worker + bridge + Masumi Payment Service on her laptop |
| Fernando | B | `/b` brand app |
| Lorenz | C | `/story` pitch screen and pitch; `/homepage` is frozen |

Payment flow (real mode, no fakes):

1. The brand opens `/b` and signs in with its access code; there is no separate payment in `/b`.
2. The order becomes one Sokosumi Task per store (Isabel's preprod account pays the credits).
3. Each Task locks the Masumi escrow.
4. The engine pays the verifier per check via x402 and pays the worker in preprod ADA on a pass.
5. Deliver settles the escrow; withhold refunds it.

Times (Europe/Berlin, Sat): feature freeze 11:00, last paid escrow cycle started by 13:00, Devfolio deadline 15:00.

## First 30 minutes, every role

| Minutes | Action |
|---|---|
| 0-5 | Clone the team repo (`git clone https://github.com/helmutkurk/shelfie.git`), enter its root, run `git switch dev`, read [AGENTS.md](../AGENTS.md), and run `bash scripts/install-githooks.sh`. Install gitleaks via the team's package manager if missing; verify `gitleaks version`. Follow [the public audit](public-release.md) before any push. |
| 5-15 | Run the role's context-ack and task command below. Read every file the card lists, your component READMEs, [contracts](../diseno/contracts.md), the last two [ai-log](ai-log.md) entries and your pair's current note. State purpose, role/person and files read before editing. Run `gitleaks detect --no-git --source . --redact` locally; do not paste findings containing secrets. |
| 15-25 | Select Node 24 with mise or nvm, then `cd codigo && npm ci`. Use the lockfile, keep exact pins, and make no dependency upgrades. |
| 25-30 | Run `npm run check` from codigo. From the root, run `bash scripts/task.sh next <role>`, then `start <id>` for the actual task. Check seeded task statuses against implementation and evidence; a scaffold does not finish an on-chain milestone. |

Work on `dev` and push to it directly after `git pull --rebase origin dev` and `npm run check` (feature branches optional, no PR; ADR-0006). Start each block with `bash scripts/peer-review.sh pending` and review what it lists; `main` changes only through the release PR ([CONTRIBUTING.md](../CONTRIBUTING.md)). This integration pass made no git mutation, commit or push. Initial task.sh bookkeeping read local Git identity; subsequent updates set TASK_ACTOR=Codex to avoid it. Helmut (D) expressly authorised edits across all codigo folders and the named integration documents for this pass; ownership resumes for subsequent changes.

Before any phone test in a store or on stage: [field-test-supermarket.md](../preparacion/field-test-supermarket.md) (pre-flight, failure catalogue, commands). Do not push to `dev` while it runs.

Public test URLs and automatic rebuild on every push: [deploy.md](deploy.md) (Vercel + tunnel + pull-based deploy; Helmut operates the hub side).

Test without a laptop: open https://dev.shelfieapp.fyi/w (workers, on a phone) and https://dev.shelfieapp.fyi/dashboard (operator token from Helmut). For local work the hub laptop is no longer needed (`npm run dev` on fakes is enough), but the shared backend behind these URLs still runs on Helmut's laptop and must stay on until a cloud VM exists.

**Real mode on the shared deployments (Helmut, 2026-10-30 evening):** no more fake mode there. dev/api-dev (later app/api) run real Gemini vision (`gemini-3.5-flash-lite` primary plus a Gemini backup) and real preprod payments (`FAKE_PAYMENTS=0`, `VERIFIER_PAYMENT=on`, `VERIFY_CLIENT=real`, `VERIFIER_MODE=live`, `VERIFY_RUN_CAP_LOVELACE=200000000`), so the team finds bugs, failures and UI improvements. Fakes remain only for local development and CI (`npm run check`, local `npm run smoke`). Values live only in Helmut's `~/.config/shelfie/dev.env`, never in git or chat. Status: Gemini key being set by Helmut; payment secrets not yet in the hub env. Owner of the remaining hub env: Isabel (A-21 hand-over of wallet secrets and Blockfrost/facilitator values, A-22 funding), with Fernando (B-14). Until api-dev `/api/health` shows `fakes.payments:false`, treat the deployment as fake and never as evidence. Switch table: [codigo/README.md](../codigo/README.md); runbook: [field-test-supermarket.md](../preparacion/field-test-supermarket.md).

**Timers are changing (owner C, Lorenz, C-17):** worker execution time and related timers (job window, claim TTL, gesture window) are being lengthened. Numbers such as 90 s, 300 s, 480 s and 900 s in the docs are the old defaults; re-read them from code after his PR.

**Evidence:** [codigo/docs/evidence/tx-hashes.md](../codigo/docs/evidence/tx-hashes.md) holds the real preprod transactions: M1 (paid x402 verify, `cbc9cb5d...`, `1547a4a7...`), M2 (payouts, `60d49a3a...`, `1abef825...`), M4 and M5 (escrow lock, settlement, refund). Missing: a full real cycle through the deployed engine with a store photo (B-14, T-27).

Start **every coding-agent session** from [investigacion/cardano/official-agent-prompt.md](../investigacion/cardano/official-agent-prompt.md). Before creating paid/on-chain resources, stop for the role owner's written authorisation: Payment Service databases, seeded wallets, registration and funding are included. On resume, inspect the saved resource/state inventory and reuse existing Vendor, Coworker and wallets. Never blindly retry an uncertain pending write. Personal Workspace first for M3/M4 tests; use the official prompt's TUM Workspace instructions for the demo.

## A: Isabel (pair: Fernando)

Skills: [engine-api](../.claude/skills/engine-api/SKILL.md), [masumi-sokosumi](../.claude/skills/masumi-sokosumi/SKILL.md), [security-baseline](../.claude/skills/security-baseline/SKILL.md), and [process skills](playbook/skills.md).


First 30 minutes: apply the checklist with `bash scripts/context-ack.sh --session isabel-build --who isabel` and `bash scripts/task.sh next A` at the project root. Own `codigo/apps/shell`, `codigo/apps/engine`, `codigo/packages/core`.

Already exists: JS bridge with fake-engine tests; ids-only intake retaining `REJECTED_INPUT`; engine REST/SSE, claim/challenge, capture geofence, journal and decisions; shared strict schemas, env loader, logger and state machines. The starter is still to attach.

1. **Now through Fri 11:30, support M1:** inspect/pin the official Masumi starter and record its commit in `codigo/docs/verified.md`; agree the live bridge seam, task id/deadline and no-hash behaviour with Fernando. Start from `task.sh next A` (A-01 onward); coordinate env/token settings with B.
2. **Fri 13:00, M3:** wire `createBridge` into the starter's real answer path and complete an unpaid Coworker task in the Personal Workspace (A-10). Resolve input schema/select support and deadline facts (A-11); use the existing engine rather than reimplementing it.
3. **Fri 15:00 M2, then Fri 20:00 M4 / 22:00 go/no-go:** run the joined verifier/payout flow with B; prove intake rejection and WITHHOLD submit no hash (A-12, M5). Keep one Masumi worker awake overnight (A-13). Session cookie is deferred; do not imply worker identity is authenticated.

## B: Fernando (pair: Isabel)

Skills: [x402-payments](../.claude/skills/x402-payments/SKILL.md), [cardano-preprod](../.claude/skills/cardano-preprod/SKILL.md), [security-baseline](../.claude/skills/security-baseline/SKILL.md), and [process skills](playbook/skills.md).


First 30 minutes: apply the checklist with `bash scripts/context-ack.sh --session fernando-build --who fernando` and `bash scripts/task.sh next B`. Own `codigo/packages/payments`, verifier wrapper before `evaluate(...)`, and `codigo/scripts`.

Already exists: x402 buyer/seller seams and payee/spend policy, fake adapters, durable payout queue with write-ahead/reconcile and fault injection, ledger event wiring, smoke, hub-up and public-address fund-check. No real transaction has been captured by this integration pass.

1. **Fri 11:30, M1 (B-02/B-03):** after authorisation, reuse/fund separate W-VBUY, W-PAY, W-SELL, W-MPS; make one real x402 paid request. Confirm 1 tADA floor and receipt format; save hash, receipt and explorer screenshot.
2. **Fri 13:00 SDK decision, Fri 15:00 M2 (B-04 through B-07):** test one plain preprod transfer with metadata and reconcile; apply ADR-04 fallback by 13:00 if needed. Join paid verify and payout with A; replay keys to prove no duplicate charge/payout and preserve both ledger hashes.
3. **Fri 20:00 M4, 22:00 go/no-go, overnight M5:** with A start a paid escrow cycle, then a withheld-result/refund cycle; verify actual timeout/refund timing and record explorer evidence. Validate hub/tunnel lifecycle and evidence preflight before recording; do not use fake/stub output as milestone evidence.

## C: Lorenz (pair: Helmut)

Skills: [verifier-gates](../.claude/skills/verifier-gates/SKILL.md), [security-baseline](../.claude/skills/security-baseline/SKILL.md), and [process skills](playbook/skills.md).


First 30 minutes: apply the checklist with `bash scripts/context-ack.sh --session lorenz-build --who lorenz` and `bash scripts/task.sh next C`. Own verifier `evaluate` and below, `codigo/packages/domain-shelf`, `codigo/packages/vision`, `codigo/eval`.

Already exists: both gate sets, extraction schemas and prompt constants, sharp decode/cleaning, fake/provider vision chain, catalog loader, report renderer and eval/replay runner. Tests cover reasons and injection fixtures; live-provider performance is unknown.

1. **Now through Fri 11:30:** inspect the existing gate fixtures and make one authorised real call per adapter (C-05/C-06). Confirm exact models, base URLs and image/JSON/token options. Keep expected values out of model prompts.
2. **Fri 13:00 labels; Fri 15:00 M2 (C-03/C-08/C-09):** review the [ten-photo REWE draft](../codigo/eval/labels.rewe-2026-10-30.draft.json). Blurry photos are intentional negatives; the draft has no challenge-code evidence, so it tunes G3-G5 only. Complete the 20 price + 8 OOS set with challenge codes and real demo EAN/store data; run eval and save per-gate/false-pass results.
3. **Fri 17:00 vision decision, Fri 20:00 M4 rehearsal, Sat 11:00 M6:** tune thresholds only from eval evidence (C-10/C-11), verify wrong-code/OOS/geofence paths with A+D, and help Helmut record the passing and cheating flows. Manual override, if chosen for stage use, stays visibly flagged and excluded from evidence.

## D: Helmut (pair: Lorenz)

Skills: [web-ui](../.claude/skills/web-ui/SKILL.md), [security-baseline](../.claude/skills/security-baseline/SKILL.md), and [process skills](playbook/skills.md).


First 30 minutes: apply the checklist with `bash scripts/context-ack.sh --session helmut-build --who helmut` and `bash scripts/task.sh next D`. Own `codigo/apps/web`, `codigo/packages/evidence`, `codigo/docs/evidence`, root README and pitch assets.

Already exists: worker onboarding/consent, SSE feed, first-claim flow, camera-only capture and GPS, out-of-stock flow, verdict/payout UI, catalog request form, dashboard/ledger, browser-safe package exports and ledger verification CLI. Runtime validation on phones is still open.

1. **Now / Fri 11:30, support M1 (D-02/D-03/D-27):** set up product/code/empty-shelf props and OBS, run the public audit, and prepare receipt/explorer evidence capture.
2. **Fri 13:00 dashboard, Fri 15:00 M2 (D-08/D-11/D-12/D-14):** run the fake stack/smoke, then join the real B/C path. Test two-phone first-claim race, wrong code with no payout and far-away photo with no verifier fee. Verify camera/geolocation over engine HTTPS; plain HTTP is read-only.
3. **Fri 20:00 rehearsal, 22:00 go/no-go, Sat 11:00 M6 (D-16/D-17):** test iOS Safari/Android Chrome, OOS report, dark mode, 130% text and legible live ledger. Verify the ledger before recording and save real explorer links/screenshots. Feature freeze is Sat 11:00; keep final paid cycle before Sat 13:00 and submit by Sat 15:00.

## Decisions and open approvals

- **Decided today:** keep `REJECTED_INPUT` jobs on intake rejection, with no tasks; the shell can report `INTAKE_REJECTED` using the returned job id. Worker session cookie is deferred: `workerId` remains in the request body for now. This is a known authentication gap, not a completed security control.
- **Approved by Helmut (2026-10-30):** sharp **0.34.5**, added to verifier/eval by the boilerplate work for image decoding/cleaning and evaluation. This pass adds no external dependencies; web now declares the existing evidence workspace. Review it under [docs/open-source-libraries.md](open-source-libraries.md): new libraries need Helmut's OK before addition and exact pins; never hand-edit a lockfile.
- **Pending A/B/C/D contract review:** added request fields/error codes, GET job/config/release response shapes, ledger kinds and defaults listed in [codigo/README.md](../codigo/README.md). The integration only reconciles existing env names, browser entry points and error/prompt documentation; it does not silently accept all proposals.
- **Local validation limit:** this Codex sandbox refuses TCP and Unix socket binding (`EPERM`). Production web build and socket-free tests pass, including a fake verify+payout ledger integration test. Hub-up, smoke and HTTP suites require rerunning on the hub laptop; no milestone is claimed from them here.

At handoff, update task statuses with `task.sh`, append done/TODO/Handoff to [ai-log.md](ai-log.md), and refresh only your own `equipo/<name>.md`. Register reusable helpers in [components.md](../equipo/components.md). Record real tx hashes from output with screenshots; never invent them or substitute fake hashes.
