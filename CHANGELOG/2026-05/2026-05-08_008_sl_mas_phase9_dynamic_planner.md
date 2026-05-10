# 2026-05-08 — SL-MAS Phase 9: Dynamic Planner with failure classification

## What changed

**New files**
- `src/runtime/failureClassifier.ts` — pure rule-based `classify(ctx) → FailureClass`. Six classes: `transient_external | rate_limited | approval_denied | quality_below_threshold | fatal_input | fatal_internal`. Order-sensitive matching: critic-rejected first, then 429s, then approval, then 5xx/timeouts, then validation, then fall through to fatal_internal. Companion `isRetryable(cls): boolean`.
- `src/runtime/dynamicPlanner.ts` — `DynamicPlanner.replan(input) → PlanRevision`. Three-tier dispatch:
  1. Hard cap: aborts when `attempts >= maxReplansPerRun` (default 2).
  2. Registry fast-path: if the failing capability has a `fallback_agent_id` and it's still registered, swap without an API call.
  3. LLM path: send failure + candidates to Claude (Sonnet), expect strict-JSON `PlanRevision`. Validates `newAgentId` against the registry; on parse failure or unknown id, falls back to the offline best guess (cheapest matching capability).
  Three revision kinds: `swap_agent`, `skip_with_fallback`, `abort`.
- `src/tests/failureClassifier.test.ts` — 7 tests covering each class + retry policy.
- `src/tests/dynamicPlanner.test.ts` — 6 tests: registry fallback, budget exhaustion, offline-cheapest-match, no-match abort, well-formed LLM JSON, unknown-id rejection.

**Modified files**
- `src/index.ts` — instantiates `DynamicPlanner(agentRegistry)`. Engine wiring deliberately deferred (see "Known issues") so this commit doesn't change pipeline failure behaviour.

## Why

Today, every node failure either succeeds-on-retry or fails the run. With many summer demos relying on OpenRouter (`brand-intelligence-agent`, `brief-generator-agent`, `site-composer-agent`), one transient 503 can lose a lead. The Dynamic Planner adds a controlled second-chance:

- Classifier separates "retryable infra blip" from "fatal upstream bug" so the system stops blindly retrying validation errors.
- Planner picks a *different* agent with matching capability when the original is failing repeatedly. Capability-driven replacement is the long-term lever; today it primarily exercises the `fallback_agent_id` path.

The handover doc was vague on the planner's actual contract. This phase pins it down: it can swap an agent on a single node, or abort. It does NOT change DAG topology — multi-step plan rewriting is deferred until autumn 2026 when failure signal at scale justifies it.

## Stack
- TypeScript pure functions for the classifier (zero deps)
- OpenRouter / Claude for the LLM path
- Native `fetch` with abort timeout (default 20s)

## Configuration
```
PLANNER_MODEL=anthropic/claude-sonnet-4
PLANNER_TIMEOUT_MS=20000
REPLAN_MAX_ATTEMPTS=2          # hard cap per run
OPENROUTER_API_KEY=sk-or-v1-... # required for LLM path; offline mode otherwise
```

## How to verify
1. `npm run verify` — 311 tests / 310 pass / 1 pre-existing D5 fail. +13 tests vs Phase 8.
2. `npx tsx --test src/tests/failureClassifier.test.ts` — 7 / 7
3. `npx tsx --test src/tests/dynamicPlanner.test.ts` — 6 / 6 (mocked fetcher)

## Known issues / follow-ups

- **Engine integration not wired yet (Phase 9.5).** `PipelineEngine.executeNode`'s catch block today increments `attempts` and either retries or fails. The next-step integration:
  ```typescript
  // pseudo
  catch (err) {
    if (this.dynamicPlanner) {
      const cls = classify({ error: err, agentId, capability, attempts });
      if (isRetryable(cls)) {
        const rev = await this.dynamicPlanner.replan({ ... });
        if (rev.kind === "swap_agent") {
          // mutate node.agent_id, re-enter the retry loop
        }
      }
    }
  }
  ```
  Held back so this commit ships standalone-testable modules without touching the hot path. Will land as a small follow-up commit once we want it active in production.

- `quality_below_threshold` short-circuit relies on the engine passing `lastCriticScore` into the classifier — also part of the deferred wiring. Today the reflection loop owns quality retries directly.

- Same pre-existing `masAudit.test.ts:332` (PASS-PARTIAL) still fails. Unrelated.
