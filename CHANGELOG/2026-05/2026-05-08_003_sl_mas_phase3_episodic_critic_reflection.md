# 2026-05-08 — SL-MAS Phase 3: Episodic memory + HeuristicCritic + ReflectionLoop

## What changed

**New files**
- `src/memory/episodicStore.ts` — `EpisodicStore` class. New `episodes` table with one row per pipeline run: critic_scores, agent_outputs_summary, working_memory_snapshot, strategies_used, pivot_tags. Methods: `start`, `recordNodeScore`, `recordAgentSummary`, `incrementReflectionIterations`, `addCost`, `completeRun`, `attachOutcome`, `getByPipelineRun`, `getByLeadId`, `listRecent`, `pivotByTags`. Indexes on lead_id, pitch_outcome, vertical.
- `src/evaluation/heuristicCritic.ts` — `CriticModel` interface + `HeuristicCritic` impl. 11 rules grade site-composer-agent outputs (HTML present, title, hero contains business name, brand source non-default, reviews surfaced, tel/booking link, gallery, map, brief used, file size < 500KB, no placeholders). Score capped at 0.4 when placeholders/lorem ipsum present. Other agents return 0.5 / "uncertain".
- `src/evaluation/reflectionLoop.ts` — `ReflectionLoop`. Wraps a handler; if the agent is enabled and the score is < threshold, retries with `critiqueFeedback` injected. Stops at maxRetries; returns the highest-scoring output. Records score + iteration count to an optional sink.
- `src/tests/episodicStore.test.ts` — 5 tests: round-trip, scores, completeRun pivot tags, attachOutcome, pivot table close-rate calc.
- `src/tests/heuristicCritic.test.ts` — 5 tests: well-formed scores high, placeholders cap at 0.4, neutral for non-composer, hard fail on empty, mixed worst-dominates.
- `src/tests/reflectionLoop.test.ts` — 5 tests: bypass for non-enabled, accept first try, retry with critique, exhausted budget returns best, score sink reports.

**Modified files**
- `src/pipeline/engine.ts` — constructor accepts optional `episodicStore`, `reflectionLoop`, `decisionStore`. `executeRun` starts an episode; `executeNode` routes the wrapped handler through the reflection loop when the agent is enabled (preserves `withLearning` ordering — reflection wraps the learning-wrapped handler so each retry produces its own decision row); `finalizeRun` derives pivot tags from `decisionStore.listDecisionsByRun(runId)` and persists them onto the episode. New helper `completeEpisode(runId, status)` fires on completed/failed/blocked.
- `src/learning/outcomeIngest.ts` — constructor takes optional `episodicStore`. After matching decisions, attaches the outcome to each unique run's episode and stamps `outcome_ingest_log.episode_id` for audit.
- `src/index.ts` — instantiated `EpisodicStore`, `HeuristicCritic`, `ReflectionLoop`; passed all three to `PipelineEngine`. Reflection enabled-set defaults to `site-composer-agent` only, env-overridable via `CRITIC_ENABLED_AGENTS`.

## Why

Phase 1 connected outcomes; Phase 2 made decisions queryable per-lead. This phase delivers the missing per-run history surface (`episodes`) and the first quality gate (`HeuristicCritic` + `ReflectionLoop`). Without episodes, the Friday dashboard has no read-model. Without a critic, every site-composer output passes through regardless of quality, and the reflection retry that subsequent phases will exercise has nowhere to live.

The HeuristicCritic is rule-based and free; LLMCritic (Claude evaluating screenshots) lands in Phase 8 once site-composer's outputs are reliable enough to be worth more expensive grading.

## Stack
- Node.js / TypeScript / better-sqlite3
- Native `node:test` for unit tests

## Integrations
- Bridges `decisionStore.listDecisionsByRun` → `episodes.pivot_tags` via PipelineEngine.completeEpisode
- Bridges `OutcomeIngester.ingest` → `episodicStore.attachOutcome`

## Configuration
```
CRITIC_THRESHOLD=0.7        # default
CRITIC_MAX_RETRIES=1        # cost discipline for the summer
CRITIC_ENABLED_AGENTS=site-composer-agent
```

## How to verify
1. `npm run verify` — 270 tests / 269 pass / 1 pre-existing `D5: Self-Evaluation & Reflection` fail (PASS-PARTIAL audit fixture, predates this phase). +15 tests vs pre-Phase-3.
2. Specific tests:
   - `npx tsx --test src/tests/episodicStore.test.ts` — 5 / 5
   - `npx tsx --test src/tests/heuristicCritic.test.ts` — 5 / 5
   - `npx tsx --test src/tests/reflectionLoop.test.ts` — 5 / 5
3. End-to-end smoke (with the runtime running):
   - Trigger `lead-generation-v1` via `POST /api/jobs/lead-generation-v1/run`.
   - Open `data/mvp.sqlite`: a new `episodes` row exists with `critic_scores`, `pivot_tags` populated.
   - POST a positive outcome via `/api/outcomes/ingest`; the episode's `pitch_outcome` updates.

## Known issues
- HeuristicCritic only grades `site-composer-agent`. brief-generator + qa critic rules land later (small follow-up).
- The composer agent itself doesn't yet read `input.critiqueFeedback?.critique.specific_suggestions` — the loop currently retries with the same input. Wiring the feedback into the AI prompt is a small follow-up; until then, retries produce stochastically-varied outputs which still helps when the bad output was a tail-event.
- Same pre-existing `masAudit.test.ts:332` failure (PASS-PARTIAL) carries over.
