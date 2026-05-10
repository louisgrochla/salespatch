# 2026-05-08 — SL-MAS Phase 10: A/B harness + ModelRegistry stubs

## What changed

**New files**
- `src/evaluation/abHarness.ts` — `pickArm(variants, {lead_id, experiment_id}) → AbAssignment`. Deterministic-by-lead-id via `sha256(experiment_id + lead_id)` → 0..999 bucket. Supports weighted variants (default 1:1). Single-variant short-circuit. Re-runs of the same lead always pick the same arm; same lead in a different experiment can flip.
- `src/runtime/modelRegistry.ts` — `ModelRegistry`. Methods: `register({kind, agent_id?, version, source, weights_path?, endpoint?, activate?})`, `getActive(kind, agent_id?)`, `swap(id)`, `list({kind?, agent_id?})`. SQLite-backed (`model_registrations` table). On first construction seeds a default `heuristic-v1` critic so `getActive("critic")` is non-null out of the box.
- `src/missionControl/routes/models.ts` — `GET /api/models?kind=&agent_id=`, `POST /api/models/swap`. Behind bearer auth.
- `src/tests/abHarness.test.ts` — 6 tests: deterministic same-lead-same-arm, ~50/50 spread over 200 leads, weighted (~9:1), experiment-id flips arm, single-variant, zero-variant throws.
- `src/tests/modelRegistry.test.ts` — 5 tests: default seed, register-with-activate, agent-specific overrides global, swap flips slot, unknown id returns undefined.

**Modified files**
- `src/missionControl/server.ts` — added optional `modelRegistry?` constructor param; routed `/api/models*` after decisions.
- `src/index.ts` — instantiated `ModelRegistry`, passed to MissionControlServer.

## Why

Two stubs the production system will consume in autumn 2026:

1. **A/B harness** — once n>20 per arm becomes achievable (autumn), the harness is the lever for split-testing strategies. At summer pace it'll mostly sit idle, but having it in place means flipping a switch (rather than building infrastructure under deadline) when volume catches up.

2. **ModelRegistry** — the deferred LoRA training pipeline (Phase 3+ in the original blueprint, deferred to Q4 2026 in this plan) needs a place to register fine-tuned weights and a way to swap them in without redeploying. ModelRegistry is that surface; today it stores heuristic-v1 and accepts (but doesn't yet route) llm/lora registrations.

**Explicit non-goals:**
- No actual LoRA training script
- No Vast.ai integration
- No CLIP fine-tuning
- No model file storage

The CriticFactory consults ModelRegistry as a future hook; right now CriticFactory routes by `agentRegistry.get(id).critic_implementation` so the registry's swap path is wired but unused.

## Stack
- TypeScript / better-sqlite3
- `crypto.createHash("sha256")` for deterministic bucket assignment

## How to verify
1. `npm run verify` — 322 tests / 321 pass / 1 pre-existing D5 fail. +11 Phase 10 tests.
2. `npx tsx --test src/tests/abHarness.test.ts` — 6 / 6
3. `npx tsx --test src/tests/modelRegistry.test.ts` — 5 / 5
4. Live (with runtime in mission-control mode):
   ```bash
   curl -H 'Authorization: Bearer <token>' http://localhost:4317/api/models
   # → seeded heuristic-v1 critic
   curl -X POST -H 'Authorization: Bearer <token>' \
        -H 'content-type: application/json' \
        -d '{"id":"<id-from-list>"}' \
        http://localhost:4317/api/models/swap
   ```

## Known issues / follow-ups
- CriticFactory does NOT yet consult ModelRegistry on every evaluation. The wiring is one line (`registry.getActive("critic", agent_id)?.source` → impl), held back so this commit ships pure additive behaviour.
- StrategyRanker doesn't segment by ab_assignment yet — `episodes.ab_assignment_json` column not added (would require an additional idempotent migration). Lands when the harness has actual usage.
- Same pre-existing `masAudit.test.ts:332` PASS-PARTIAL still fails. Unrelated.
