# qa-visual — PR-E NERVE ingest route + Prisma model + backfill

Fifth of the 10 PRs from `qa-visual-IMPLEMENTATION-PLAN.md`. Closes
the "POST currently 404" known issue that's lingered since the v1
spike and unblocks PR-G (cohort baselines), which needs warehouse-
side aggregation across visual-QA runs.

## What changed

- `apps/nerve/prisma/schema.prisma` — new `QaVisualResult` model
  mirroring the `VisualQaResult` TS interface from
  `qa-visual-prompts.ts`. Nullable JSONB columns for each of the six
  gradable layers (`bugs`, `brand_fidelity`, `owner_reaction`,
  `voice_consistency`, `customer_reaction`, `section_grades`) per
  the PR-D partial-result contract. `failed_layers` JSONB array
  documents which layers produced null. Indexed on
  `(lead_id, ran_at DESC)`, `(artefact_id, ran_at DESC)`,
  `has_critical`, and `producer`.
- `apps/nerve/prisma/migrations/22_qa_visual_results/migration.sql`
  — straightforward Postgres DDL. Conventional naming mirrors
  21_bio_cta_type.
- `apps/nerve/src/lib/sl-mas/qaVisualResultStore.ts` — new store
  module mirroring `qaResultStore.ts` pattern. Idempotent `ingest()`
  on `qa_visual_id`. Read helpers: `getById`, `latestForArtefact`,
  `listForLead`, `listWithCritical`. Converter functions translate
  between the Prisma camelCase and the snake_case wire format.
- `apps/nerve/src/app/api/ingest/qa-visual-result/route.ts` — POST
  handler. HMAC verification via the existing `verifySignature` +
  `OUTCOME_INGEST_SECRET` pattern (shared with every SL-MAS ingest
  endpoint). Hand-rolled validator mirrors the Zod schema's hard
  constraints: nullable layer fields, `failed_layers` ↔ nullness
  cross-field invariant, `bug_count`/`has_critical` null iff `bugs`
  null. Producer-side validator runs first; this is belt-and-braces
  at the warehouse boundary.
- `apps/nerve/src/app/api/read/qa-visual/by-lead/route.ts` — GET
  handler. `?lead_id=<slug>&limit=<int>` returns every visual-QA
  run for the lead, newest first. Read endpoints exempt from HMAC
  (founder-session middleware via `(app)` layout).
- `apps/nerve/scripts/qa-visual-backfill.ts` — NEW walker. Iterates
  `~/Desktop/salespatch-demos/*/outputs/qa-visual-result.json`,
  validates each against the canonical Zod schema BEFORE POST, then
  pipes through the standard `post-ingest.sh` helper. Reports
  `inserted` / `skipped_already` / `skipped_invalid` /
  `posted_failed` counts. Idempotent — safe to re-run.
- `apps/nerve/scripts/qa-visual.ts` — no functional change. Existing
  POST step now expects 200 instead of the 404 known-issue caveat
  it was tolerating.
- `~/.claude/commands/build-demo.md` (user-level, not in repo) —
  Step 5 reworked. The "expect 404" caveat is replaced with
  "expect HTTP 200 with the documented response shape". Non-2xx
  cases (401 / 400 / 503) now spelled out with their meaning.

## Why

The visual-QA pipeline has been writing `qa-visual-result.json` to
local disk since PR #93 (v1 spike). The POST to NERVE has been
returning 404 the whole time because the route didn't exist —
documented as a known issue, surfaced once and ignored per the
existing skill text. Result: every visual-QA pass in the cohort is
on local disk only. The warehouse can't answer "do high-visual-QA
demos close better?" because it has no rows.

PR-E closes the loop. Now every visual-QA pass flows into
`qa_visual_results` in the same Vercel Postgres that holds
`qa_results`, `lead_assignment_events`, `pitches`, and the rest.
PR-G (cohort baselines — vertical-level median grades per
dimension) becomes possible because there's data to aggregate.

The nullable-layer / `failed_layers` design from PR-D maps directly
to nullable JSONB columns in Postgres. Downstream queries that
aggregate grades use `WHERE brand_fidelity IS NOT NULL` to exclude
failed-run rows from averages. Queries that want to study *failure
patterns* (which layers fail, on what kinds of demos) can join on
the JSONB `failed_layers` array directly.

## Stack

- Prisma 5.22 + Next.js 14 App Router (existing stack, no new deps)
- Postgres JSONB for layer-payload storage (avoids per-layer
  migrations when prompts evolve — schema changes inside the JSONB
  are owned by the producer-side validator)
- HMAC via existing `verifySignature` helper + `OUTCOME_INGEST_SECRET`
  Vercel env (already deployed for every other ingest endpoint)

## Integrations

- NERVE `/api/ingest/qa-visual-result` POST — accepts the canonical
  `VisualQaResult` JSON from both `qa-visual.ts` (SDK) and the
  manual /build-demo flow.
- NERVE `/api/read/qa-visual/by-lead` GET — feeds the operator UI's
  per-lead history view (UI not in this PR; the endpoint is the
  unblocker).
- `qa-visual-backfill.ts` calls the existing
  `~/.claude/scripts/nerve/post-ingest.sh` helper — no new HMAC
  client code needed.
- Validator-side: producer's Zod check runs first (clear errors at
  the source); the route's hand-rolled validator is a second pass
  at the warehouse boundary. Both implement the same invariants.

## How to verify

1. **Schema + migration:** Prisma schema validates clean
   (`npx prisma validate` against any DB URL). Prisma client
   generates with the new `QaVisualResult` model (423 references in
   `node_modules/.prisma/client/index.d.ts`).

2. **Migration deploy** (production): on next `npx prisma migrate
   deploy` against the Neon DB, table + indexes appear. SQL is
   straight Postgres DDL with no destructive operations.

3. **Type-check:** `npx tsc --noEmit` in `apps/nerve/` and across
   all `apps/nerve/scripts/qa-visual-*.ts` files. Zero errors.

4. **Route smoke-test** (post-deploy):
   ```bash
   ~/.claude/scripts/nerve/post-ingest.sh /api/ingest/qa-visual-result \
     ~/Desktop/salespatch-demos/the-bouquet-bar/outputs/qa-visual-result.json
   ```
   Expect HTTP 200 with `{qa_visual_id, inserted: true, id, has_critical, failed_layers}`.
   Re-run → expect `inserted: false`. Replay-safe.

5. **Backfill** (post-deploy):
   ```bash
   npx tsx apps/nerve/scripts/qa-visual-backfill.ts
   ```
   Walks every demo folder's `qa-visual-result.json`. The Bouquet
   Bar v1 result (pre-PR-C shape) will validate-fail with the
   3-missing-fields message documented in the PR-C CHANGELOG; the
   PR-C-onwards full-shape result lands. Re-runs are no-ops.

6. **Read endpoint** (post-deploy):
   ```bash
   curl 'https://nerve.salespatch.co.uk/api/read/qa-visual/by-lead?lead_id=the-bouquet-bar'
   ```
   Expect `{lead_id, count, rows[]}`. Rows newest-first.

## Known issues

- The Bouquet Bar's existing on-disk `qa-visual-result.json` was
  written by the v1 spike (pre-PR-C). It's missing the three PR-C
  layer fields (`voice_consistency`, `customer_reaction`,
  `section_grades`) and will fail the backfill's pre-validation.
  Documented in the PR-C CHANGELOG already; re-run the visual-QA
  pass to refresh.
- No GET handler for individual `qa_visual_id` lookup yet. The
  store has `getById()` but the operator UI doesn't need it until
  PR-G or later. Easy to add when needed.
- The route doesn't currently validate that `failed_layers` is
  exactly equal (set comparison) to the nullable fields' nullness
  — it checks that each listed name has a null field, and each
  null field is listed, separately. Equivalent semantically; flat
  set comparison would be cleaner. Future cleanup.
- No NERVE `/leads/[id]` UI surface for the new data yet. That's
  intentionally separate from this PR — adding warehouse access
  comes first, surfacing it in the founder dashboard comes when
  PR-G's cohort baselines give operators a useful "this demo vs
  cohort median" frame.
