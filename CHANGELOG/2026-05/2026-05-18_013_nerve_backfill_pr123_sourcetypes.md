# backfill-embeddings — cover SiteBrief / BrandAnalysis / DemoArtefact / QaVisualResult

**Date:** 2026-05-18
**Scope:** Operational follow-up surfaced during the lead-2 (Annie's
Nails) RAG verification. PR #123 wired `embedRecord` into the four new
ingest routes and extended `getLeadSourceIds` to cover them — but the
backfill script (`apps/nerve/prisma/backfill-embeddings.ts`) still only
knew about `PitchLog`. So even after PR #123 shipped, a `npm run
db:backfill-embeddings` after the `OPENAI_API_KEY` lands on Vercel would
backfill nothing for the four new sourceTypes, leaving the existing
Annie's + Urban Cutz + earlier-lead rows un-embedded.
**Branch:** `feat/nerve-backfill-pr123-sourcetypes`
**Base branch:** `main`

## What changed

### `apps/nerve/prisma/backfill-embeddings.ts`

- New `BackfillTarget` shape (`{ sourceType, run }`) — each target owns
  its own LEFT-JOIN-against-Embedding query AND its embed-payload
  shaping. The previous `fetchMissing` + `mode` + `metadata` indirection
  didn't fit because each PR-123 target needs different selective field
  extraction (some pull from row columns, some from metadata JSONB).
- `PitchLog` target retained, behaviour-equivalent to the previous
  implementation.
- Four new targets, one per PR-123 sourceType:
  - **SiteBrief** — pulls business name / vertical / verdict / diagnosis
    / pitch-angle from the row, plus `verdict_reasoning_trace` and
    `diagnosis_alternatives_considered` from `metadata`.
  - **BrandAnalysis** — pulls logo description / voice quotes / voice
    adjectives / positioning reference / positioning rationale / asset
    notes from the row, plus `positioning_alternatives_considered` from
    `metadata`.
  - **DemoArtefact** — pulls business name / vertical / aesthetic
    positioning / dominant hex / photo count from the row, plus
    `design_rationale`, `layout_decisions` (JSON-serialised), and
    `nerve_consult_summary` (JSON-serialised) from `metadata`. NEVER
    embeds `html_inline` (same rule as the live route — embedding 1 MB
    of markup would dominate the chunk budget without semantic signal).
  - **QaVisualResult** — pulls producer / bug count / `has_critical`
    from the row, plus formatted `bugs` text, JSON-serialised
    `owner_reaction` and `customer_reaction`, and `notes` fields pulled
    from `brand_fidelity` and `voice_consistency` JSONB. Mirrors the
    `pickString` + `bugsText` helpers from the live route.

### Embed payload parity (why this matters)

Each TARGET routes through the matching store helper
(`siteBriefStore.getById` / `brandAnalysisStore.getById` /
`demoArtefactStore.getById` / `qaVisualResultStore.getById`) instead of
calling `prisma.<model>.findUnique` directly. The store helpers return
snake_case row shapes (`row.brief_id`, `row.business_name`,
`row.voice_quotes`) — the same shape the live `/api/ingest/<route>`
already passes to `embedRecord`. Because `chunkRecord` builds chunk
text as `<field-name>: <value>` line-by-line, drifting from snake_case
to camelCase would silently change the embedded text, producing
slightly different vectors for backfilled rows vs live-write rows.
Going through the stores keeps the two paths bit-identical.

When a future PR changes a live ingest route's embed payload (e.g.
adds a new metadata-derived field), the matching TARGET in this script
must be updated in the same PR — otherwise backfilled chunks drift.
This is called out in the file's header comment.

## Why

The RAG verification in the lead-2 audit (task #20) found that
`/api/search` returns 0 hits across every lead, not just Annie's —
production Vercel has never had `OPENAI_API_KEY` set, so every
`embedRecord` call since PR #123 shipped has been a silent no-op
(`apps/nerve/src/lib/embeddings.ts:isEmbeddingDisabled()` returns true
when the key is missing). When the user adds the key to Vercel env,
the next `npm run db:backfill-embeddings` will catch up all queued
rows — but only if the script knows to walk the four new tables. Today
it doesn't. This PR closes that gap.

After this lands and the OPENAI_API_KEY arrives, a single
`db:backfill-embeddings` run will embed:

- All 4 SiteBrief rows (Urban Cutz, Annie's, 2 earlier leads)
- All 4 BrandAnalysis rows (same coverage)
- All 4 DemoArtefact rows (one per lead that reached the build step)
- All QaVisualResult rows (Annie's + any prior visual-QA runs that
  posted to the new ingest)

And then `/api/search` + `/api/ask` + the per-lead chat panel can
exercise PR #123's extended retrieval surface end-to-end.

## Stack

- TypeScript only. No Prisma migration, no schema change, no runtime
  dependency change.
- Uses existing `embedRecord` + `phaseLabelFor` helpers — no new
  imports introduced beyond the four store modules already in the
  codebase.
- TS verified: `cd apps/nerve && npx tsc --noEmit` clean.

## Integrations

- Pairs with the OPS task "add OPENAI_API_KEY to Vercel" — the script
  is inert without it (`isEmbeddingDisabled()` skips), so it's safe to
  merge ahead of the key landing.
- `npm run db:backfill-embeddings` already exists in
  `apps/nerve/package.json`; no script-runner change needed.
- Backwards-compatible: the existing PitchLog target is preserved
  behaviour-for-behaviour.

## How to verify

```bash
cd apps/nerve && npx tsc --noEmit   # clean
```

End-to-end (after `OPENAI_API_KEY` is set on Vercel):

1. `cd apps/nerve && npm run db:backfill-embeddings`
2. Output should show non-zero counts for SiteBrief / BrandAnalysis /
   DemoArtefact (and QaVisualResult if any prior visual-QA runs exist).
3. Query `/api/search` (HMAC-signed POST with `x-read-signature`,
   filter `sourceType: SiteBrief`, query "verdict tier hosted not
   owned Treatwell"). Expect ≥1 hit referencing Annie's brief.
4. Run /api/ask scoped to `annies-nails-beauty` ("what verdict tier
   did the brief assign and why"). Expect the answer to cite the
   captured `verdict_reasoning_trace`.

## Known issues

- The script does not yet cover Note, BusinessFact, VisitEvent, or
  LeadRecord — all four are in `getLeadSourceIds`'s lead-scoped
  retrieval surface, all four have live ingest-time `embedRecord`
  calls, and all four would suffer the same missing-key gap. They were
  out of scope for PR #123 (which only added the four new sourceTypes)
  and so out of scope for this script extension. Worth a follow-up
  PR once the OPENAI_API_KEY backfill is done and we can confirm via
  search whether those four sourceTypes have any live-written
  embeddings or are similarly empty.
- The script's idempotency check is "no Embedding row for this
  source". If a row got embedded with a now-stale field shape (e.g.
  a brief that pre-dates `verdict_reasoning_trace`), this script
  won't re-embed it. Re-embedding stale rows would need a separate
  flag (`--force`) — not built today because no live rows are in that
  state yet.
- The script holds a Prisma connection open while iterating all
  targets sequentially. For the current row counts (<100 across all
  PR-123 tables) this is fine. If we ever hit >10k rows in any table,
  the LEFT JOIN query + per-row findUnique will dominate; switch to a
  batched stream pattern at that point.
