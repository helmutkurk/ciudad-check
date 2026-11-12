# 0003. Public GitHub repo from the start

- Status: accepted
- Date: 2026-10-29
- Deciders: Helmut
- Supersedes: [0002](0002-single-private-repo-then-public-export.md)

## Context
ADR 0002 planned a private working repo and a curated public export without history. The submission needs a public repo anyway (`preparacion/submission-checklist.md`). The export adds a Saturday task (script, scan, manual review, second repo, README caveat) at the worst time, and the private plan only gets branch protection if the owner has GitHub Pro. The risk 0002 avoided is real: history of a public repo is permanent.

## Decision
- Create the GitHub repo **public on Friday** (`scripts/launch-github.sh --go`), after a pre-push audit of the whole tree (`docs/public-release.md`). The first commit is the first public history; there is no private phase and no export.
- Everyone installs the git hooks and gitleaks before the first push of their clone (`bash scripts/install-githooks.sh`); the pre-commit hook runs gitleaks when installed.
- `docs/ai-log.md`, `AGENTS.md`, agent config, research and design stay in the repo and are public. Personal material (`invoice/`) and third-party downloads (`downloads-blockchain-website/`, saved site copies) are git-ignored.
- `scripts/export-public.sh` is kept only as a deprecated fallback (for example if a leak forces a fresh repo).

## Consequences
- Branch protection, secret scanning and push protection are expected to be free on public repos: **verify in repo settings Friday** (Settings > Branches, Settings > Code security) and record the result in `codigo/docs/verified.md`. `launch-github.sh --protect` enables them and checks the answer.
- History is permanent: a secret, personal datum or client name committed once stays visible in clones and caches even after deletion. A leaked key is rotated, not just removed (`docs/github-setup.md` section 8).
- Strategy notes (`diseno/product-roadmap.md`, `ideas/`, `pitch/qa-prep.md`) and prompts/workflow in `.claude/` are visible to judges and competitors. Accepted: the idea is already presented publicly; the business moat is execution, not secrecy.
- No export task on Saturday; the Devfolio repo link works from Friday.
- Anyone can read issues, PRs and commit messages: write them accordingly (no secrets, no personal data, no client names).

## Mitigations
- Pre-push audit and checklist (`docs/public-release.md` section 3), run before the first push and repeated before submission.
- gitleaks locally (pre-commit) and in CI (`secret-scan`); GitHub secret scanning and push protection as a second layer once verified.
- `.gitignore` for env files, keys, `invoice/`, third-party downloads; AGENTS.md "Never do" and the `.claude/` hooks.
- Throwaway preprod wallets only; no real personal data (workers' data stays out of the repo, `diseno/security.md`).
- Branch protection on `main` right after the first CI run.

## Alternatives considered
- Private repo plus public export without history (ADR 0002): cleaner history, but a second repo, a Saturday export, and the private repo needs Pro for protection.
- Private repo made public on Saturday: history decided at the worst moment, no time to audit.
- Public repo with history rewritten before Saturday: error-prone under time pressure.
