# 2026-05-08 — SL-MAS Phase 2: Decision tagging, manual decisions, agent input contract

## What changed

**New files**
- `src/runtime/types.ts` — placeholder `WorkingMemory`, `StrategyEntry`, `CriticEvaluation` interfaces. Concrete impls land in P3/P4/P7. Defined here so `AgentExecutionInput` can reference them without circular imports.
- `src/missionControl/routes/decisions.ts` — `POST /api/decisions/manual` for the `/build-demo` skill, plus `GET /api/decisions/by-lead?lead_id=...` for the dashboard. Builds structured pivot tags (`lead_id:`, `vertical:`, `hero:`, `palette:`, `cta:`, `proof:`, custom).
- `apps/sales-dashboard/src/app/api/admin/demo-decision/route.ts` — admin-authenticated forwarder that HMAC-signs and POSTs `decision.json` content to the runtime. Same secret as outcome ingest.
- `src/tests/manualDecision.test.ts` — 4 tests: tag construction, timestamped run_id versioning, validation, by-lead query.
- `src/tests/learningAgentDecisions.test.ts` — 4 tests: plural decisions logged per item, singular fallback, bare decision, plural-wins-when-both.

**Modified files**
- `src/pipeline/agentRuntime.ts` — extended `AgentExecutionInput` with optional `workingMemory`, `strategyContext`, `critiqueFeedback` fields. Zero-touch for the 9 outreach agents — they only destructure `upstreamArtifacts` / `config`.
- `src/learning/learningAgent.ts` — `withLearning` now supports `_decisions` (plural array). When present, logs one decision per array item; reads `lead_id` per decision and adds `lead_id:<id>` tag automatically. Singular `_decision` still works for backward compat. Both fields stripped from the returned artifacts.
- `src/agents/outreach/siteComposerAgent.ts` — emits `_decisions` array, one per generated site, tagged with `vertical`, `hero`, `brand_source`, `component_style`, `font_pairing`, plus section flags.
- `src/agents/outreach/siteQaAgent.ts` — emits `_decisions` array per QA result, tagged with `qa_passed`, `qa_score`, `qa_errors`.
- `src/agents/outreach/briefGenerator.ts` — tracks `briefMeta` parallel to briefs, emits `_decisions` tagged with vertical, category, brand source, has_reviews, scraped_services.
- `src/missionControl/server.ts` — added `decisionStore?` constructor param; routed `/api/decisions/*` after outcome ingest.
- `src/index.ts` — passed `decisionStore` to MissionControlServer.

## Why

Phase 1's outcome bridge is useless without something to attribute outcomes to. Until now, the 9 outreach agents emitted at most one decision per pipeline run — meaning a single "barber demo + brief + QA" pipeline run produced 3 decisions tagged only by `agent:`. To correlate "demos with hero=trophy_bar closed at X%", the system needs per-lead decisions with structured pivot tags. This phase delivers that, additively.

The manual `/build-demo` skill is now first-class: each rebuild generates a timestamped decision row that the outcome bridge will match by `lead_id`. Versioning is preserved — building v2 of the same lead doesn't overwrite v1.

## Stack
- TypeScript / Node
- HMAC-SHA256 forwarder pattern (shared with outcome ingest)
- Native node:test + Readable streams for HTTP harness

## Integrations
- sales-dashboard admin → runtime (HMAC-signed forward)
- Skill workflow: `/build-demo` writes `submit/decision.json`; admin uploader will POST it to `/api/admin/demo-decision` (client-side dropzone wiring deferred to a follow-up — UI change requiring browser test)

## How to verify
1. `npm run verify` — 255 tests / 254 pass / 1 pre-existing fail (D5 PASS-PARTIAL, untouched).
2. Specific tests:
   - `npx tsx --test src/tests/manualDecision.test.ts` — 4 / 4
   - `npx tsx --test src/tests/learningAgentDecisions.test.ts` — 4 / 4
3. Smoke (with the runtime in mission-control mode):
   - `curl -X POST http://localhost:4317/api/decisions/manual -H 'content-type: application/json' -d '{"source":"build-demo-skill","agent_id":"manual-build-demo","lead_id":"source-barber","business_name":"Source Barber","vertical":"barber","design_decisions":{"hero_variant":"trophy_bar","palette_family":"heritage_green","cta_pattern":"book_now"}}'`
   - Expect `{"decision_id":"...","run_id":"manual-source-barber-...","tags":[...]}`.
   - `curl 'http://localhost:4317/api/decisions/by-lead?lead_id=source-barber'` returns the decision.

## Known issues
- Client-side admin dropzone integration (read `submit/decision.json` and POST to `/api/admin/demo-decision`) is deferred — the API exists but the existing dropzone in `apps/sales-dashboard/src/app/admin/leads/page.tsx` is unchanged. Manual curl invocation works today.
- The `/build-demo` skill's SKILL.md needs a markdown update to write `decision.json`. That's a docs-only change, not source code; will land in the same commit chain.
- Same pre-existing `masAudit.test.ts:332` ("PASS-PARTIAL: pipeline has QA agent") still fails. Unrelated.
