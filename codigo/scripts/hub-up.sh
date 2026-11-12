#!/usr/bin/env bash
# Hub start script: engine, verifier, web (and optionally the tunnel). Prints URLs, checks health.
#   bash scripts/hub-up.sh [--fake] [--tunnel] [--no-verifier] [--no-web]
#   bash scripts/hub-up.sh stop | status
# --fake        FAKE_PAYMENTS=1 VERIFIER_PAYMENT=off VERIFIER_MODE=stub; no .env needed (rehearsal, red banner)
# --tunnel      also start the quick tunnel (TUNNEL_PROVIDER=cloudflared, forwards ONLY the engine port)
# Without --fake the script needs codigo/.env and fails fast if it is missing. The file is parsed line
# by line into the environment of the child processes; values are never echoed and never evaluated.
# Services bind 127.0.0.1 (the components enforce it). Start the tunnel once and do not restart it mid-demo.
# verify Friday: the exact start scripts of verifier and web (npm run start|dev -w @shelfie/<name>).
set -euo pipefail

CODIGO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${TMPDIR:-/tmp}/shelfie-hub"
ENV_FILE="$CODIGO/.env"
mkdir -p "$RUN_DIR"
cd "$CODIGO"

die() { printf 'hub-up: %s\n' "$*" >&2; exit 1; }

load_env() {
  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    key="${line%%=*}"; val="${line#*=}"
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    export "$key=$val"
  done < "$ENV_FILE"
}

stop_all() {
  local f pid
  for f in "$RUN_DIR"/*.pid; do
    [[ -e "$f" ]] || continue
    pid="$(cat "$f")"
    if kill -0 "$pid" 2>/dev/null; then pkill -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; printf 'stopped %s (pid %s)\n' "$(basename "$f" .pid)" "$pid"; fi
    rm -f "$f"
  done
}

status_all() {
  local f pid any=0
  for f in "$RUN_DIR"/*.pid; do
    [[ -e "$f" ]] || continue
    any=1; pid="$(cat "$f")"
    if kill -0 "$pid" 2>/dev/null; then printf '%-10s running (pid %s)\n' "$(basename "$f" .pid)" "$pid"; else printf '%-10s not running\n' "$(basename "$f" .pid)"; fi
  done
  [[ $any -eq 1 ]] || echo "nothing started by hub-up"
}

FAKE=0; TUNNEL=0; VERIFIER=1; WEB=1
for arg in "$@"; do
  case "$arg" in
    stop) stop_all; exit 0 ;;
    status) status_all; exit 0 ;;
    --fake) FAKE=1 ;;
    --tunnel) TUNNEL=1 ;;
    --no-verifier) VERIFIER=0 ;;
    --no-web) WEB=0 ;;
    -h|--help) sed -n 2,12p "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "unknown argument: $arg" ;;
  esac
done

if [[ $FAKE -eq 0 ]]; then
  [[ -f "$ENV_FILE" ]] || die "codigo/.env is missing. Copy .env.example to .env and fill it locally (or use --fake for a rehearsal)."
  load_env
else
  export FAKE_PAYMENTS=1 VERIFIER_PAYMENT=off VERIFIER_MODE=stub ENABLE_DRY=true
fi

ENGINE_PORT="${ENGINE_PORT:-4000}"
VERIFIER_PORT="${VERIFIER_PORT:-4021}"

start() { # name, command...
  local name="$1"; shift
  if [[ -f "$RUN_DIR/$name.pid" ]] && kill -0 "$(cat "$RUN_DIR/$name.pid")" 2>/dev/null; then
    printf '%-9s already running (pid %s)\n' "$name" "$(cat "$RUN_DIR/$name.pid")"; return 0
  fi
  nohup "$@" >"$RUN_DIR/$name.log" 2>&1 &
  echo $! >"$RUN_DIR/$name.pid"
  printf '%-9s started (pid %s), log %s\n' "$name" "$!" "$RUN_DIR/$name.log"
}

wait_http() { # url, label, seconds
  local url="$1" label="$2" secs="${3:-30}" i
  for ((i = 0; i < secs; i++)); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then printf '%-9s up: %s\n' "$label" "$url"; return 0; fi
    sleep 1
  done
  printf '%-9s DID NOT COME UP within %ss (see %s/%s.log)\n' "$label" "$secs" "$RUN_DIR" "$label" >&2
  return 1
}

# Tunnel first, so the engine starts with the public URL (origin guard and Host allowlist need it).
url=""
if [[ $TUNNEL -eq 1 ]]; then
  provider="${TUNNEL_PROVIDER:-cloudflared}"
  case "${provider:-cloudflared}" in
    cloudflared)
      command -v cloudflared >/dev/null || die "cloudflared not found in PATH (install it, or run without --tunnel)"
      start tunnel cloudflared tunnel --url "http://127.0.0.1:${ENGINE_PORT}"   # forwards ONLY the engine port
      for ((i = 0; i < 30; i++)); do
        url="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$RUN_DIR/tunnel.log" 2>/dev/null | head -n1 || true)"
        [[ -n "$url" ]] && break; sleep 1
      done
      [[ -n "$url" ]] || die "tunnel started but no URL found within 30 s; see $RUN_DIR/tunnel.log"
      printf '%s\n' "$url" >"${TUNNEL_URL_FILE:-./tunnel-url.txt}"
      export PUBLIC_BASE_URL="$url"
      host="${url#https://}"
      export ALLOWED_HOSTS="${ALLOWED_HOSTS:+${ALLOWED_HOSTS},}${host}"
      printf 'tunnel    %s  (engine gets PUBLIC_BASE_URL and ALLOWED_HOSTS; do not restart the tunnel mid-demo)\n' "$url" ;;
    *) die "unsupported TUNNEL_PROVIDER (only cloudflared is scripted)" ;;
  esac
fi

[[ $VERIFIER -eq 1 ]] && start verifier npm run start -w @shelfie/verifier --if-present
start engine npm run start -w @shelfie/engine
[[ $WEB -eq 1 ]] && start web npm run dev -w @shelfie/web --if-present

rc=0
wait_http "http://127.0.0.1:${ENGINE_PORT}/api/health" engine 40 || rc=1
if [[ $VERIFIER -eq 1 ]]; then wait_http "http://127.0.0.1:${VERIFIER_PORT}/health" verifier 20 || rc=1; fi

if [[ $rc -eq 0 ]]; then
  health="$(curl -fsS --max-time 3 "http://127.0.0.1:${ENGINE_PORT}/api/health")"
  # print only booleans, never wallet data
  printf '%s' "$health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const h=JSON.parse(s);console.log(`health ok=${h.ok} verifier=${h.verifier} fakePayments=${h.fakes.payments} fakeVerifier=${h.fakes.verifier}`);if(h.fakes.payments||h.fakes.verifier)console.log("WARNING: fake mode. Not valid for an evidence run or the live demo.");})' || true
fi

echo
echo "URLs"
echo "  engine / app   http://127.0.0.1:${ENGINE_PORT}   (worker /w, dashboard /dashboard)"
lan="${HUB_LAN_IP:-}"
[[ -n "$lan" ]] && echo "  LAN (read-only, http)   http://${lan}:${ENGINE_PORT}   (needs ALLOWED_HOSTS=${lan} for the engine)"
[[ $VERIFIER -eq 1 ]] && echo "  verifier       http://127.0.0.1:${VERIFIER_PORT}   (loopback only, never public)"
if [[ -n "$url" ]]; then
  echo "  PHONE (worker) ${url}/w   (HTTPS, camera allowed; dashboard ${url}/dashboard)"
  if command -v qrencode >/dev/null; then qrencode -t ansiutf8 "${url}/w"; fi
fi
echo "stop with: bash scripts/hub-up.sh stop"
exit $rc
