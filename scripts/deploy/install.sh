#!/usr/bin/env bash
# Installs the systemd --user units for the pull-based deploy. Idempotent. Touches no secrets and
# does not start the tunnel. Usage: bash scripts/deploy/install.sh [--tunnel] [branch ...]  (default: main dev)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
BIN_DIR="$HOME/.local/share/shelfie/bin"
CONF_DIR="$HOME/.config/shelfie"

TUNNEL=0; BRANCHES=()
for a in "$@"; do case "$a" in --tunnel) TUNNEL=1 ;; *) BRANCHES+=("$a") ;; esac; done
[[ ${#BRANCHES[@]} -gt 0 ]] || BRANCHES=(main dev)

mkdir -p "$UNIT_DIR" "$BIN_DIR" "$CONF_DIR" "$HOME/shelfie-deploy"
chmod 700 "$CONF_DIR"
install -m 0644 "$HERE"/systemd/*.service "$HERE"/systemd/*.timer "$UNIT_DIR/"
install -m 0755 "$HERE/auto-update.sh" "$BIN_DIR/auto-update.sh"
install -m 0644 "$HERE/branch.env.example" "$CONF_DIR/branch.env.example"
install -m 0644 "$HERE/cloudflared.example.yml" "$CONF_DIR/cloudflared.example.yml"
systemctl --user daemon-reload

for b in "${BRANCHES[@]}"; do
  if [[ -f "$CONF_DIR/$b.env" ]]; then
    systemctl --user enable --now "shelfie-update@$b.timer"
    echo "enabled: shelfie-update@$b.timer (first build starts within a minute; engine/verifier start after it)"
    systemctl --user enable "shelfie-engine@$b.service" "shelfie-verifier@$b.service"
  else
    echo "SKIPPED $b: create $CONF_DIR/$b.env from $CONF_DIR/branch.env.example (fill tokens, chmod 600), then re-run this script"
  fi
done

if [[ $TUNNEL -eq 1 ]]; then
  if [[ -f "$CONF_DIR/cloudflared.yml" ]]; then systemctl --user enable --now shelfie-tunnel.service
  else echo "SKIPPED tunnel: create $CONF_DIR/cloudflared.yml from cloudflared.example.yml first"; fi
fi

echo
echo "Next: run once  loginctl enable-linger $USER  (services survive logout/reboot; needs no secrets)"
echo "Logs: journalctl --user -u 'shelfie-*' -f"
echo "Stop all: systemctl --user stop 'shelfie-*'   (see docs/deploy.md)"
