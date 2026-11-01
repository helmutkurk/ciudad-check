# Ways of working

Current operation: [STATE](../STATE.md), [ADR 0008](../adr/0008-post-hackathon-operation.md).
Role expertise is in `diseno/repo-layout.md` section 2 and `scripts/team.conf`.
Ownership is informational, not an edit barrier.

1. Read context and the relevant active specification before editing.
2. Work in small reviewable changes. Use local/CI fakes separately from evidence.
3. Use `scripts/task.sh` for new tracked work; old event tasks and dates remain
   historical. Do not hand-edit tables or mark unverified event work complete.
4. Run Node 24 `npm run check` in `codigo/`, review the diff and record limitations.
5. Publish only when authorized. Helmut maintains main directly and keeps dev
   equal to main; GitHub protection stays active and team-controlled. Never force
   pushes, delete protected branches, rewrite history or bypass hooks.

Shared core contracts must match `diseno/contracts.md`; announce changes to the
user before editing. Repository decisions go in `docs/adr/`; design decisions stay
in `diseno/decisions.md`. Unknown platform facts stay unverified until sourced.

Append each work block to `docs/ai-log.md` (done, TODO, Handoff, exact next command
and validation). Refresh only your own `equipo/<name>.md`. Register reusable
helpers in `equipo/components.md`. Keep real hashes and screenshots in
`codigo/docs/evidence/`; never substitute synthetic output for evidence.

The retained peer-review script can inspect old dev commits, but its posting
commands require explicit authorization. It does not mandate the former release
PR or a new event schedule.
