#!/usr/bin/env bash
# Enable the repo's git hooks for this clone (once per clone, per person).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
chmod +x "$ROOT"/.githooks/* "$ROOT"/scripts/*.sh
git -C "$ROOT" config core.hooksPath .githooks
echo "core.hooksPath = $(git -C "$ROOT" config core.hooksPath). Hooks: $(ls "$ROOT/.githooks" | tr '\n' ' ')"
