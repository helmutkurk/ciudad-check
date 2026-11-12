---
name: adr
description: Write a new Architecture Decision Record in docs/adr from a decision discussed in the session or the team. Use when a technical decision affects architecture, integrations, wallets, payments or team workflow.
argument-hint: "<decision title>"
disable-model-invocation: true
---
# New ADR

1. List `docs/adr/` and take the next free 4-digit number. Check `diseno/decisions.md` first: design-level ADRs live there; this folder is for repo, tooling and build-time decisions.
2. Copy `docs/adr/0000-template.md` to `docs/adr/NNNN-<kebab-title>.md`.
3. Fill Context, Decision, Consequences, Alternatives considered. Only facts from the discussion; mark open points "decide Friday" instead of guessing.
4. Status `proposed` unless the team has accepted it. Deciders = people named in the discussion.
5. If it replaces an earlier ADR, set the old status to `superseded by NNNN` (that line only).
6. Add a line to `docs/ai-log.md` and link the ADR from the commit message (`Purpose-impact: ADR-<id>` when purpose files change).
