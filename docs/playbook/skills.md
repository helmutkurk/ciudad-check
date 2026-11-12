# Agent skills by role

Claude Code discovers project skills under .claude/skills. Codex does not auto-load these files; read the linked SKILL.md by hand.

| Skill | Role | When | Claude Code: auto-loaded from .claude/skills | Codex: read SKILL.md by hand |
|---|---|---|---|---|
| [x402-payments](../../.claude/skills/x402-payments/SKILL.md) | B | Seller, buyer, preprod facilitator, or worker payout path | .claude/skills/x402-payments/SKILL.md | [path](../../.claude/skills/x402-payments/SKILL.md) |
| [masumi-sokosumi](../../.claude/skills/masumi-sokosumi/SKILL.md) | A | Starter, Coworker, bridge, workspace, or escrow result | .claude/skills/masumi-sokosumi/SKILL.md | [path](../../.claude/skills/masumi-sokosumi/SKILL.md) |
| [engine-api](../../.claude/skills/engine-api/SKILL.md) | A | Engine API, core schemas, states, intake, or bridge contracts | .claude/skills/engine-api/SKILL.md | [path](../../.claude/skills/engine-api/SKILL.md) |
| [verifier-gates](../../.claude/skills/verifier-gates/SKILL.md) | C | evaluate(), gates, vision adapters, labels, or threshold replay | .claude/skills/verifier-gates/SKILL.md | [path](../../.claude/skills/verifier-gates/SKILL.md) |
| [web-ui](../../.claude/skills/web-ui/SKILL.md) | D | /w, /dashboard, camera/location, live feed, or M6 | .claude/skills/web-ui/SKILL.md | [path](../../.claude/skills/web-ui/SKILL.md) |
| [cardano-preprod](../../.claude/skills/cardano-preprod/SKILL.md) | All | Funding, payments, transactions, explorer links, or evidence | .claude/skills/cardano-preprod/SKILL.md | [path](../../.claude/skills/cardano-preprod/SKILL.md) |
| [security-baseline](../../.claude/skills/security-baseline/SKILL.md) | All | Every role; especially auth, payments, uploads, env, CI, or tunnel | .claude/skills/security-baseline/SKILL.md | [path](../../.claude/skills/security-baseline/SKILL.md) |
| [tum-hackathon-agent](../../.claude/skills/tum-hackathon-agent/SKILL.md) | All | Organisers' guide: TUM template, Sokosumi CLI Task, optional preprod payment test, TUM Workspace | .claude/skills/tum-hackathon-agent/SKILL.md | [path](../../.claude/skills/tum-hackathon-agent/SKILL.md) |

## Start of session per role

Load the role skills, plus security-baseline and the process skills:

- A: engine-api, masumi-sokosumi
- B: x402-payments, cardano-preprod
- C: verifier-gates
- D: web-ui
- All: security-baseline; process skills adr, log-evidence, milestone-check, pr-description, sync-context

Process skills live under .claude/skills: [adr](../../.claude/skills/adr/SKILL.md), [log-evidence](../../.claude/skills/log-evidence/SKILL.md), [milestone-check](../../.claude/skills/milestone-check/SKILL.md), [pr-description](../../.claude/skills/pr-description/SKILL.md), and [sync-context](../../.claude/skills/sync-context/SKILL.md).

## External skills (optional)

The Masumi hackathon SKILL.md, masumi-skills, Cardano Dev Skills, and Sokosumi MCP may be read as documentation. Installing any of them requires the machine owner's security review first; on Helmut's machine, use SkillSpector. Never auto-install. The Masumi hackathon SKILL.md is installed as `tum-hackathon-agent` (Fernando, 2026-10-30, after reading it in full: Markdown only, no scripts). See [the official prompt's tool rules](../../investigacion/cardano/official-agent-prompt.md#4-rules-when-we-use-this-prompt).
