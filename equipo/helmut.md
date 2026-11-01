# Helmut - role D

- Role: D (web, evidence, README, pitch); pair expertise: Lorenz (C).
- Current phase: post-hackathon maintenance under ADR-0008.

## Current focus

2026-11-01 cleanup prepared for Opus review: current STATE and deployment guide,
operation ADR, spent-file removal, reference repair and homepage audit. The backend
is deliberately offline; web hosting remains on Vercel. No commit or push.

## Active branch

`main`, uncommitted review diff. Local HEAD matches the saved origin/main ref;
remote freshness could not be checked (read-only .git / DNS failure). Committed
main/dev trees match; dev is one merge commit behind. No branch/ref synchronization
was attempted in this read-only Git environment.

## Components

See [components.md](components.md) for the retained registry. Deployment tooling
is retained but the laptop units are stopped/disabled; new hosted operation needs
a server decision. No new reusable helper was installed in this cleanup.

## Validation and open questions

- Web: 113 tests passed; socket-free selection: 226 passed; hook suite: 113 passed.
- Typecheck/lint passed with a 4 GiB heap; the full suite could not finish because
  sandbox loopback listeners fail with EPERM. Full details and exact commands:
  [cleanup audit](../docs/cleanup-2026-11-01.md).
- Helmut/team: server choice, wallet interoperability, iPhone icon, retained
  historical/design doubts and homepage/legal claim review remain open.
- Opus: review `git diff` and the four new documentation files. Outside the
  sandbox, next validation is `cd codigo && NODE_OPTIONS=--max-old-space-size=4096 mise exec node@24 -- npm run check`.
- A later authorized purpose-file commit needs `Purpose-impact: ADR-0008`.

## Last updated

2026-11-01, Codex for Helmut (D), D-44. No live service or paid run was performed.
