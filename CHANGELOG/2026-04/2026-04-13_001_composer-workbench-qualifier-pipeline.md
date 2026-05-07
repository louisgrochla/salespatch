# 2026-04-13 — Composer Workbench, Qualifier Fix, Pipeline Simplification

## What changed

### New: Composer Workbench (`tools/workbench/`)
- Standalone web server (port 3456) for iterating on demo site quality
- Reads enriched lead data from pipeline's SQLite database
- Pick any lead, see their photos/brand data/IG info
- Adjust composer settings (model, temperature, max tokens, photo selection)
- Generate HTML via AI and preview side-by-side with business photos
- Save good outputs, copy HTML, open in new tab
- 498 leads loaded from Pi database

### Fixed: Qualifier (`src/agents/outreach/leadQualifierAgent.ts`)
- Added hard rejection rules (instant disqualification before scoring):
  - Instagram followers > 10K
  - Known chain database expanded from 33 to 80+ brands
  - Google reviews > 1000
  - Website quality > 70
  - Closed businesses
  - No physical premises (except trades)
- Trades vertical multiplier changed from 0.3 to 0.9
- Added health, automotive, services vertical multipliers

### Fixed: Scout verticals (`src/agents/outreach/leadScoutAgent.ts`)
- Expanded from 16 to 40+ verticals
- Added trades, health, automotive, retail, services categories

### New: Simplified pipeline (`scripts/run-pipeline.ts`)
- Single async/await script replacing the DAG engine for new runs
- CLI: `npx tsx scripts/run-pipeline.ts --location "Aberdeen" --max 5`
- Outputs JSON + HTML files per lead to `data/runs/{timestamp}/`
- No state machines, no scheduler, no node status corruption

### Cleaned: Dead wiring from `src/index.ts`
- Removed telephony, OpenClaw bridge, social media dispatch, realtime broker
- Scheduler now defaults to "disabled" (was "internal" — caused the £225 API burn)
- 143 lines removed from index.ts

## Files created
- `tools/workbench/server.ts`
- `tools/workbench/public/index.html`
- `tools/workbench/public/app.js`
- `tools/workbench/public/styles.css`
- `scripts/run-pipeline.ts`

## Files modified
- `src/agents/outreach/leadQualifierAgent.ts`
- `src/agents/outreach/leadScoutAgent.ts`
- `src/index.ts`

## Stack
- TypeScript, Node.js HTTP server, better-sqlite3, OpenRouter API
- Vanilla HTML/CSS/JS (no framework for workbench UI)

## Integrations
- OpenRouter (Claude Sonnet via API for site generation)
- SQLite (reads pipeline artifacts from mvp-pi.sqlite)

## How to verify
1. Workbench: `OPENROUTER_API_KEY=... npx tsx tools/workbench/server.ts` → http://localhost:3456
2. Pipeline: `npx tsx scripts/run-pipeline.ts --location "Aberdeen" --max 3 --skip-compose`
3. All tests: `npm run verify` — 241/242 passing (1 pre-existing failure)

## Known issues
- Dead code directories (telephony/, openclaw/, sideEffects/) not yet deleted — referenced by tests and MC server types
- Workbench requires mvp-pi.sqlite copied from Pi: `scp openclaw@100.93.24.14:/home/openclaw/klaude-repo/data/mvp.sqlite data/mvp-pi.sqlite`
- Workbench requires photo assets at `~/projects/.assets/` — copy from Pi
