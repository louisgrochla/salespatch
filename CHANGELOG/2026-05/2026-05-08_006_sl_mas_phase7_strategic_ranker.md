# 2026-05-08 — SL-MAS Phase 7: Strategic memory + nightly StrategyRanker

## What changed

**New files**
- `src/memory/strategicStore.ts` — `strategies` table with Wilson 95% CI columns and lifecycle (`new → testing → active → champion → deprecated`). Methods: `upsert`, `getRelevant(vertical, region?)`, `list({vertical, status})`, `setStatus`. Unique key on `(vertical, region, parameters_json)` so each design combination has a single row.
- `src/evaluation/strategyRanker.ts` — `StrategyRanker.runOnce()`. Groups settled (closed/rejected) episodes by `(vertical, hero, palette, cta)` configurable prefixes; computes Wilson 95% CI; upserts strategies; returns promotion deltas. Pure data — no Claude calls.
- `src/jobs/nightlyStrategyRanker.ts` — CLI entry: `tsx src/jobs/nightlyStrategyRanker.ts` for one-shot or scheduled-cron exec.
- `src/tests/strategyRanker.test.ts` — 8 tests: Wilson CI math (4 cases), grouping + close-rate, lifecycle (testing vs deprecated), getRelevant priority, idempotent re-run.

**Modified files**
- `src/index.ts` — instantiates `StrategicStore`, registers as a closeable.
- `src/memory/strategicStore.ts` — first-insert path applies the same transition policy as updates so a fresh row at n=5 lands at `testing`, not `new`.

## Lifecycle policy

```
deprecated  ← n ≥ 20 AND close_rate < 0.15
champion    ← n ≥ 50 AND confidence_lower ≥ 0.40
active      ← n ≥ 20 AND confidence_lower ≥ 0.20
testing     ← n ≥ 5
new         ← otherwise
```

At solo-founder volumes (≤50 demos summer), most cells stay in `testing` — the ranker surfaces candidates the founder can promote manually via `setStatus`. Auto-promotion to `active` and `champion` becomes meaningful in autumn at n≥20 per cell.

## Why

Phase 6 attributed outcomes to agents. Phase 7 attributes them to *design choices* — the unit the dashboard groups by ("trust_blue palette closes at 41%"). This is the data foundation for the Friday dashboard's strategy sidebar (lands in Phase 5 UI) and for Phase 9's dynamic planner reading champion strategies as guidance.

Wilson CI was chosen over the textbook normal approximation because it works at small n — important when many cells have n=3..10 in the summer beta.

## Stack
- TypeScript / better-sqlite3
- Wilson 95% CI binomial proportion (z=1.96)

## Integrations
- Reads from `EpisodicStore.listRecent` (filtering on settled outcomes)
- Writes to new `strategies` table
- `StrategicStore.getRelevant(vertical, region?)` is the read path that downstream phases (8 LLMCritic, 9 Dynamic Planner) will use to inject strategy context into agent prompts

## How to verify
1. `npm run verify` — 292 tests / 291 pass / 1 pre-existing D5 fail. +8 ranker tests.
2. One-shot run:
   ```bash
   DB_PATH=data/sl-mas-smoke-bulk.sqlite tsx src/jobs/nightlyStrategyRanker.ts
   ```
   Returns `{strategies_evaluated, promotions, champions_by_vertical}` JSON.
3. SQL inspection:
   ```sql
   SELECT vertical, parameters_json, sample_size, ROUND(close_rate,2),
          ROUND(confidence_lower,2), ROUND(confidence_upper,2), status
   FROM strategies ORDER BY close_rate DESC NULLS LAST;
   ```

## Known issues / follow-ups
- Engine doesn't yet inject `strategyContext` into `AgentExecutionInput` — that requires the engine to know the lead's vertical at executeNode time, which is buried in upstream artifacts. Will land in Phase 8 (LLMCritic / strategy-aware prompts) where briefGenerator and siteComposer pull strategies themselves via `strategicStore.getRelevant`.
- No nightly cron wiring yet — the script form is invocable but production scheduling is a follow-up (PipelineScheduler addition).
- Same pre-existing `masAudit.test.ts:332` fail. Unrelated.
