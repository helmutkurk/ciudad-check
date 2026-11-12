# 0006. Direct push to `dev`, peer review by agents, release to `main` by all four

- Status: branch/release rules superseded by ADR-0008 for the post-hackathon phase; other decisions retained
- Date: 2026-10-30
- Deciders: Helmut

## Context

During the hackathon (Fri 09:00 to Sat 15:00) a PR plus a human review for every change into `dev` slows four people and their coding agents down. The risk the PRs were meant to cover (nobody looks at what others push) is better covered by each person's agent reading the commits of the others. `main` must still hold only what all four have checked.

## Decision

- `dev` is the integration branch; everyone pushes directly, with no PR per change, no required human review and no code-owner review. Before pushing: `git pull --rebase origin dev` and `npm run check` in `codigo/` (when `package.json` exists). Feature branches are optional (risky or long work): merge into `dev` locally and push, no PR. Never force-push or delete `dev` or `main`; never rewrite shared history.
- Cross-agent peer review replaces PR review on `dev`: each person's agent reviews the commits other people pushed. Mechanism: `scripts/peer-review.sh` (`pending`, `show`, `ok`, `issue`, `status`), with state in GitHub commit comments (`peer-review: ok|issue (<name>) <note>`). Every work block starts with `bash scripts/peer-review.sh pending`; procedure in `.claude/agents/reviewer.md`. A small obvious problem is fixed by the reviewer in a new commit on `dev` referencing the sha; otherwise the commit is marked `issue` and the author's agent fixes it in its next block. If agents disagree, the humans decide in chat and write it down (ADR or `diseno/decisions.md`).
- `main` changes only through ONE release PR `dev` -> `main`, after `npm run check` and `npm run smoke` pass on `dev`, no `issue` peer review is open in the release range (`peer-review.sh status` exits 0), and the three teammates who did not open the PR approve (GitHub enforces 3 approvals; the opener is the 4th). Merge commit, not squash; then fast-forward `dev` if needed. Helmut (admin) may bypass only for an emergency fix in the last hour before the Sat 15:00 deadline, and says so in chat and in `docs/ai-log.md`.
- Hotfixes: no branches from `main`; fix on `dev`, then a release PR.
- Folder ownership stays as "who knows this area". CODEOWNERS becomes informational. Anyone may edit another role's folder; the owner's agent sees it in peer review. Changes to shared contracts (`codigo/packages/core`, `diseno/contracts.md`) are announced in chat.
- Unchanged: context-ack pre-commit gate, commit-msg `Purpose-impact` trailer for purpose files, gitleaks pre-commit and CI secret scan, no secrets, no `--no-verify`, preprod only, task tracking via `scripts/task.sh` (commits reference tasks, e.g. `(A-10)`; the "Tasks:" line remains only in the release PR), conventional commits, pinned dependencies (the reason goes in the commit message).

## Consequences

- Faster flow; mistakes reach `dev` earlier and are caught after the push by another agent, not before. `dev` may be briefly broken; the author or reviewer fixes forward.
- Peer review is a convention backed by a script, not enforced by GitHub; only the release PR is a hard gate (3 approvals, required checks, `peer-review.sh status`).
- Branch protection changes (`scripts/launch-github.sh --protect`): `dev` has no required PR, no required checks, no force push, no deletion, `enforce_admins` false; `main` requires a PR with 3 approvals, stale-review dismissal, the existing required checks, no force push, no deletion, `enforce_admins` false. Required checks `context-gate` and `task-status` run on PRs, so they now apply to the release PR.
- `guard-bash.sh` allows `git push` to `dev` and keeps blocking `main`, force, mirror, delete and `--all`. The PR template is for the release PR only.
- Requires `gh` (authenticated) and `jq` on every laptop for peer review.

## Alternatives considered

- Keep PRs into `dev` with one review (ADR-0005): rejected, too slow for four people and agents in a 30-hour window.
- Push directly with no review at all: rejected, nobody would see what others changed; the agents would diverge.
- Human review of every dev commit: rejected, it recreates the PR bottleneck.
- Squash or one PR per milestone into `main` with fewer approvals: rejected, Helmut decided `main` holds only what all four checked.
