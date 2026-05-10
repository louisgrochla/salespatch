# 2026-05-08 — SL-MAS Phase 6: AttributionEngine

## What changed

**New files**
- `src/evaluation/attributionEngine.ts` — `AttributionEngine`. Computes per-agent credit/blame from outcome × critic_score. Algorithm:
  - `weight = critic_score × outcome_sign`, clamped -1..1
  - `outcome_sign = +1 / -1 / 0` for positive / negative / neutral
  - `critic_score` defaults to 0.5 when the critic didn't grade that node (most agents today)
  - **Credit:** high-scoring agent on a positive outcome (+w)
  - **Blame:** high-scoring agent on a negative outcome (-w) — "critic was overconfident"
  - **Mild blame:** low-scoring agent on a negative outcome — "critic flagged it; pipeline shipped it anyway"
- `src/tests/attributionEngine.test.ts` — 4 tests: credit on positive, blame on negative, default 0.5 when no critic score, idempotency (already-attributed skipped).

**Modified files**
- `src/learning/decisionStore.ts` — schema unchanged in source, but the `outcomes` table now gains `attribution_weight REAL` and `attribution_reasoning TEXT` columns idempotently via `pragma_table_info` on first AttributionEngine instantiation.
- `src/learning/outcomeIngest.ts` — `OutcomeIngester` constructor takes optional `attributionEngine`. `ingest()` is now async (was sync); after writing outcomes, awaits `attributionEngine.attributePending()`. Failures logged, never raised.
- `src/learning/supabaseOutcomePoller.ts`, `src/missionControl/routes/outcomes.ts` — `await ingester.ingest(...)`.
- `src/index.ts` — instantiates `AttributionEngine`, passes to `OutcomeIngester`.
- `src/tests/outcomeIngest.test.ts` — converted ingest-using tests to async/await.
- `scripts/sl-mas-smoke.ts`, `scripts/sl-mas-smoke-bulk.ts` — await ingest; bulk smoke now prints attribution rollup as a STEP 7.

## Why

Outcomes are recorded; episodes are built; the critic scores composer outputs. Without attribution, those signals can't aggregate into "site-composer-agent on the trust_blue palette has avg_weight 0.4 over n=20" — the Strategy Ranker's input. AttributionEngine is the pipe.

The algorithm is intentionally simple. Phase 7's ranker can refine it (recency decay, per-vertical normalisation), but at solo-founder volumes the weight × sign approach is honest: it matches outcomes to the agent that produced the most-recently-graded artifact.

## Stack
- TypeScript / better-sqlite3
- Idempotent column add via `pragma_table_info`

## Integrations
- Hooks into `OutcomeIngester` so attribution fires after every successful ingest
- Sets up the rollup that `StrategyRanker` (Phase 7) consumes

## How to verify
1. `npm run verify` — 284 tests / 283 pass / 1 pre-existing D5 fail. +4 attribution tests.
2. `npx tsx scripts/sl-mas-smoke-bulk.ts` — STEP 7 prints per-agent rollup with avg_weight, positive/negative counts.
3. SQL inspection:
   ```sql
   SELECT d.agent_id,
          ROUND(AVG(o.attribution_weight), 2) AS avg_weight,
          COUNT(*) AS n
   FROM outcomes o
   JOIN decisions d ON d.id = o.decision_id
   WHERE o.attribution_weight IS NOT NULL
   GROUP BY d.agent_id
   ORDER BY avg_weight DESC;
   ```

## Known issues / follow-ups
- All non-critic agents currently get weight 0.5 × sign — undifferentiated within an agent. Phase 7 will group by *tag combinations* (vertical × hero × palette) to extract design-choice-level attribution from the same data.
- The async `ingest` change is technically a contract break (callers must await). All callers in this repo are updated. Any external caller will need to migrate; flag in DECISIONS.md if/when external callers exist.
- Same pre-existing D5 audit fixture still fails. Unrelated.
