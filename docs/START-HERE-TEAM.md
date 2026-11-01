# Start here, team

Read [STATE.md](STATE.md) for the post-hackathon state (2026-11-01), then
[AGENTS.md](../AGENTS.md). The backend is deliberately offline. Vercel web hosting
does not provide engine or verifier functionality. No laptop needs to stay on.

## Local checkout and validation

Recommended location: `~/Projects/shelfie`. Use the existing clone if present.
For a new checkout:

```sh
mkdir -p ~/Projects
cd ~/Projects
git clone https://github.com/helmutkurk/shelfie.git
cd shelfie
git switch main
bash scripts/install-githooks.sh
cd codigo
mise exec node@24 -- npm ci
mise exec node@24 -- npm run check
```

Install gitleaks for the public-repo pre-commit scan. No dependency upgrades are
needed. Follow [codigo/README.md](../codigo/README.md) for local fake services,
web build, smoke, evaluation and shell setup. Never read or paste local secrets.

## Current workflow

Helmut maintains `main` directly under his own authorization and keeps `dev` equal
to it. Only these branches build on Vercel. The former three-approval release PR
convention is superseded for this phase by [ADR 0008](adr/0008-post-hackathon-operation.md).
GitHub protection remains active; the team decides protection changes. Agents need
explicit publication authorization. Preserve security hooks and run checks.

For reactivation use [deploy.md](deploy.md). Choose a server before resuming hosted
backend operation; Fly.io and a VM are options. Do not restart the retired laptop
hub just because old task notes say it should be running.

## Read for the area you change

- [Design index](../diseno/README.md), [contracts](../diseno/contracts.md),
  [security](../diseno/security.md), [ownership and tests](../diseno/repo-layout.md).
- [Components](../equipo/components.md), [team records](../equipo/README.md),
  [agent setup](playbook/agent-setup.md), [role skills](playbook/skills.md).
- [Recorded evidence](../codigo/docs/evidence/README.md),
  [verified facts](../codigo/docs/verified.md) and the last two [log entries](ai-log.md).

Dated task lists, milestones, evaluations and pitch material document the build;
they are not current uptime claims or a new release schedule. Open cleanup and
homepage questions are in the [audit](cleanup-2026-11-01.md).
