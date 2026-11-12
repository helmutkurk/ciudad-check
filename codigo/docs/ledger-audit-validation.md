# Ledger audit validation (D-42)

Codex for Helmut (D), 2026-10-31. Branch `feature/ledger-audit`, prepared worktree.
No git writes, dependencies, live deployment writes, real transactions or secret-file reads.
Implementation is confined to the audit script/helpers and script test discovery; B-owned
`codigo/scripts/` is changed by D for this task. Canonical model: `diseno/domain-model.md`.

Journeys derived from the request: audit a valid decided job with one payout; reject broken
chains, failed/withheld payouts, duplicate task/submission payments and missing cross-store
records; inspect preprod UTxOs and report wallet movement; run entirely offline with synthetic
fixtures; fail without leaking configuration or upstream errors.

## Evidence

All commands below ran with Node 24.22.2 first on PATH, from `codigo/`.

| Check | Command / evidence | Result |
|---|---|---|
| TDD RED | Initial imports failed because audit implementations did not exist. Later executed regressions: 4 failed / 13 passed for missing ledger/queue/receipt links and legitimate intake rejection; then 1 failed / 18 passed for faucet classification; then 2 failed / 19 passed for lost jobs and payout-only time-window activity. | Confirmed missing behavior before each fix |
| Audit tests GREEN | `node node_modules/vitest/vitest.mjs run --configLoader native --no-cache scripts/ledger-audit.test.ts scripts/ledger-audit-chain.test.ts scripts/ledger-audit.sec.test.ts` | 3 files, 33 tests passed |
| Script types | `node node_modules/typescript/bin/tsc -p scripts/tsconfig.json` | PASS |
| Script lint | `node node_modules/eslint/bin/eslint.js scripts/ledger-audit*.ts` | PASS |
| Formatting | `node node_modules/prettier/bin/prettier.cjs --check 'scripts/ledger-audit*.ts' vitest.config.js` | PASS |
| Redacted secret scan | `cat codigo/scripts/ledger-audit*.ts codigo/docs/ledger-audit-validation.md \| gitleaks stdin --redact --no-banner` (repo root) | No leaks found |
| Root quality gate | `npm run check` | Workspace typecheck and lint PASS. Test startup blocked by EROFS writing Vitest's bundled config to the read-only `node_modules/.vite-temp` |
| Full tests with native loader | `node node_modules/vitest/vitest.mjs run --configLoader native --no-cache` | Existing HTTP integration suites timed out under the socket restriction; stopped after repeated failures. No full-suite PASS claimed |
| CLI | `node --import tsx scripts/ledger-audit.ts --help` | PASS, usage displayed |
| Diff hygiene | `git diff --check` | PASS; read-only git only |
| Peer review | `bash scripts/peer-review.sh pending` | Unavailable: gh not authenticated; orchestrator/hub must review before integrating |

The 33 tests cover chain sequence/link/timestamp corruption (including before `--since`),
job-to-payout cardinality, no payment for withheld or non-passing work, effective PASS and
stored worker address, conflicting historical hashes, reset history retention, malformed
stores, uncertain verify state, verifier receipt deduplication/double payment, missing durable
and ledger records, Markdown funding classification, run-window activity and lost jobs.

Pure chain tests check sender inputs, change, receiver net amounts, reference/collateral
exclusion, script validation, exact integer wallet deltas, paginated history, cached hashes
and query failure redaction. Security/CLI tests exercise preprod guards, exclusion of signing
secrets from parsed config, GET-only fixed origin, redirect refusal, invalid flags/timestamps,
and a file-backed `--no-chain` pass with unchanged bytes and zero fetch calls. Removing a
required fixture produces exit 1. Fixture source is under 50 KB and entirely synthetic.

No instrumented coverage percentage is claimed: the optional coverage provider is absent;
a native V8 coverage attempt captured the Vitest launcher rather than worker modules. No
package was installed to change that. Live Blockfrost correctness, real wallet movements and
an audit of the deployed data remain unverified in this socket-restricted sandbox. No tx hash
was observed live or added to the evidence log.

## Next action

Use the exact deployment command in [scripts/README.md](../scripts/README.md#deployment-ledger-audit-d-42)
on the unrestricted hub, adding `--no-chain` for a local-only audit. The four documented data
paths exist; their contents and the secret env file were not opened during this work block.
Confirm the env contains the three public wallet addresses and prices used during the run.
Run `npm run check` on the normal writable checkout before integrating. The orchestrator owns
commit/integration and authenticated peer review; all changes remain uncommitted here.
