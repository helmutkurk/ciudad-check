# Guardrails

Current operation: [ADR 0008](../adr/0008-post-hackathon-operation.md). Permissions
and hooks are defense in depth; neither replaces the sandbox or human diff review.
Claude hooks do not run for Codex; AGENTS applies directly to both.

| Active control | Behavior |
|---|---|
| `session-context.sh` | Read-only branch/status, STATE entry and recent handoff; no event countdown |
| `prompt-guard.sh` | Blocks secret literals; warns on mnemonic-shaped input |
| `guard-bash.sh` | Blocks env/key access, unsafe publishing, force pushes, mainnet, hook bypass, remote repo changes; asks on dependencies |
| `protect-files.sh` | Protects env/key/receipt files, lockfiles and `.git` edits |
| `.githooks/pre-commit` | Gitleaks staged secret scan |
| `.githooks/commit-msg` | Purpose-impact trailer for purpose-defining paths |
| CI | Node 24 checks and secret scan on main/dev; PR context/task checks on PRs |

The context-ack, format-on-edit, typecheck-on-stop and task-on-stop hooks remain
unwired under ADR-0008 (original suspension ADR-0007). Their files remain as legacy
tooling. No pre-commit ack is required. Reading context is still mandatory.
`test-hooks.sh` is the manual guard regression suite.

Helmut's own direct-main workflow does not grant blanket publishing rights to
agents. Existing agent push guards remain restrictive. GitHub branch protection
remains active; the team decides settings. This cleanup neither changes protection
nor asserts that its live configuration was verified. Optional PRs still use the
context/task template and CI checks; a three-approval release PR is no longer the
phase's working convention.

Never bypass a blocking guard or use local settings to weaken it. Report legitimate
blocks; rule changes require explicit review and the appropriate purpose impact.
The git hooks must be installed per clone. If a credential leaks, follow
[public-release.md](../public-release.md), Credential incident.

Known limits: regex-based guards cannot catch every secret or command spelling;
local overrides may weaken controls. Inspect diffs and staged paths, preserve
ignored files and keep dependency pins. Do not claim enforcement that was not tested.
