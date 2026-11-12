#!/usr/bin/env bash
# Filter: reads paths on stdin, prints those that define the project's purpose, design or agent rules.
# Single source of truth for .githooks/commit-msg, scripts/check-pr-context.sh and CODEOWNERS intent.
grep -E '^(AGENTS\.md|CLAUDE\.md|ideas/decision\.md|diseno/|\.claude/|\.github/|\.githooks/|scripts/(team\.conf|context-ack\.sh|check-pr-context\.sh|purpose-files\.sh))' || true
