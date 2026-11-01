# Hub laptop: requirements and setup

> 2026-10-31 (ADR-22): engine and verifier run on Helmut's hub behind the Cloudflare tunnel (setup: `scripts/deploy/`); Isabel's Windows laptop runs only the Masumi Payment Service and the Sokosumi worker with the bridge. Sections below that name Isabel as hub operator or the engine serving `/w` and `/dashboard` are pre-hackathon.

Decision (Helmut, 2026-10-30 evening, replaces the 2026-10-29 decision below): **Helmut's laptop is the definitive hub** for the engine, verifier and the Cloudflare tunnel (systemd --user services with auto-update, real mode on api-dev, see `../docs/deploy.md`). The Sokosumi shell worker and the Masumi Payment Service (Postgres) stay on **Isabel's laptop** and talk to the engine at `https://api-dev.shelfieapp.fyi` (later `https://api.shelfieapp.fyi`) with the `SHELL_TOKEN` from Helmut's hub env (handed over in person, never chat/git). Reason: the engine stack already runs and is verified on Helmut's laptop; MPS + Postgres would not fit in its 14 GB next to OBS. Only one machine may run the tunnel and engine at a time.

Earlier decision (Helmut, 2026-10-29): the hub is **Isabel's laptop**. Operator: Isabel (role A). Backup operator: Fernando (role B). Fallback hub: Helmut's laptop (about 14 GB RAM, so only if Isabel's fails the checks). OBS and screen recording run on a different laptop (Helmut's).

The hub runs everything during the demo, as in `../diseno/architecture.md` section 4: engine `:4000` (serves `/api`, `/w`, `/dashboard`), verifier `:4021`, shell worker + agent API `:21950`, Masumi Payment Service (MPS) `:38127` with Postgres 15 in Docker, a Cloudflare quick tunnel exposing only `:4000`, and a browser with the dashboard on the projector. Threat model: `../diseno/security.md` (H1, H3, H4, section 4.5 and 4.6).

## 0. First check (Fri, before anything else; Isabel's specs are unknown)
Run on the laptop and write the result in the group chat and `../equipo/isabel.md`:
- [ ] RAM >= 16 GB (`free -h` / About This Mac). 8 GB is not enough; 14 GB is a fallback only.
- [ ] Free disk >= 20 GB (`df -h .`).
- [ ] OS: Linux or macOS (Windows only through WSL2: not tested, avoid). Note version and CPU architecture (Apple silicon vs x86: affects Docker images, verify the Postgres 15 and MPS images run).
- [ ] Charger present, ports for HDMI/USB-C adapter confirmed.
If any item fails, switch to the fallback hub (Helmut's laptop) at once; do not debug on the clock.

## 1. Hardware
- RAM >= 16 GB recommended: Docker + Postgres + MPS + four Node processes (engine, verifier, shell, tooling) + a browser with the dashboard. OBS must not run here.
- Disk >= 20 GB free (Docker images, `node_modules`, evidence photos, logs).
- Mains power the whole event: original charger plus a power strip; battery is not a plan.
- Video: HDMI or USB-C adapter tested with the venue projector (bring a spare adapter; mirror, not extend, or extend with the dashboard window on the projector only).
- Network: venue Wi-Fi plus phone hotspot as fallback; ethernet adapter if available. Test the tunnel on both. Outbound access is needed to Sokosumi preprod, Blockfrost, the x402 facilitator, the vision API and Cloudflare.

## 2. Operating system and software
Linux or macOS. Versions follow the runbooks (`../investigacion/cardano/masumi-runbook.md`, `x402-runbook.md`, `thursday-evening-checklist.md`); anything marked verify is confirmed Friday.

| Tool | Version / note |
|---|---|
| Node | 24.22.x via mise (`mise install node@24`; global Node 26 is unsupported by the Masumi tooling) |
| Package manager | pnpm 10.30.2 or npm as the runbooks specify (`npm install --global pnpm@10.30.2`) |
| Docker | running at boot (Docker Desktop on macOS: start at login); runs Postgres 15 and MPS, ports published as `127.0.0.1:port:port` only |
| cloudflared | quick tunnel `cloudflared tunnel --url http://127.0.0.1:4000` (no account; verify Friday) |
| git, jq | needed by repo hooks (`jq`) and scripts |
| gh | GitHub CLI, logged in |
| gitleaks | hooks + pre-commit (`bash scripts/install-githooks.sh`) |
| psql client | check Postgres (`psql -h 127.0.0.1 -U postgres -c 'select 1'`) |
| Browser | a dedicated clean profile (below) |
| NTP | system time synchronised (timedatectl / Date & Time automatic): gate G6 (timing) compares photo, claim and server times |

## 3. Event-time configuration
- Sleep, suspend, hibernate and screen lock disabled while the event runs (system settings; macOS: `caffeinate -dimsu` as an extra). Never leave the laptop unattended while it is unlocked: the operator or backup stays with it, or it is physically watched.
- Notifications off (Do Not Disturb), including chat apps and email; nothing private may pop up on the projector.
- Clean browser profile: new profile with no personal tabs, bookmarks, saved passwords or sync; only the dashboard and Cardanoscan. The screen is public.
- Full-disk encryption on (FileVault / LUKS).
- Separate OS user for the event if possible (no personal files, no personal sessions).
- Env files only on the hub, never copied to other laptops or chats. Wallet keys for `W-VBUY`, `W-PAY`, `W-SELL`, `W-MPS` live only there (throwaway preprod wallets). Backup of the `.env` values in a password manager (shared vault between Isabel and Fernando), never in the repo, chat or screenshots.
- No terminal output of seeds or `ADMIN_KEY` on screen or in the recording (security scaffold item 22).

## 4. Ports and checks
`scripts/hub-check.sh` (D builds it, scaffold item 18; task D-24) prints listening sockets and fails if 4021, 21950, 38127 or 5432 is bound to a non-loopback address. From a phone on mobile data, those ports must not answer, and `curl https://<tunnel-host>/api/admin/reset` returns 404 or 401. Run it before opening the tunnel and after every restart. Do not restart the tunnel mid-demo (the hostname changes; the dashboard QR must be re-scanned).

## 5. Pre-demo checklist
Friday evening (before leaving the venue):
- [ ] Section 0 checks passed and recorded; hub-check.sh passes.
- [ ] Docker starts on boot; after a reboot Postgres and MPS come up by themselves (reboot test).
- [ ] All `.env` values backed up in the password manager; no `.env` on any other laptop.
- [ ] Charger, adapter, power strip, hotspot phone packed; laptop does not sleep on lid close if used closed (or the lid stays open).
- [ ] Clock synchronised; Do Not Disturb on; clean browser profile ready.
- [ ] Evidence (`docs/evidence`) and `evidence.jsonl` backed up.

Saturday morning:
- [ ] Mains power, charger, adapter and projector test.
- [ ] Docker running; MPS and Postgres up; wallets funded (preprod); `hub-check.sh` passes.
- [ ] Tunnel up once, URL printed and QR on the dashboard; one phone on mobile data and one on venue Wi-Fi tested.
- [ ] Sleep/lock disabled; notifications off; browser profile clean; recording laptop separate.
- [ ] Override and fakes off (`ENABLE_DRY=false`, `FAKE_PAYMENTS` unset); `evidence-preflight.ts` passes.
- [ ] Backup operator knows where the password-manager entry and the start commands are.

## 6. Ownership
Operator: Isabel (A). Backup: Fernando (B). The operator is the only person who restarts the worker or the tunnel; others ask. Helmut (D) supplies `hub-check.sh` and the dashboard. If the hub dies: fallback hub (Helmut's laptop) with `.env` restored from the password manager; the M1-M3 work continues on any laptop against fakes.
