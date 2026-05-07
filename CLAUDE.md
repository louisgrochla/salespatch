# CLAUDE.md — Project Instructions for Claude Code

## Project Overview
AI Salesperson Platform — a gig-economy system that recruits salespeople to sell
AI-generated websites to local small businesses. The repo is a monorepo containing
the orchestration runtime, six apps, shared knowledge, and operational tooling.

## Apps and Roles

| Path | Stack | Port | Role |
|---|---|---|---|
| `src/` (root) | TypeScript, Node.js, SQLite | 4317 | OpenClaw multi-agent orchestration runtime — outreach pipeline (scout → profile → brand-analyse → brand-intelligence → qualify → brief → compose → qa) |
| `apps/mission-control/` | Next.js 14, tsx | 3000 | Operator dashboard for the agent pipeline. Deployed to Pi. |
| `apps/sales-dashboard/` | Next.js 14, Supabase, Stripe Connect, Radix UI | 4300 | Public salesperson dashboard. Deployed to Vercel. |
| `apps/admin-panel/` | Next.js 14, better-sqlite3 | 4400 | Admin / back-office UI |
| `apps/nerve/` | Next.js 14, Prisma | 4400 | NERVE app — session changelog ingest, decision logging |
| `apps/mobile-api/` | Express, tsx, better-sqlite3 | 4350 | Backend API for iOS / mobile apps |
| `apps/mobile/` | Expo / React Native | — | Salesperson mobile app (Expo) |
| `apps/ios/SalesFlow/` | Native SwiftUI Xcode project | — | iOS salesperson app — talks to mobile-api |
| `tools/workbench/` | tsx + static frontend | 3456 | Composer Workbench — local UI to iterate on demo site quality |

**Protected apps** (consult business-brain MCP / `knowledge/` before editing):
`apps/sales-dashboard/`, `apps/admin-panel/`, `apps/ios/`, `apps/mobile-api/`,
`apps/mobile/`, `apps/mission-control/`. The `scripts/kb-lookup.sh` PreToolUse hook
auto-injects relevant knowledge files when editing these — but for cross-app design
work, query the `business-brain` MCP server explicitly.

## Cross-App Contracts

All shared contracts live in `knowledge/` and are served by the **business-brain MCP**
(configured in `.mcp.json`, points at `./knowledge`). Before changing anything that
crosses an app boundary, read the relevant note:

- `knowledge/contracts/api-surface.md` — endpoints exposed by mobile-api and consumed
  by ios / mobile
- `knowledge/contracts/auth-contract.md` — token format and session rules across
  sales-dashboard, mobile-api, and ios
- `knowledge/contracts/database-architecture.md` — SQLite + Supabase split, who
  writes where
- `knowledge/contracts/shared-enums.md` — canonical enum values (statuses, etc.)
- `knowledge/entities/entity-{lead,salesperson,demo-link,training}.md` — canonical
  field definitions

If you change a contract, update the corresponding knowledge note in the same commit.

## Hard Rules
- Do not introduce new services or components not in SPEC.md without an ADR entry
- Do not perform side effects without approval token logic
- Do not store secrets in prompts, logs, or committed files
- Do not expand agent scope beyond their contracts in AGENTS/AGENT_CONTRACTS.md
- Prefer editing existing files over creating new ones
- Do not touch `.claude/worktrees/nice-kare-edfa44/` — it is a live TestFlight beta
  with real beta testers running against it

## Git Workflow — MUST FOLLOW
- **Never work directly on main.** Main is the stable base.
- **Before starting any non-trivial task, run `git log --oneline -10`** to see what
  has recently changed. If anything in that list looks like it overlaps with what
  you're about to do, stop and ask the user before continuing — there is a real
  history of conflicting changes shipped in parallel sessions.
- **Create a feature branch from main** for every task: `feat/`, `fix/`, `chore/`
- **Use worktrees** for parallel sessions — say "use a worktree" to get isolation
- **Commit after each logical change** — do not batch commits at the end
- Small, focused commits — one concern per commit
- No mixed-scope commits
- Run `npm run verify` before committing when source changes are involved
- When done, the user will review and merge to main

## Source of Truth (read in this order)
1. `SPEC.md` — master specification
2. `CONSTRAINTS.md` — hard limits
3. `OPENCLAW/*` — interface contracts and security
4. `GOVERNANCE/*` — change policy, trace schema, prompt rules
5. `AGENTS/*` — agent contracts and capabilities
6. `OPERATIONS/*` — deployment and observability
7. `ADR/*` — architecture decision records
8. `knowledge/` — cross-app contracts and entity definitions (via business-brain MCP)

## Changelog Convention
For implementation changes, create a changelog entry:
```
CHANGELOG/YYYY-MM/YYYY-MM-DD_NNN_<shortname>.md
```
- NNN = 3-digit daily sequence number
- Keep existing .json changelog entries; new entries only need .md

## Change Log Requirement
Every completed change MUST be logged in a `.md` file under `CHANGELOG/YYYY-MM/`
before the task is considered done. Each log entry must include:
- **What changed** — files created, modified, or deleted
- **Why** — the purpose / user request that triggered it
- **Stack** — technologies, libraries, frameworks involved
- **Integrations** — external services or systems touched
- **How to verify** — how to confirm the change works
- **Known issues** — any caveats, pre-existing failures, or limitations

## Decision Log — DECISIONS.md
Append to root `DECISIONS.md` whenever a non-obvious choice is made — particularly
when something was *tried and failed*, or when an alternative was considered and
rejected. This is the file-based replacement for "I remember we tried X in some
old conversation." Future sessions read this on load. See `DECISIONS.md` for the
entry format.

When to append:
- A debugging session uncovered a non-obvious cause
- A library / approach was tried and dropped
- A constraint or gotcha turned out to matter that wasn't in the docs
- A design choice was made between two reasonable alternatives

When *not* to append: routine implementation, things already obvious from the diff.

## Decision Journal (personal, more detailed)
After completing a coding task, write a decision journal entry to
`~/Desktop/klaude-vault/journal/`. Filename: `YYYY-MM-DD_<short-slug>.md`.
This is **personal and not committed** — DECISIONS.md is the team-facing log,
the journal is for deeper write-ups, patterns, and concept notes.

Adapt detail to complexity:

**Simple changes** (5-10 lines): `What + How + Pattern reference`

**Complex changes** (20-50 lines):
`What + How-it-works + Why-this-approach + Alternatives-considered + Patterns-used + Connections`

Build up over time:
- `~/Desktop/klaude-vault/patterns/` — reusable code patterns (db helpers, auth middleware)
- `~/Desktop/klaude-vault/concepts/` — technical concepts in plain English
- `~/Desktop/klaude-vault/maps/` — how systems connect across apps

Use `[[wikilinks]]` to cross-reference between entries.

## Finishing a Task — `/finish`
When a task feels complete, run the `/finish` slash command. It will:
1. Show a diff summary since the last commit
2. Propose a commit message in the project's style
3. Prompt to append a `DECISIONS.md` entry if the work involved a non-obvious choice
4. Commit
5. Suggest `/clear` if the task is fully done

Run `/finish` before switching topics. It exists so that context doesn't bleed
between unrelated tasks.

## Deploy After Every Change
Every change MUST be deployed to the Pi and verified working via Tailscale before
the task is marked complete. The workflow is:
1. Build locally (`npm run mc:build` and/or `npm run build`)
2. Deploy to Pi using the correct worktree source:
   ```bash
   LOCAL_REPO="<worktree-path>" PI_HOST="openclaw@100.93.24.14" bash scripts/pi/mc-push-pi.sh
   LOCAL_REPO="<worktree-path>" PI_HOST="openclaw@100.93.24.14" bash scripts/pi/runtime-push-pi.sh
   ```
3. Verify the service is running on Pi (`systemctl --user status`)
4. Verify the change works at `http://100.93.24.14:3001` (MC) or
   `http://100.93.24.14:4317` (runtime)

If deployment fails, fix the issue before moving on. The user expects to open the
Tailscale URL and see the change working.

## Key Commands
```bash
npm run verify          # typecheck + build + test
npm run dev             # local runtime (port 4317)
npm run mc:dev          # Next.js Mission Control (port 3000)
npm run mc:dev:safe     # Mission Control localhost-only
npm run mc:build        # build Mission Control
npm run mc:push:pi      # deploy to Pi 400
```

## Deployment Target
- Raspberry Pi 400, user `openclaw`, repo at `/home/openclaw/klaude-repo`
- Tailscale for remote access
- Sales Dashboard deployed to Vercel
- `scripts/pi/mc-push-pi.sh` handles rsync + build + systemd restart
