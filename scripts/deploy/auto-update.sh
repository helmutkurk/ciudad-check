#!/usr/bin/env bash
# Pull-based deploy for one branch (no inbound access, no CI runner).
#   auto-update.sh <branch> [--skip-tests] [--force]
# Every run: fetch origin/<branch>; if the commit changed, build it in a NEW release directory,
# run `npm run check`, build the web, then switch the `current` symlink and restart that branch's
# services. On any failure the previous release keeps running; the reason goes to the journal and
# the status file. Env files are never read here (only their path is checked); services load them
# through systemd EnvironmentFile=.
# Layout (SHELFIE_DEPLOY_ROOT, default ~/shelfie-deploy):
#   <branch>/repo        clone of the repo (fetch only)
#   <branch>/releases/<sha>   one worktree per deployed commit (last 3 kept)
#   <branch>/current     symlink to the live release
# Status: ${XDG_STATE_HOME:-~/.local/state}/shelfie/<branch>.status  (also <web dist>/version.json)
set -euo pipefail

BRANCH="${1:-}"; shift || true
SKIP_TESTS=0; FORCE=0
for a in "$@"; do
  case "$a" in
    --skip-tests) SKIP_TESTS=1 ;;
    --force) FORCE=1 ;;
    *) echo "auto-update: unknown argument $a" >&2; exit 2 ;;
  esac
done
[[ "$BRANCH" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "usage: auto-update.sh <branch> [--skip-tests] [--force]" >&2; exit 2; }

ROOT="${SHELFIE_DEPLOY_ROOT:-$HOME/shelfie-deploy}"
REPO_URL="${SHELFIE_REPO_URL:-https://github.com/helmutkurk/shelfie.git}"
ENV_FILE="${SHELFIE_ENV_DIR:-$HOME/.config/shelfie}/$BRANCH.env"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/shelfie"
STATUS="$STATE_DIR/$BRANCH.status"
case "$BRANCH" in main) DEFAULT_PORT=4000 ;; dev) DEFAULT_PORT=4100 ;; *) DEFAULT_PORT=4200 ;; esac
HEALTH_PORT="${SHELFIE_ENGINE_PORT:-$DEFAULT_PORT}"   # must equal ENGINE_PORT in the env file
B="$ROOT/$BRANCH"
mkdir -p "$B/releases" "$STATE_DIR"

log() { printf 'auto-update[%s]: %s\n' "$BRANCH" "$*"; }
fail() { log "FAILED: $*"; printf 'failed %s %s\n' "$(date -u +%FT%TZ)" "$*" >>"$STATE_DIR/$BRANCH.log"; exit 1; }

exec 9>"$B/.lock"; flock -n 9 || { log "another run is active"; exit 0; }

[[ -f "$ENV_FILE" ]] || { log "no env file at $ENV_FILE (create it from scripts/deploy/branch.env.example); nothing deployed"; exit 0; }

if [[ ! -d "$B/repo/.git" ]]; then
  git clone --quiet --no-checkout "$REPO_URL" "$B/repo" || fail "clone"
fi
git -C "$B/repo" fetch --quiet --prune origin "$BRANCH" || fail "fetch origin/$BRANCH"
NEW="$(git -C "$B/repo" rev-parse "origin/$BRANCH")"
CUR=""; [[ -L "$B/current" ]] && CUR="$(basename "$(readlink "$B/current")")"
if [[ "$NEW" == "$CUR" && $FORCE -eq 0 ]]; then exit 0; fi

REL="$B/releases/$NEW"
log "new commit $NEW (was ${CUR:-none}); building"
if [[ ! -d "$REL" ]]; then
  git -C "$B/repo" worktree add --detach --force "$REL" "$NEW" >/dev/null 2>&1 || fail "worktree $NEW"
fi
cd "$REL/codigo"
cleanup_bad() { git -C "$B/repo" worktree remove --force "$REL" >/dev/null 2>&1 || rm -rf "$REL"; }

( npm ci --no-audit --no-fund ) || { cleanup_bad; fail "npm ci for $NEW"; }
if [[ $SKIP_TESTS -eq 0 ]]; then
  ( npm run check ) || { cleanup_bad; fail "npm run check for $NEW (previous release stays live)"; }
fi
( npm run build -w @shelfie/web ) || { cleanup_bad; fail "web build for $NEW"; }
printf '{"branch":"%s","commit":"%s","deployedAt":"%s"}\n' "$BRANCH" "$NEW" "$(date -u +%FT%TZ)" >"$REL/codigo/apps/web/dist/version.json"

PREV="$(readlink "$B/current" || true)"
ln -sfn "$REL" "$B/current.new" && mv -T "$B/current.new" "$B/current"

restart() {
  local u
  for u in "shelfie-verifier@$BRANCH.service" "shelfie-engine@$BRANCH.service"; do
    if systemctl --user cat "$u" >/dev/null 2>&1; then systemctl --user restart "$u" || return 1; fi
  done
}
healthy() {
  local i
  for ((i = 0; i < 40; i++)); do
    curl -fsS --max-time 2 "http://127.0.0.1:${HEALTH_PORT}/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

if ! restart || ! healthy; then
  log "new release unhealthy; rolling back to ${PREV:-none}"
  if [[ -n "$PREV" ]]; then ln -sfn "$PREV" "$B/current.new" && mv -T "$B/current.new" "$B/current"; restart || true; fi
  cleanup_bad
  fail "restart/health check for $NEW"
fi

printf 'commit=%s\ndeployedAt=%s\nbranch=%s\n' "$NEW" "$(date -u +%FT%TZ)" "$BRANCH" >"$STATUS"
log "deployed $NEW"
# keep the 3 newest releases
ls -1dt "$B"/releases/*/ 2>/dev/null | tail -n +4 | while read -r old; do
  [[ "$(readlink "$B/current")" == "${old%/}" ]] && continue
  git -C "$B/repo" worktree remove --force "$old" >/dev/null 2>&1 || true
done
git -C "$B/repo" worktree prune || true
