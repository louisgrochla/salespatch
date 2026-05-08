# 2026-05-08 — SL-MAS Friday Dashboard (Phase 5 constructive half)

## What changed

**New files**
- `src/missionControl/routes/episodes.ts` — three GET endpoints powering the Friday dashboard:
  - `GET /api/episodes/pivot?vertical=&group_by=hero,palette,cta&filter=...`
    Calls `episodicStore.pivotByTags(filters, groupByPrefixes)`. Validates `group_by` against an allowlist of pivot prefixes so the URL can't request arbitrary tag namespaces. `?vertical=barber` is shorthand for `filter=vertical:barber`.
  - `GET /api/episodes/recent?limit=20&vertical=barber` — last N episodes with critic_scores, pivot_tags, outcome.
  - `GET /api/strategies?vertical=&status=` — strategy rows from the nightly ranker.

**Modified files**
- `src/missionControl/server.ts`:
  - Added `EpisodicStore` and `StrategicStore` to constructor dependencies (last two args).
  - Registered the episodes route handler after models route.
  - Added a new `<section>` to the inline HTML dashboard with three panels:
    1. **Friday Dashboard — Strategy Pivot** (full-width): vertical filter + group_by input + table with conditional cell colours (≥50% green, ≥25% amber, <25% red).
    2. **Recent Episodes**: last 50, with composer score and click-to-inspect.
    3. **Active Strategies**: surfaces ranker output with status colour-coding (champion=purple, active=green, testing=blue, deprecated=red).
  - Added three JS functions: `refreshPivot`, `refreshEpisodes`, `refreshStrategies`. Wired into `fullRefresh()` so the dashboard auto-refreshes every 7s alongside the rest of Mission Control. Episodes refresh runs first so the vertical-filter dropdown is populated before pivot/strategies render.
- `src/index.ts` — passes `episodicStore` and `strategicStore` to MissionControlServer.

## Why

The whole 12-commit SL-MAS edifice was invisible until this. Decisions were stored, episodes were rolled up, strategies were ranked — but you'd need `sqlite3` queries to see any of it. This is the founder-facing surface that turns the database into a Friday-afternoon read.

End-to-end smoke against `data/sl-mas-smoke-bulk.sqlite`:
```
GET /api/episodes/pivot?group_by=vertical,hero,palette
→ 7 groups including "barber × trophy_bar × heritage_green: 3/3 (100%)"

GET /api/strategies
→ 5 strategy rows with Wilson CI populated, e.g.
  cafe × team_grid × warm_neutral: n=2, rate=0.50, CI=[0.09, 0.91], status=new

GET /api/episodes/pivot?vertical=barber
→ filtered to 2 barber-only rows
```

## Stack
- TypeScript route handler (mirrors existing pattern in routes/outcomes.ts, routes/decisions.ts)
- Inline HTML/CSS/JS in `MissionControlServer.renderHtml()` — matches existing dashboard style. Bearer auth applies via the existing `authenticateRequest` middleware.

## Verification
1. `npm run verify` — 322 tests / 321 pass / 1 pre-existing D5 fail. (No new tests for the dashboard route — endpoints are thin pass-throughs to already-tested store methods.)
2. End-to-end smoke:
   ```bash
   # 1. Generate fixture data
   npx tsx scripts/sl-mas-smoke-bulk.ts
   # 2. Run nightly ranker against the smoke DB
   DB_PATH=data/sl-mas-smoke-bulk.sqlite tsx src/jobs/nightlyStrategyRanker.ts
   # 3. Boot mission-control against it
   DB_PATH=data/sl-mas-smoke-bulk.sqlite INTERFACE_MODE=mission-control \
     MISSION_CONTROL_PORT=4319 npx tsx src/index.ts
   # 4. Open http://127.0.0.1:4319 — see Friday Dashboard, Recent Episodes,
   #    Active Strategies populated below the existing Mission Control sections.
   ```

## Known issues / follow-ups
- The dashboard's auto-refresh interval is 7s (existing Mission Control default). For SL-MAS panels that's overkill — strategies update at most nightly, pivot only when episodes settle. Switching to a 60s decoupled refresh is a small follow-up.
- Strategies table at solo-founder volumes will mostly show `status=new` (n<5) — that's correct behaviour, not a bug. Manual `setStatus` calls remain the path to promote during summer.
- Same pre-existing `masAudit.test.ts:332` fail unrelated.
