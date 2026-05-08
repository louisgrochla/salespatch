# 2026-05-08 — SL-MAS Phase 4: WorkingMemory + AgentCapabilityRegistry

## What changed

**New files**
- `src/runtime/workingMemory.ts` — `InMemoryWorkingMemory implements WorkingMemory`. Per-run scratchpad with shared/agent-scoped maps + chronological notes. JSON-serialisable `snapshot()` for episode persistence. Static `empty(runId?)` for tests.
- `src/runtime/agentRegistry.ts` — `AgentCapabilityRegistry` decorating `MultiAgentRuntime` with `AgentCapability` metadata. Methods: `register(capability, handler?)`, `setCapability`, `get`, `list`, `findByCapability(requirements)`, `reflectionEnabledIds()`, `isFullyCovered(runtime)`. The registry doesn't replace the runtime — they cooperate.
- `src/tests/workingMemory.test.ts` — 5 tests: round-trip, agent-scope isolation, chronological notes, snapshot JSON-roundtrip, `static empty()`.
- `src/tests/agentRegistry.test.ts` — 5 tests: setCapability, register-with-handler, findByCapability filtering, reflection enabled set for outreach, full coverage check.

**Modified files**
- `src/agents/outreach/index.ts` — declared `OUTREACH_CAPABILITIES` for all 9 agents (lead-scout-agent, lead-profiler-agent, brand-analyser-agent, brand-intelligence-agent, lead-qualifier-agent, lead-assigner-agent, brief-generator-agent, site-composer-agent, site-qa-agent) with capabilities, model_provider, timeout_ms, cost_per_run_estimate_usd, reflection_enabled. Currently only site-composer-agent has `reflection_enabled: true`. `registerOutreachAgents(runtime, registry?)` now optionally records capability metadata.
- `src/pipeline/engine.ts` — engine maintains a `Map<runId, WorkingMemory>`; `getOrCreateWorkingMemory` lazily creates one per run. Each `executeNode` call passes the per-run WorkingMemory through `AgentExecutionInput`. `completeEpisode` snapshots the WM into `episode.working_memory_snapshot` and frees the entry.
- `src/index.ts` — instantiated `AgentCapabilityRegistry`, passed it to `registerOutreachAgents`. Reflection loop's `enabledAgents` defaults to `agentRegistry.reflectionEnabledIds()`; `CRITIC_ENABLED_AGENTS` env override still works for emergencies. Reordered initialization so registry exists before reflection loop.

## Why

Phases 1–3 wired the data flow. Phase 4 wires the architectural plumbing the next phases need:
- **WorkingMemory** is the channel agents use to share context that doesn't fit the DAG (e.g., Scout writes `instagram_followers`, Composer reads it). Today the channel exists; agent-side opt-in is incremental.
- **AgentCapabilityRegistry** centralises "who can do what" so the dynamic planner (Phase 9) can pick replacements by capability rather than hardcoded names, and the critic factory (Phase 8) can route per-agent.

Both components are zero-cost at runtime — Maps and metadata. They make the next phases buildable.

## Stack
- TypeScript / Node native test
- No new external dependencies

## Integrations
- Reflection loop now derives `enabledAgents` from registry (env override preserved)
- Episode `working_memory_snapshot` populated automatically on run completion

## How to verify
1. `npm run verify` — 280 tests / 279 pass / 1 pre-existing `D5` fail. +10 tests vs Phase 3.
2. Specific:
   - `npx tsx --test src/tests/workingMemory.test.ts` — 5 / 5
   - `npx tsx --test src/tests/agentRegistry.test.ts` — 5 / 5
3. Re-run `npx tsx scripts/sl-mas-smoke-bulk.ts` — episodes now carry `working_memory_snapshot_json` (empty `{shared:{},agentScoped:{},notes:[]}` until agents start using the channel).

## Known issues / follow-ups
- **No agent currently writes to WorkingMemory.** The channel is plumbed; usage is incremental. Next step (post-Phase-5): leadProfilerAgent writes `instagram_followers` and `has_review_corpus`; siteComposerAgent reads them to pick a hero variant biased toward social proof when followers > 5000.
- Reflection-enabled set is `{site-composer-agent}` — broadens once brief-generator and site-qa critics land in Phase 8.
- Pre-existing `masAudit.test.ts:332` (PASS-PARTIAL) still fails. Unrelated.

## What this unlocks
- Phase 6 (AttributionEngine) can read `episode.critic_scores` and `episode.working_memory_snapshot` for richer credit/blame.
- Phase 8 (LLMCritic) can opt agents in via `agentRegistry.get(id).critic_implementation`.
- Phase 9 (Dynamic Planner) can replan via `agentRegistry.findByCapability(["html_generation"])` instead of name-matching.
