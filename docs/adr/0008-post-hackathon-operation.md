# 0008. Post-hackathon operation

- Status: accepted
- Date: 2026-11-01
- Deciders: Helmut (repository owner)
- Supersedes: ADR-0005 and ADR-0006 branch/release rules for this phase; the laptop
  runtime in design ADR-22. Retains the unwired workflow-hook configuration from
  ADR-0007; security guards remain enabled.

## Context

The hackathon is over. Shelfie placed second in the Cardano track (€2,000), as
reported by Helmut. Keeping a personal laptop online is no longer the operating
model. Vercel still serves the web, while the API is intentionally unavailable.

## Decision

- Keep the laptop engine, verifier, Cloudflare tunnel and automatic deployment
  stopped and disabled. No laptop hosts a backend; the vision key was removed
  from the hub. `api.shelfieapp.fyi` and `api-dev.shelfieapp.fyi` return 530.
- If development continues, deploy the backend to a server. Fly.io and a VM are
  options; no provider, Docker or Kubernetes implementation is selected here.
- Keep only `main` and `dev`. Vercel builds these branches only, at
  `app.shelfieapp.fyi` and `dev.shelfieapp.fyi`. Each web branch has a separate API
  origin; the API is not another copy of the web frontend.
- Helmut pushes directly to `main` under his own authorization and keeps `dev`
  equal to `main`. This replaces ADR-0006's three-approval release PR rule while
  the project is in this phase. GitHub protection stays active; the team decides
  any protection change. Agents receive no blanket permission to publish.
- Keep existing security guards and checks. Do not automatically restore the
  suspended workflow hooks or weaken push guards to implement this decision.
- Recommend `~/Projects/shelfie` for local clones. Make `docs/STATE.md` the current
  entry point; retain decisions, evidence, evaluations, licensing and build history.
  Remove demonstrably spent event instructions and one-use implementation prompts.

## Consequences

Static web content stays accessible, but brand orders, worker feeds/submissions
and live dashboard data depend on the offline API. Reactivation needs a deliberate
server/configuration decision and validation, described in [deploy.md](../deploy.md).
Historical records describe the event, not current uptime. No branch protection,
remote branch, credential or service is changed by this documentation cleanup.

## Alternatives considered

- Keep the laptop hub running: rejected for this phase by Helmut.
- Continue the `dev` integration / three-approval release workflow: replaced by
  Helmut's direct maintenance of `main` and synchronized `dev`.
- Choose Fly.io or Kubernetes now: deferred until continuation and hosting needs
  are decided.
