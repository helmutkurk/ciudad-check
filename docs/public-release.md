# Public repository content

The repository is public (ADR 0003). Every published commit, issue and review
comment is public. Current publication workflow: [ADR 0008](adr/0008-post-hackathon-operation.md).

- Never commit secrets, local env files, private client information, worker photos,
  raw coordinates, new personal data, team-member opinions or business strategy.
- Keep ignored files, receipts and third-party downloads out of changes. Preserve
  LICENSE, NOTICE, AUTHORS, the IP agreement and transaction/evaluation evidence.
- Install git hooks once per clone (`bash scripts/install-githooks.sh`) and gitleaks.
  Before publication, inspect `git diff` and the exact staging set; run the Node 24
  checks. Scan tracked content or the staged diff with gitleaks and redact output.
  Do not recursively scan ignored secret files.
- GitHub branch protection stays active; the team decides its settings. No tooling
  in this cleanup recreates the repo, changes visibility or edits protection.

## Credential incident

If a secret was published, stop affected work and notify the credential owner
privately. The owner rotates/revokes it first; deletion does not un-leak it.
Record only the fact and time of rotation, never the value. Coordinate any history
remediation with the team; agents must not rewrite shared history or force-push.

License and ownership: [LICENSE](../LICENSE), [NOTICE](../NOTICE),
[AUTHORS](../AUTHORS.md), [draft IP agreement](ip-agreement.md). No license or
commercial-rights change is made by maintenance documentation.
