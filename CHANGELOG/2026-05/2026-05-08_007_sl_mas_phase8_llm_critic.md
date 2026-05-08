# 2026-05-08 — SL-MAS Phase 8: LLMCritic + CriticFactory

## What changed

**New files**
- `src/evaluation/llmCritic.ts` — `LLMCritic implements CriticModel`. POSTs to OpenRouter (Claude Sonnet by default), prompts for strict JSON `{score, prediction, strengths, weaknesses, specific_suggestions, confidence}`. Caches by `sha256(agent_id + output_artifacts + model)`. Falls back to neutral 0.5 on API errors / parse failures / missing key — never raises into the pipeline.
- `src/evaluation/criticFactory.ts` — `CriticFactory implements CriticModel`. Dispatches per-agent based on `agentRegistry.get(id).critic_implementation`. Heuristic by default; `llm` opts in. `trained` placeholder logs a warning and falls back to heuristic (Phase 10's ModelRegistry will populate this path later).
- `src/tests/llmCritic.test.ts` — 6 tests with mocked fetcher: well-formed JSON, non-2xx fallback, missing API key, score clamping, parse-error fallback, response cache hit.

**Modified files**
- `src/index.ts` — replaces direct `HeuristicCritic` with `CriticFactory(agentRegistry, { defaultImplementation })`. Honours `CRITIC_IMPLEMENTATION` env (heuristic | llm | trained) and `CRITIC_FORCE_HEURISTIC=true` ops escape hatch.

## Why

Phase 3's HeuristicCritic grades on rules (file size, placeholders, brand colour match). It can't grade *sales-conversion likelihood* — does this site actually look closeable to a UK barbershop owner? That requires judgement.

LLMCritic asks Claude. Cost: ~$0.02-0.05 per call at default Sonnet pricing for ~3KB prompts. With caching, re-running the same site is free. With reflection retries capped at 1 and only `site-composer-agent` participating, peak summer cost is ~£3-5.

The factory pattern means agents opt in individually. brief-generator stays heuristic-only until a brief-grading prompt is written; site-composer can flip to `llm` per-agent without code change.

## Stack
- OpenRouter / Claude (default `anthropic/claude-sonnet-4`, override via `LLM_CRITIC_MODEL`)
- Native `fetch` with abort timeout (default 30s)
- `crypto.createHash("sha256")` for cache keys

## Configuration
```
CRITIC_IMPLEMENTATION=heuristic     # global default; per-agent override on registry
LLM_CRITIC_MODEL=anthropic/claude-sonnet-4
LLM_CRITIC_TIMEOUT_MS=30000
LLM_CRITIC_INPUT_COST_PER_M=3.0     # advisory spend logging
LLM_CRITIC_OUTPUT_COST_PER_M=15.0
OPENROUTER_API_KEY=sk-or-v1-...     # required for llm critic
```

## Per-agent opt-in

Set `critic_implementation: "llm"` on an `AgentCapability` to route that agent's reflection through Claude. Otherwise the heuristic runs (free).

```typescript
{
  id: "site-composer-agent",
  reflection_enabled: true,
  critic_implementation: "llm",  // ← opt in
  ...
}
```

Today's outreach config has no agent on `llm` yet — flip it on once you've watched the heuristic run a few weeks of pitches and want sharper signal.

## How to verify
1. `npm run verify` — 298 tests / 297 pass / 1 pre-existing D5 fail. +6 LLMCritic tests.
2. `npx tsx --test src/tests/llmCritic.test.ts` — 6 / 6 with mocked fetcher.
3. Live test (costs ~$0.05): set `OPENROUTER_API_KEY` and run a pipeline through `lead-generation-v1`; observe reflection score in `episodes.critic_scores`.

## Known issues / follow-ups
- Cost gating is advisory only — the LLM critic logs estimated cost but doesn't enforce a per-day cap. PipelineEngine's existing budget policy applies to `cost_per_run` not critic spend; a separate critic_budget could land later.
- `trained` impl is a placeholder. Phase 10's `ModelRegistry` swap interface will route this path.
- Same pre-existing D5 audit fixture still fails. Unrelated.
