# Deployment and reactivation

Current operation (Helmut, 2026-11-01): **the laptop hub is off intentionally**.
Engine, verifier, Cloudflare tunnel and automatic deployment are stopped and
disabled; no laptop hosts a backend. The hub vision key was removed. Both API
origins return 530 (reported, not checked in this cleanup). Do not restart services
while following old event notes. See [STATE](STATE.md) and [ADR 0008](adr/0008-post-hackathon-operation.md).

## Web hosting

Vercel serves `main` at `app.shelfieapp.fyi` and `dev` at `dev.shelfieapp.fyi`;
only these two branches build (Helmut). Project root: `codigo/`, install: `npm ci`,
build: `npm run build -w @shelfie/web`, output: `apps/web/dist`.
[`vercel.json`](../codigo/vercel.json) rewrites app `/api/*` to
`https://api.shelfieapp.fyi/api/*`; other web hosts use
`https://api-dev.shelfieapp.fyi/api/*`. Worker `/w`, brand `/b` and operator
`/dashboard` load the React app; `/` redirects to `/homepage/index.html`.
`/homepage/` is static. Web hosting alone cannot handle orders,
claims, verification or payouts.

## Local development

From `codigo/`, use Node 24 and the pinned lockfile:

```sh
mise exec node@24 -- npm ci
mise exec node@24 -- npm run check
mise exec node@24 -- npm run build -w @shelfie/web
mise exec node@24 -- npm run hub-up -- --fake
mise exec node@24 -- npm run smoke
mise exec node@24 -- npm run hub-up -- stop
```

The fake launcher does not read `.env`; its documented local ports are engine
4000, verifier 4021 and Vite 5173. These commands start local development services,
not the retired shared hub. Fake smoke is not payment evidence. See
[monorepo commands](../codigo/README.md) and [shell setup](../codigo/apps/shell/README.md).

## Hosted reactivation: server required

If the team continues, choose a server (Fly.io or a VM are options). There is no
Fly.io config, Docker image or Kubernetes deployment in this repo yet. The current
code uses local durable files; persistent storage and a single payout writer must
be planned before enabling live work. Do not scale replicas blindly.

1. Choose hosting and storage, then validate Node 24 and `npm run check` plus the
   web build. Establish backups and recovery for engine, order, payout, verifier
   receipt and ledger files; do not copy stale pending payment state blindly.
2. Configure secrets privately from `codigo/.env.example` and
   `scripts/deploy/branch.env.example`. A human supplies credentials; agents never
   read secret files. Provision a vision key deliberately; the old hub key is absent.
   Keep Cardano preprod, agreed budgets and no evidence overrides/fakes.
3. Start the private verifier and engine with durable paths and health checks.
   Reconnect the pinned shell worker/Masumi service only after checking their saved
   resources and pending writes; setup is in the shell README. Avoid duplicate workers.
4. Route `api` and `api-dev` to the corresponding engine. Keep the verifier private,
   HTTPS, host/origin checks and authentication. Reuse the tunnel only if selected
   for the server; Vercel `/api` rewrites must agree with the new routing.
5. Validate internal and public health, fake smoke separately, actual phone
   camera/location, real-wallet preprod receiving, and an authorized paid preprod
   order through settlement/refund. Run evidence preflight and ledger audit; save
   hashes copied from output. Only then describe the service as reactivated.

## Retained systemd deployment tooling

`scripts/deploy/` is retained, not executed by this cleanup. It assumes a Linux
user service host, `~/shelfie-deploy/<branch>/current`, and private configuration
at `~/.config/shelfie/<branch>.env`. This is separate from the recommended source
checkout at `~/Projects/shelfie`.

- `install.sh [--tunnel] [main dev]` installs units and **enables/starts update
  timers when configuration exists**; `--tunnel` can start the tunnel. Do not run
  it as a harmless inspection step on the retired hub.
- `auto-update.sh <branch>` fetches, installs, checks, builds, switches release,
  restarts verifier/engine and rolls back on failed health. It retains three
  releases; its optional `--skip-tests` is not the normal validation path.
- Engine units use loopback 4000 (`main`) / 4100 (`dev`); matching verifier ports,
  allowed hosts, origins and data paths come from private branch configuration.
  Inspect the public templates before adapting them to a server.
- Historical units: `shelfie-engine@<branch>`, `shelfie-verifier@<branch>`,
  `shelfie-update@<branch>.timer`, `shelfie-tunnel.service`. Inspect with
  `systemctl --user is-active ...` / `is-enabled ...`; logs with
  `journalctl --user -u 'shelfie-*'`. Do not enable the laptop units by default.

A server deployment and shutdown/recovery rehearsal remain unverified. Docker may
simplify packaging; Kubernetes is deferred unless an operational need appears.
