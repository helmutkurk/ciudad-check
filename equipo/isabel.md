# Isabel - role A
- Role and pair: A, pair with Fernando (B)
- GitHub: mariaisabel16
- Reviews: pair reviews each other's commits first (peer review, `scripts/peer-review.sh`)

## Current focus
Real-mode demo (ADR-22): the Sokosumi worker + bridge + MPS on this laptop, `ENGINE_URL=https://api-dev.shelfieapp.fyi`. A-25 worker fix (parallel Tasks, restart recovery, settlement events) committed locally on `dev`, not pushed (`npm run check` has 2 payments test failures on Windows). Restart: exactly one `npm run worker` in `codigo/apps/shell/starter`.

## Active branch
`docs/decisions-2026-10-31` from `dev`: ADR-22 and doc updates for the 2026-10-31 decisions. Repo checkout: `C:\Users\maria\shelfie-team` (native Windows). The WSL clone `~/shelfie` is clean and behind `dev`; not used today.

## Components I added
| Name | Path | What it does | How to run | Status | Depends on |
|---|---|---|---|---|---|
| Starter Windows patch | `codigo/apps/shell/starter.patch` | Starter worker calls the Sokosumi CLI on Windows (`sokosumi.cmd`); `client.mjs` uses the bridge when `SHELL_TOKEN` is set | `git -C codigo/apps/shell/starter apply ../starter.patch` | works | starter at `d93783b` |
| Starter answer adapter | `codigo/apps/shell/bridge/starter-answer.js` | Maps the starter's `answer(input, journal, deadline)` to `bridge.run`; DELIVER returns the report, WITHHOLD throws | `cd codigo && npm test -w @shelfie/shell` | works (fakes) | shell bridge |

## Laptop state (Isabel, Windows 11)
- `codigo/apps/shell/starter` (repo checkout, patched): starter worker with the bridge, `PAID_TASKS_ENABLED=true`, `ENGINE_URL` still `http://127.0.0.1:4000` (must become the tunnel URL).
- Earlier starter checkout `C:\Users\maria\shelfie`: Eve `:21949`, agent API `:21950`, Masumi Payment Service `:38127` (Postgres 16 Windows service).
- Sokosumi CLI 1.0.4, OAuth session (expires; re-run `sokosumi --preprod auth login` with the Windows URL workaround in `codigo/docs/verified.md`).
- Coworker id and TUM workspace slug in the starter env match `codigo/docs/verified.md` A-25.

## Open questions
- Demo engine: `api-dev.shelfieapp.fyi` (dev) per `preparacion/hub-laptop.md`; `api` (main) only after the release PR. (Helmut)
- Sokosumi credits left on Isabel's account; each Task costs 100. (Isabel)
- Creating the `soko_preprod_` key in the Sokosumi web app is unverified. (Isabel, verify on first use)
- `scripts/task.sh` fails on native Windows (`fcntl`); task statuses from this laptop go through WSL or the ai-log. (Fernando, scripts owner)
- `docs/deploy.md` is empty but linked from several docs. (Helmut)

## Last updated
2026-10-31 02:50 Europe/Berlin by Claude Opus 5.5 (Isabel's session)
