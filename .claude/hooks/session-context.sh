#!/usr/bin/env bash
# SessionStart: current operation, read-only context. ADR-0008 replaces event deadlines.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
branch=$(git branch --show-current 2>/dev/null)
[[ -z "$branch" ]] && branch="detached HEAD ($(git rev-parse --short HEAD 2>/dev/null || echo unknown))"
echo "Shelfie post-hackathon phase: read docs/STATE.md, AGENTS.md and the last two docs/ai-log.md entries."
echo "Current branch: ${branch}."
echo "ADR-0008: Helmut maintains main under his own authorization; dev stays equal to main. GitHub protection remains active. Agents need explicit publication authorization."
echo "Backend intentionally offline: laptop engine, verifier, tunnel and auto-deploy stopped and disabled. Vercel web remains; API-dependent flows are unavailable."
echo "Workflow context-ack/format/stop hooks remain unwired; security guards and checks remain enabled."
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
[[ "$dirty" != "0" ]] && echo "Working tree has ${dirty} uncommitted change(s)."
if [[ -f docs/ai-log.md ]]; then
  todo=$(tail -n 60 docs/ai-log.md | grep -E '^- (TODO|Handoff|Blocked):' | tail -n 6)
  if [[ -n "$todo" ]]; then
    echo "Recent TODO/Handoff lines (check dates; old event tasks are historical):"
    echo "$todo"
  fi
fi
echo "Read equipo/README.md and equipo/components.md; dated person notes and event tasks do not override STATE."
echo "Reminders: preprod only, never read .env, preserve evidence, run Node 24 npm run check in codigo/ before publication."
exit 0
