#!/usr/bin/env bash
# Offline copy of the /story pitch page that opens from disk (file://), no server or network.
# Usage: bash scripts/story-offline.sh [target-dir]   (default: ../Shelfie-Pitch-Offline next to the repo)
# Run it again after every change to the page; it replaces the target folder's story/ copy.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
src="$repo/codigo/apps/web/public/story"
dest="${1:-$repo/../Shelfie-Pitch-Offline}"
mkdir -p "$dest"
rm -rf "$dest/story"
cp -r "$src" "$dest/story"
rm -f "$dest/story/story-spec.json"
# absolute site paths -> relative, so the page works from file://
sed -i 's#"/story/#"./#g' "$dest/story/index.html"
dest="$(cd "$dest" && pwd)"
printf '%s\n' "Offline copy: $dest/story/index.html (built $(date '+%Y-%m-%d %H:%M') from $(git -C "$repo" rev-parse --short HEAD))" | tee "$dest/README.txt"
