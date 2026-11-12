# 0002. One private repo now, public export later

- Status: superseded by [0003](0003-public-repo-from-the-start.md)
- Date: 2026-10-29
- Deciders: Helmut

## Context
The submission needs a public repository with README and design folder (see `preparacion/submission-checklist.md`). The working repo also holds planning material, agent configuration, personal-adjacent files and a history that includes experiments. A leaked secret in history is permanent once public.

## Decision
- Work in one private GitHub repository containing everything (code, design, research, pitch, governance).
- For the submission, create a separate public repository by exporting a curated tree **without git history** (script and checklist: `docs/public-release.md`). The private repo stays private.
- The export excludes `invoice/`, personal files, agent runtime config as decided in `docs/public-release.md`, and runs a secret scan before anything is pushed.
- No history is rewritten, dates and commits in the private repo stay as they are. The public repo's history starts at its first commit and says it is an export.

## Consequences
- No risk from secrets in private history reaching the public repo.
- Judges see a clean repo; the private repo remains the full record. The public README should state that the repo was exported from a private working repo.
- Someone must run the export and a final scan before the Saturday deadline (14:30 gate in `diseno/repo-layout.md`).

## Alternatives considered
- Make the private repo public: carries all history and every mistake.
- Rewrite history before going public: error-prone under time pressure.
- Public repo from the start: secrets risk and strategy notes exposed.
