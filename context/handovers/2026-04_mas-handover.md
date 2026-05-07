# MAS Handover Document — April 2026

> **Purpose:** Complete state dump for the next session picking this up. Read this first.

---

## 1. WHAT THIS PROJECT IS

AI Salesperson Platform — finds local small businesses, generates demo websites for them, and salespeople pitch the demos for £350/site. Three architectures:

1. **Orchestration System** (`src/`) — Multi-agent pipeline (TypeScript, Node.js, SQLite)
2. **Sales Dashboard** (`apps/sales-dashboard/`) — Next.js + Supabase + Stripe Connect
3. **iOS App** (`apps/ios/salesflow/`) — Native SwiftUI salesperson app

The **only active work** is on the orchestration system's outreach pipeline.

---

## 2. CURRENT PIPELINE (what agents exist and what they do)

```
scout → profile → brand-analyse → brand-intelligence → qualify → brief → compose → qa
```

| Agent | File | Purpose | Status |
|-------|------|---------|--------|
| **Lead Scout** | `src/agents/outreach/leadScoutAgent.ts` | Google Places search by vertical + location. Downloads photos, reviews, hours. | Works but needs better verticals |
| **Lead Profiler** | `src/agents/outreach/leadProfilerAgent.ts` | Scrapes website (Playwright), Instagram (Apify), detects tech stack, extracts services | Works |
| **Brand Analyser** | `src/agents/outreach/brandAnalyser.ts` | Extracts colour palette from photos, detects fonts, compiles asset inventory | Works |
| **Brand Intelligence** | `src/agents/outreach/brandIntelligence.ts` | AI analysis of brand tone, personality, USPs, suggested headlines (OpenRouter) | Works |
| **Lead Qualifier** | `src/agents/outreach/leadQualifierAgent.ts` | Scores leads, splits into qualified/rejected | Works but too permissive |
| **Brief Generator** | `src/agents/outreach/briefGenerator.ts` | Creates structured brief (.md) from all scraped data | Has data wiring bug (see §4) |
| **Site Composer** | `src/agents/outreach/siteComposerAgent.ts` | Generates HTML/CSS landing page using AI (OpenRouter vision) | Works but output is generic |
| **Site QA** | `src/agents/outreach/siteQaAgent.ts` | Validates generated HTML | Minimal checks |

### Supporting modules
- **Asset Store** (`src/lib/assetStore.ts`) — Photo storage, quality scoring, vision helpers, colour extraction
- **Design Intelligence** (`src/agents/outreach/designIntelligence.ts` + `design-intelligence/*.csv`) — Industry-specific UI/UX rules from CSV databases (161 rules, 67 styles, 34 landing patterns)
- **AI Composer** (`src/agents/outreach/aiComposer.ts`) — Sends up to 7 photos as base64 vision blocks to Claude via OpenRouter

---

## 3. KNOWN BUGS & CRITICAL ISSUES

### 3.1 — Scheduler burned £225 in Google Places API credits

**What happened:** A previous Claude session added a pipeline scheduler (`src/pipeline/scheduler.ts`) that auto-triggers pipeline runs. It defaulted to `SCHEDULER_MODE=internal` which ticks every 60 seconds. Combined with `Restart=always` in the systemd service, the Pi ran the scout pipeline hundreds of times over ~5 days, making **46,263 API calls**.

**Fix applied:** Changed default `SCHEDULER_MODE` from `"internal"` to `"disabled"` in `src/index.ts:273`. Added `"disabled"`, `"off"`, `"none"` as valid modes. Pi's `runtime.env` now has `SCHEDULER_MODE=disabled`.

**Still needed:** The code in `engine.ts:25` still creates the `lead-generation-v1` definition with `schedule_rrule: "FREQ=DAILY;INTERVAL=1"`. This should be removed or set to empty string so even if the scheduler is accidentally re-enabled, it won't auto-fire.

### 3.2 — Brief generator doesn't receive qualified leads

**What happened:** The qualifier outputs `{ qualified: [...], rejected: [...] }` but the brief generator at line 801 looks for `nodeOutput.profiles`. There's a mismatch between the qualifier's output format and what the brief expects.

**Partial fix applied:** Added fallback to read `qualified` field in `briefGenerator.ts:801`. **Not yet tested end-to-end.**

### 3.3 — Pipeline definition split causes wiring issues

There are **two** pipeline definitions in code:
- `lead-generation-v1` (engine.ts:20) — scout → profile → brand-analyse → brand-intelligence → qualify → assign
- `site-generation-v1` (engine.ts:63) — brief → compose → qa

But on the Pi's database, there's a **third version** where ALL nodes are in one `lead-generation-v1` definition (from an older code version). The brief node depends on `["qualify", "brand-intelligence"]` which only works if they're in the same pipeline run.

**This is the root cause of the retry failures** — the retry mechanism couldn't get brand-intelligence to show as "completed" because of state corruption from mixing old/new definitions.

### 3.4 — Node status corruption after service restart

When the Pi service restarts mid-pipeline (SIGTERM during execution), nodes that were "running" stay stuck. The crash recovery in `engine.ts:87` (`recoverStaleRuns`) marks entire runs as failed, but individual node statuses aren't cleaned up. This makes retries unreliable.

---

## 4. WHAT'S WRONG WITH LEAD QUALITY

### 4.1 — Qualifier is too permissive
- Black Sheep Coffee (71K Instagram followers, national chain) passed qualification
- Chain detection is a hardcoded keyword list (`leadScoutAgent.ts:46`)
- No follower count check, no "number of locations" check
- No existing website quality threshold — businesses with good sites still pass

### 4.2 — Verticals are too narrow
Currently hardcoded to: `["restaurant", "cafe", "barber", "salon", "bakery", "pub"]`

Missing high-value targets:
- **Trades:** plumber, electrician, roofer, locksmith, painter, gardener, builder
- **Health:** dentist, physio, chiropractor, optician, vet
- **Automotive:** garage, MOT centre, car wash, tyre shop
- **Retail:** florist, pet shop, dry cleaner, tailor, gift shop
- **Services:** accountant, solicitor, estate agent, tutor, photographer

### 4.3 — Chain detection is primitive
`isChain()` at `leadScoutAgent.ts:46` checks a hardcoded list of brand names. Should instead check:
- Instagram follower count > 10K
- Multiple locations (Google Places "chain" signal)
- Website has franchise/location-finder pages
- Companies House shows multiple subsidiaries

---

## 5. WHAT'S WRONG WITH DEMO GENERATION

### 5.1 — Output is generic / "template-looking"
Despite sending 7 photos + brand data + design intelligence rules, the AI composer produces safe, dark, monotone layouts. All sections end up with `rgba(0,0,0,0)` backgrounds. The model plays it safe with a single long prompt + images + 16K token budget.

### 5.2 — No isolated testing environment
The only way to test the composer is to run the full pipeline (10+ minutes). There's no way to:
- Pick a single lead
- Tweak the prompt
- Generate a site
- Preview it side-by-side
- Iterate quickly

**This is the #1 blocker.** The user identified this clearly: "I haven't had a visual place to train and test them isolated, without needing a full pipeline."

### 5.3 — Proposed but not built: Composer Workbench
A local web UI that:
- Lists qualified leads from the DB
- Shows their scraped data, photos, brand analysis
- Lets you adjust composer settings (prompt, temperature, model, max tokens)
- Generates a site on button click
- Previews the HTML inline
- Supports rapid iteration (20 attempts/hour vs 2)

---

## 6. DEAD CODE IN THE CODEBASE

The following has **no bearing on the outreach use case** and can be safely removed:

| What | Where | Notes |
|------|-------|-------|
| Content automation pipeline | `content-automation-default` definition in DB | trend-scout, script-write, media-generate, publisher agents — never implemented |
| Social media post dispatch | `src/pipeline/postDispatch.ts` | Webhook adapter for TikTok/Reels/Shorts |
| Post queue table | `post_queue` in DB | Never populated |
| Media jobs table | `media_jobs` in DB | Higgsfield image gen — never used |
| Learning/episodes system | `decisions`, `episodes`, `learning_insights`, `outcomes`, `events` tables | Passive logging, no reflection loop |
| Source registry | `source_registry` table | RSS/API sources — never populated |
| Telegram bot | `TELEGRAM_BOT_TOKEN` in env | Notification channel — not needed for outreach |
| Voice/telephony | `src/telephony/`, `src/caller/` | Twilio integration for voice calls |
| OpenClaw protocol | `src/openclaw/` | Raspberry Pi voice adapter |
| Legacy orchestrator | `src/orchestrator/orchestrator.ts` | Replaced by pipeline engine |
| Side effects tracker | `src/sideEffects/` | Orchestrator-only feature |
| ClawDeck compat | `mc_workspaces`, `mc_agents`, `mc_tasks`, `mc_events` tables | Dashboard compatibility layer |
| Spend ledger | `spend_ledger` table | Framework exists, nothing writes to it |
| Reports | `src/reports/` | Skeleton, not used |

---

## 7. API KEYS & DEPLOYMENT

### Keys (on Pi at `/home/openclaw/.config/openclaw/runtime.env`)
```
OPENROUTER_API_KEY=<REDACTED — see Pi runtime.env or 1Password>
GOOGLE_PLACES_API_KEY=<REDACTED — see Pi runtime.env or 1Password>
APIFY_API_TOKEN=<REDACTED — see Pi runtime.env or 1Password>
SCHEDULER_MODE=disabled
```

**User's OpenRouter key (for local testing):** `<REDACTED — see local .env or 1Password>`

> **Note:** The keys originally documented inline in this handover have been
> rotated. Look up current values from the Pi's `runtime.env`, your local `.env`,
> or your password manager. Never paste live keys back into committed files.

### Google Places API
- **Budget:** User set a £5 spend cap in Google Cloud Console (Billing → Budgets)
- **Free trial:** £225.29 credit expired 13 April 2026 (fully consumed by scheduler bug)
- **Current billing:** Pay-as-you-go with budget cap
- **Key restrictions:** 33 APIs allowed, NO IP restriction (should add)

### Deployment Target
- Raspberry Pi 400, user `openclaw`, repo at `/home/openclaw/klaude-repo`
- Tailscale IP: `100.93.24.14`
- Core runtime: port 4317 (systemd: `core-runtime.service`)
- Mission Control: port 3001 (systemd: `mission-control-next.service`)
- `Restart=always`, `RestartSec=5` — will auto-restart on crash

### GitHub
- Repo: `AviiDeveloper/klaude-repo` — **PUBLIC** (no secrets committed, but be careful)
- Git workflow: feature branches, never work on main

---

## 8. CURRENT STATE OF THE ABERDEEN RUN

Pipeline run `5258d851-d794-4d46-95f1-6fc2a1408fff` on the Pi:

| Node | Status | Notes |
|------|--------|-------|
| scout | completed | 18 leads found in Aberdeen |
| profile | completed | 8 businesses with Instagram data |
| brand-analyse | completed | Colour palettes extracted |
| brand-intelligence | stuck at "running" | Actually completed (artifacts exist, 299KB), node status corrupted by restart |
| qualify | completed | 3 qualified, 15 rejected |
| brief | completed | **Empty output** (41 bytes = `{"briefs":[],"profiles":[],"analyses":[]}`) — data wiring bug |
| compose | completed | **Empty output** (32 bytes) — no briefs to compose |
| qa | completed | **Empty output** — nothing to QA |

### Instagram data scraped for Aberdeen leads:
- Wild Goose (@wildgooseabz) — 7,702 followers, 9 posts saved
- Glenhouse Aberdeen (@glenhouse_aberdeen) — 2,077 followers
- Black Sheep Coffee (@black_sheep_coffee) — 71,657 followers (**chain, should be rejected**)
- Turquoise Cafe (@cafe.turquoise.aberdeen) — 3,118 followers
- Native Barbers (@native_barbers.nb) — 2,035 followers
- Prime Beauty Lounge (@pblaberdeen) — 617 followers
- Cake Box (@cakeboxuk) — 46,993 followers (**chain, should be rejected**)

### 3 qualified leads (need to check which ones):
Available in `agent_task_artifacts` table, node_id='qualify', run_id='5258d851...'

---

## 9. RECOMMENDED PRIORITY ORDER

1. **Build composer workbench** — Local web UI to iterate on demo quality without running the full pipeline. Pick a lead → adjust settings → generate → preview → repeat. This unblocks everything else.

2. **Fix qualifier** — Add hard rules: max IG followers (e.g., <15K), chain detection via multiple signals, website quality threshold (reject if score > 70), minimum Google reviews.

3. **Expand verticals** — Add trades, health, automotive, retail, services. Easy config change.

4. **Simplify pipeline** — Replace the engine/scheduler/node-status machinery with a single `run-pipeline.ts` script. Scout → profile → analyse → qualify → brief → compose → qa. Plain async/await, no state machines.

5. **Clean up dead code** — Remove content automation, social media, telephony, learning system, ClawDeck compat.

---

## 10. KEY FILES REFERENCE

| What | Path |
|------|------|
| Runtime entry point | `src/index.ts` |
| Pipeline engine | `src/pipeline/engine.ts` |
| Pipeline scheduler | `src/pipeline/scheduler.ts` |
| Pipeline DB store | `src/pipeline/sqlitePipelineStore.ts` |
| All outreach agents | `src/agents/outreach/*.ts` |
| AI composer (vision) | `src/agents/outreach/aiComposer.ts` |
| Design intelligence | `src/agents/outreach/designIntelligence.ts` |
| Design CSV rules | `src/agents/outreach/design-intelligence/*.csv` |
| Asset store | `src/lib/assetStore.ts` |
| Mission Control API | `src/missionControl/server.ts` |
| MC Next.js app | `apps/mission-control/` |
| Pi deploy script | `scripts/pi/mc-push-pi.sh` |
| Pi runtime env | `/home/openclaw/.config/openclaw/runtime.env` |
| Pi systemd service | `~/.config/systemd/user/core-runtime.service` |
| Demo generator | `src/tools/generate-demos-from-db.ts` |
| Project instructions | `CLAUDE.md` |
| This handover | `HANDOVER.md` |

---

## 11. USER CONTEXT

- First large project, learns as they go
- Jumps between apps by interest
- Wants to see working results, not theoretical architecture
- Burned by the scheduler incident — cost sensitivity is high
- Wants the demo sites to look like £3,000 custom builds, not templates
- Has not yet made a single real sale — needs the pipeline to produce something sellable first
- Prefers one bundled PR over many small ones for refactors

---

*Generated 13 April 2026. This document supersedes SL-MAS-HANDOVER.md for current state.*
