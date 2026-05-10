# 2026-05-08 — SL-MAS Phase 1: Outcome bridge

## What changed

**New files**
- `src/learning/outcomeIngest.ts` — `OutcomeIngester` class. Idempotent ingest by `external_id`. Matches by `lead_id` tag, falls back to `business_name + 30-day window`. Calls `decisionStore.recordOutcome` for each match. Persists every payload to a new `outcome_ingest_log` table. Exports `canonicalBody`, `signBody`, `verifySignature` HMAC helpers.
- `src/learning/supabaseOutcomePoller.ts` — 6-hour backstop poller for `lead_assignments.status` flips. Cursor stored in new `kv` table. Maps `sold/rejected/pitched/visited` → outcome types. Default fetcher uses Supabase REST + service role key; injectable for tests.
- `src/missionControl/routes/outcomes.ts` — handler function returning `true` if it served the request. Implements `POST /api/outcomes/ingest` (HMAC-verified) and `GET /api/outcomes/recent`.
- `apps/nerve/src/lib/outcomeRuntime.ts` — fire-and-forget `postOutcomeToRuntime(payload)`. Mirrors the `OutcomeIngestPayload` shape. HMAC-signs the canonical body, 5s abort timeout. Returns false (logs only) on misconfiguration so it can never break the parent webhook.
- `src/tests/outcomeIngest.test.ts` — 5 tests: lead_id matching, idempotency, no-match log row, business_name fallback, HMAC round-trip.

**Modified files**
- `src/learning/decisionStore.ts` — added `listDecisionsByLeadId(leadId, limit?)` (delegates to existing `listDecisionsByTag`).
- `src/missionControl/server.ts` — added optional `outcomeIngester` constructor param; routed `/api/outcomes/*` early in `route()`.
- `src/missionControl/authMiddleware.ts` — added `/api/outcomes/ingest` to `EXEMPT_PATHS`. The route does its own HMAC verification.
- `src/index.ts` — instantiated `OutcomeIngester` and `SupabaseOutcomePoller`; passed ingester to mission control; started poller (skippable via `OUTCOME_POLLER_DISABLED=true`); stopped on shutdown.
- `apps/nerve/src/app/api/ingest/pitch/route.ts` — fire-and-forget `postOutcomeToRuntime(...)` after `embedRecord`; mapping helper translates NERVE's `PitchOutcome` enum to ingest payload shape.

## Why

SL-MAS depends on closing the feedback loop from real pitch outcomes back to agent decisions. Until now, NERVE's `PitchLog` and Supabase's `lead_assignments.status` captured rich pitch outcomes but never reached the runtime — `decisionStore.recordOutcome` existed but had no caller. This phase wires that bridge: every pitch becomes signal that subsequent SL-MAS phases (Critic, Reflection, Strategy Ranker, Attribution Engine) can learn from.

## Stack
- Node.js / TypeScript / better-sqlite3 (runtime)
- Next.js 14 / Prisma (NERVE webhook)
- Native `crypto` for HMAC-SHA256 signing
- Native `fetch` for Supabase REST polling

## Integrations
- NERVE → runtime over HTTP, HMAC-signed body (`OUTCOME_INGEST_SECRET`)
- Supabase REST API → runtime poller (`SUPABASE_SERVICE_ROLE_KEY_READONLY`)

## How to verify
1. `npm run verify` — typecheck + build + test. Expect 247 tests / 246 pass / 1 pre-existing `D5: Self-Evaluation & Reflection` fail (unrelated to this phase).
2. Specific tests: `npx tsx --test src/tests/outcomeIngest.test.ts` — 5/5 pass.
3. Local NERVE → runtime smoke (with `OUTCOME_INGEST_ALLOW_UNSIGNED=true` and `NODE_ENV=development`):
   - Insert a decision with tag `lead_id:test-lead`.
   - `curl -X POST http://localhost:4317/api/outcomes/ingest -H 'content-type: application/json' -d '{"source":"test","external_id":"e1","lead_id":"test-lead","outcome_type":"pitch_closed","result":"positive","occurred_at":"2026-05-08T12:00:00Z"}'`
   - Expect `{"matched_decisions":1,"match_strategy":"lead_id"}`. `GET /api/outcomes/recent` lists it.

## Known issues
- `_decision.lead_id` tag is not yet emitted by any agent — that's Phase 2. Until then, the bridge will fall back to `business_name` matching, or record `match_strategy:none` for unmatched payloads.
- `outcome_ingest_log.episode_id` is wired but always null — `EpisodicStore` lands in Phase 3.
- The NERVE app's local `tsc --noEmit` shows pre-existing errors due to missing `node_modules` (`next/server`, `zod`, `@prisma/client`). Vercel build resolves these. Not introduced by this phase.
- Pre-existing `masAudit.test.ts:332` ("PASS-PARTIAL: pipeline has QA agent") still fails. Will be revisited in later phases when the audit fixtures are touched.
