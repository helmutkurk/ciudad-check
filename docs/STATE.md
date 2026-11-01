# Shelfie: current state

As of 2026-11-01. The result and the decisions come from Helmut, the repository owner.
Service state and domains were checked that day by an agent (systemd, HTTP, Vercel).

Shelfie is a shelf-check prototype: a brand requests one catalog product at one
store per job; a worker takes a live photo; a separate verifier checks it; passing
photos trigger a worker payout. Sokosumi/Masumi handles task escrow and x402 pays
for verification. Cardano **preprod**, test ADA only; no mainnet or real payments.
Shelfie finished **second in the Cardano track (€2,000)** at the TUM Blockchain & AI
Hackathon 2026.

## Available and unavailable

- The web remains on Vercel. Static homepage and pitch assets can be served without
  the API; the React apps can load, but their API-dependent functions are unavailable.
- The laptop hub is deliberately shut down: engine, verifier, Cloudflare tunnel and
  automatic deployment are stopped and disabled. Both API domains return **530**. No laptop hosts a backend. The vision key was removed from
  the hub. This is an operational pause, not evidence of a new application defect.
- Code inspection confirms `/b` (brand), `/w` (worker), `/dashboard` (operator),
  catalog intake, claims, camera/location checks, verifier gates, payment adapters,
  durable payout queue and evidence ledger. `/` redirects to the static `/story/`
  pitch. Presence in code does not establish current service availability.
- Historical [verified facts](../codigo/docs/verified.md), [transaction
  evidence](../codigo/docs/evidence/tx-hashes.md) and the [build log](ai-log.md)
  record paid preprod verification, payouts, settlement and refunds, including the
  completed engine/photo cycle. These records are retained; this cleanup did not
  repeat live payments or explorer checks.
- Local checks and their limits are recorded in the [cleanup audit](cleanup-2026-11-01.md).
  No live browser/phone, iPhone installation, wallet integration or cloud deployment
  was validated in this pass.

## Services and domains

| Component | `main` | `dev` | State / routing |
|---|---|---|---|
| Vercel web | `app.shelfieapp.fyi` | `dev.shelfieapp.fyi` | Hosted; only these branches build |
| Engine API | `api.shelfieapp.fyi` | `api-dev.shelfieapp.fyi` | Offline; former loopback ports 4000 / 4100 |
| Verifier | Private service | Private service | Offline; called by engine, not a public browser origin |
| Cloudflare tunnel / updater | Hub services | Hub services | Stopped and disabled |
| Sokosumi worker + Masumi service | External integrations | External integrations | No laptop backend; restart/migration not validated |

`dev` is a **web frontend**; `api-dev` is its **backend**. They are not duplicate
sites. The same separation applies to `app` and `api` for `main`.
[`codigo/vercel.json`](../codigo/vercel.json) forwards web `/api/*` to the matching
API domain, so retaining Vercel does not keep the API alive. The verifier is a
separate internal service, not `api-dev`.

## Operation and next work

Use `~/Projects/shelfie` for a local clone. `main` is the current source of truth;
Helmut may push directly under his own authorization and keeps `dev` equal to
`main`. GitHub protection remains active and is for the team to decide. This
replaces the three-approval release convention for this phase; see [ADR
0008](adr/0008-post-hackathon-operation.md). Agents still need explicit publishing
authorization.

For local fakes or reactivation, read [deploy.md](deploy.md). `npm run check` needs
`NODE_OPTIONS=--max-old-space-size=4096`: ESLint can exhaust the default heap. Continuing the hosted
backend requires a **server**, with Fly.io or a VM as options, rather than another
laptop hub. There is no committed Fly.io or Docker deployment yet.

Technical backlog (not commitments):

- Choose and provision a server; restore configuration, persistent storage,
  budgets and health checks, then validate the full preprod cycle.
- Add and verify the iPhone home-screen/PWA app icon; the web entry currently has
  a favicon but no manifest or `apple-touch-icon` link.
- Test actual wallet interoperability (including CIP-30/mobile browsers).
  Pasted preprod payout addresses are the current path; wallet ownership/session
  authentication remains a known gap. This does not authorize mainnet.
- Package services with Docker if useful for the chosen host. Consider Kubernetes
  only if an actual operational need appears.
- Review remaining code cleanup and hackathon switches; see the audit. Preserve
  local/CI fakes and evidence safeguards until their callers are reviewed.
- Review homepage accuracy and legal notices before inviting new users; findings
  are in the audit. Public homepage copy was left unchanged.
