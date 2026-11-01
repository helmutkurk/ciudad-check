# 0005. Branch model: `dev` for integration, `main` for final

- Status: branch/release rules superseded by ADR-0008 for the post-hackathon phase (previously amended by ADR-0006)
- Date: 2026-10-30
- Deciders: Helmut

## Context

The single protected `main` workflow mixed integration work with the final demo and submission state. The team needs a shared branch for testing and a controlled release path for `main`.

## Decision

- Keep `dev` as the long-lived integration branch and `main` as the final demo/submission branch.
- Create every feature, fix and docs branch from `dev`; open PRs into `dev`. Require one review from the pair or a code owner and squash-merge these PRs.
- Change `main` only through a release PR from `dev`, after `npm run check` and `npm run smoke` pass on `dev` and Helmut (D) approves. Merge the release with a merge commit, not squash.
- After each release, fast-forward `dev` to the same commit as `main` if needed.
- Start hotfix branches from `main`, PR them into `main`, then open and merge a follow-up PR from `main` into `dev` within the same hour.
- Never push directly to `dev` or `main`; do not force-push either branch.

## Consequences

- CI and Security run on pushes and pull requests for both protected branches. Both require pull requests, one code-owner review, required checks, no force pushes and no deletion.
- The PR template distinguishes ordinary changes, releases and hotfixes; release PRs record check and smoke results.
- Contributor docs, agent guidance and push guards use `dev` as the integration base. The initial repo setup must create `dev` from `main` before normal team work starts.
- The release merge commit can advance `dev` by fast-forward so both branch names point at the same commit before the next feature branch starts.

## Alternatives considered

- Use only `main` for integration and releases: rejected because in-progress changes would share the final submission branch.
- Squash release PRs: rejected because the requested release merge commit preserves `dev` as an ancestor, allowing `dev` to fast-forward to the released commit.
- Branch from `main` and PR all work there: rejected because it does not provide a separate integration branch.
