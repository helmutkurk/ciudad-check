# Official agent prompt: Cardano track (organisers' text)

Pasted by Helmut on 2026-10-29. It is the organisers' ready-made prompt for a coding agent (Claude Code / Codex) in the Cardano track. Below: the verbatim text, our filled-in version for Shelfie, what it changes compared with our runbooks, and the rules we apply when using it. Documented by Claude, 2026-10-29.

## 1. Verbatim text

```text
# Cardano: Agentic Commerce on Cardano
Help me build an agent for the Cardano track of the TUM Blockchain & AI Hackathon (30-31 October 2026, Munich).
For [team], turn [input] into [useful result].

Official guide, read it first: https://www.masumi.network/tum-hackathon/agent-guide.md
Track rules: https://hackathon.tum-blockchain.com/prizes#cardano
Submission rules: https://hackathon.tum-blockchain.com/prizes#how-to-submit

Paid per job: Masumi on Sokosumi
- Use https://github.com/masumi-network/tum-hackathon-quickstart. Read its README and AGENTS.md before setup. Adapt the existing template.
- Use Node.js 24, its pinned dependencies and Sokosumi CLI 1.0.4. Read sokosumi skills and command help before account changes.
- Use my own Preprod account (https://preprod.sokosumi.com/signup) and Personal Workspace. Reuse my saved resources on resume.
- First verify a model reply and one execution-only Coworker Task. Then add the Preprod payment once I authorize the setup.

Paid per request: x402
- Start from https://developers.cardano.org/x402/ and the x402-express or x402-next template. Add a Blockfrost preprod key and get test ADA from the faucet.

To qualify, complete at least one paid job or paid request on Cardano preprod and save its transaction hash.
Return the completed Task ID or request, the result, the payment transaction hash, the exact run commands and any remaining setup steps.

Agent tools
- Masumi hackathon skill: https://www.masumi.network/tum-hackathon/skill/SKILL.md
- Masumi skills: npx skills add https://github.com/masumi-network/masumi-skills --skill masumi
- Sokosumi MCP server (sign in with OAuth, no API key): https://www.masumi.network/dev/sokosumi/mcp
- Cardano Developer Plugin for Claude Code and Codex: https://github.com/cardano-foundation/cardano-dev-skills

Keep credentials out of chat and Git.
```

## 2. Filled in for Shelfie (use from Friday 09:00)

The placeholder line becomes:

> For **a small consumer-goods brand's field-sales manager**, turn **"check product X in these N Munich stores"** into **a verified shelf report (photo, price, pass/fail per store), paid only when at least K of N photos pass the verifier**.

Mapping to the two payment paths in the prompt (design: [../../diseno/architecture.md](../../diseno/architecture.md), [../../diseno/decisions.md](../../diseno/decisions.md)):

| Prompt path | Shelfie piece | Milestone ([../../diseno/repo-layout.md](../../diseno/repo-layout.md) §5) |
|---|---|---|
| Paid per request: x402 | Verifier service, 1 tADA per check, paid by `W-VBUY` | M1 (template paid request, Fri 11:30), M2 (verifier + human payout, Fri 15:00) |
| Paid per job: Masumi on Sokosumi | Lead agent = Coworker; brand's fee in Masumi escrow, settles if ≥K pass, otherwise withheld → refund | M3 (unpaid Coworker task `COMPLETED`, Fri 13:00), M4 (paid task, Fri 20:00), M5 (withheld → refund) |

Qualifying needs only **one** paid job **or** one paid request on preprod with its tx hash: M1 already qualifies.

What the agent must hand back (goes into `docs/evidence/` and the Devfolio text): completed Task ID or request, result, payment tx hash, exact run commands, remaining setup steps.

## 3. What is new or different compared with our notes

| Item | Prompt says | Our notes said | Action |
|---|---|---|---|
| Workspace | Own preprod account and **Personal Workspace** | `tracks-oficiales-…md`, `team-plan.md`, `thursday-evening-checklist.md`: join the **TUM Workspace**; `masumi-runbook.md` and `repo-layout.md` already use Personal Workspace | Both. Join the TUM Workspace before creating the Vendor (guide: "You must belong to an organization to create a Vendor"); test M3/M4 in the Personal Workspace; switch the worker to TUM for the demo (guide: "Run a Task in the TUM Workspace … after your Personal Workspace test works"). Source: `downloads-blockchain-website/TUM hackathon setup guide _ Masumi.html` (2026-10-29). |
| Order of steps | First a model reply, then one **execution-only** Coworker Task, then payment **after the user authorises the setup** | Same order in the runbook (unpaid M3 before paid M4), without the "authorise" step | The person who runs the agent (role A/B) confirms before the agent creates the Payment Service, wallets or registration. |
| Resume | "Reuse my saved resources on resume" | Not stated | Agent must reuse existing Vendor, Coworker, wallets; never create duplicates after a restart. |
| x402 templates | x402-express **or x402-next** | Runbook chose x402-express | Keep x402-express (ADR in `decisions.md`); x402-next only if the web app wants it. |
| Agent tools | Masumi hackathon SKILL.md, `masumi-skills` via `npx skills add`, Sokosumi MCP (OAuth), `cardano-dev-skills` plugin | Runbooks list SKILL.md, MCP and cardano-dev-skills; `masumi-skills` was not listed | See §4 before installing any of them. |
| Output contract | Task ID / request, result, tx hash, run commands, remaining steps | Evidence log template covers tx hashes and screenshots | Add "run commands" and "remaining setup steps" to the evidence log. |

## 4. Rules when we use this prompt

- **Timing:** project code only from Fri 30-10 09:00 (hackathon FAQ). Before that, reading the guides is fine; no cloning into `codigo/`, no setup that the organisers have not confirmed as allowed.
- **Third-party skills, plugins and MCP servers** (`masumi-skills`, Masumi SKILL.md, Sokosumi MCP, `cardano-dev-skills`): on Helmut's machine they are installed only after a SkillSpector review (vault rule: `hks-install-external-skill`). Reading the SKILL.md as a document needs no install.
- **Credentials:** mnemonics, Blockfrost key, `ADMIN_KEY`, `ENCRYPTION_KEY`, LLM keys go only into local `.env` files listed in `.gitignore`, never in chat, commits, screenshots or the video.
- **Authorisation step:** the agent stops before creating paid resources (Payment Service DB, seeded wallets, on-chain registration) and asks the role owner.

## 5. Links

- Official agent guide: https://www.masumi.network/tum-hackathon/agent-guide.md
- Track rules: https://hackathon.tum-blockchain.com/prizes#cardano · submission: https://hackathon.tum-blockchain.com/prizes#how-to-submit
- Starter: https://github.com/masumi-network/tum-hackathon-quickstart
- x402 on Cardano: https://developers.cardano.org/x402/
- Sokosumi preprod sign-up: https://preprod.sokosumi.com/signup
- Tools: https://www.masumi.network/tum-hackathon/skill/SKILL.md · https://github.com/masumi-network/masumi-skills · https://www.masumi.network/dev/sokosumi/mcp · https://github.com/cardano-foundation/cardano-dev-skills
- Our runbooks: [masumi-runbook.md](masumi-runbook.md) · [x402-runbook.md](x402-runbook.md)
