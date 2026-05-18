# Decision capture + RAG embeddings for SL-MAS reasoning

**Date:** 2026-05-18
**Scope:** Close the final pipeline-side gap from the lead-1 (Urban
Cutz) audit. Captures one new decision-trace field (`design_rationale`)
that nothing else holds today, documents the `autofix_history`
convention for visual-QA result metadata, and extends the per-lead RAG
embedding contract from 4 source types to 8 so the
diagnosis/positioning/design/QA reasoning the warehouse already holds
becomes queryable via `/ask` and the per-lead scoped chat.
**Branch:** `feat/nerve-decision-capture-embeddings`
**Base branch:** `main`
**Pairs with:** PR #120 (skills in repo), #121 (features capture),
#122 (logo + mobile intelligence). This is the last of the three
follow-up PRs from the lead-1 audit.

## What changed

### Skill side (capture)

- **Modified** `.claude/commands/build-demo.md`:
  - `demo-artefact.json.metadata.design_rationale` added as a required
    field when verdict=PROCEED. One short paragraph capturing the
    WHY behind the build's calls — alternative considered, why this
    photo as hero, why this many gallery tiles. Free-form, 2-5 sentences.
    Today this reasoning lives in chat output and disappears when the
    session clears. Fix: surface it on the artefact so it flows into
    RAG and the eventual training corpus.
  - Autofix iteration loop documents the `qa-visual-result.metadata.autofix_history`
    array convention. The /build-demo skill's iteration loop posts a
    fresh QA result after each autofix run; that result's
    `metadata.autofix_history` accumulates the AutofixSummary from
    every iteration so far. The warehouse can answer "which remedies
    closed which bugs on which leads" without joining log files.

### Embedding side (RAG)

- **Modified** `apps/nerve/src/lib/sl-mas/leadEmbeddings.ts` —
  `getLeadSourceIds()` grows from 4 sourceTypes to 8. Adds
  `SiteBrief`, `BrandAnalysis`, `DemoArtefact`, `QaVisualResult`
  alongside the existing `LeadRecord`, `Note`, `BusinessFact`,
  `VisitEvent`. The function is the authoritative list both
  `/leads/[id]` EmbeddingsPanel and `/ask` (scope-filtered chat)
  agree on, so adding rows here unlocks the four panels at once.

- **Modified** four ingest routes to embed on insert:
  - `apps/nerve/src/app/api/ingest/site-brief/route.ts` —
    selective `embedRecord` after `siteBriefStore.ingest` succeeds.
    Fields embedded: `business_name`, `business_type`, `vertical`,
    `verdict`, `verdict_reason`, `diagnosis`, `pitch_angle`,
    `test_of_success`, `metadata.verdict_reasoning_trace`,
    `metadata.diagnosis_alternatives_considered`. The full
    `brief_markdown` is NOT embedded (too long, mostly redundant
    with the structured fields).
  - `apps/nerve/src/app/api/ingest/brand-analysis/route.ts` —
    `logo_description`, `logo_kind`, `voice_quotes`, `voice_adjectives`,
    `positioning_reference`, `positioning_rationale`, `asset_notes`,
    `metadata.positioning_alternatives_considered`.
  - `apps/nerve/src/app/api/ingest/demo-artefact/route.ts` —
    `business_name`, `vertical`, `aesthetic_positioning`,
    `dominant_hex`, `photo_count`, `metadata.design_rationale`,
    `metadata.layout_decisions` (JSON-stringified),
    `metadata.nerve_consult_summary` (JSON-stringified). The
    `html_inline` field is NEVER embedded — a 4MB markup blob would
    dominate the chunk budget and add no semantic signal beyond what
    the structured fields already carry.
  - `apps/nerve/src/app/api/ingest/qa-visual-result/route.ts` —
    `producer`, `bug_count`, `has_critical`, bug findings joined as
    text, `owner_reaction`/`customer_reaction` (JSON-stringified),
    `brand_fidelity.notes`, `voice_consistency.notes`, top-level
    `notes`.

  All four follow the existing R9 visit-event pattern: embed only on
  the insert path (replays don't re-embed), wrap in try/catch so
  embed failure is best-effort (the structured row is still queryable),
  derive `phaseLabel` from the entity's authoritative timestamp.

### What's NOT in this PR

- Backfilling embeddings for pre-existing rows (urban-cutz, jp-nail,
  verify-*). The ingest path embeds on insert only — existing rows
  need a one-off backfill script (`apps/nerve/scripts/backfill-embeddings.ts`
  exists for the original 4 sourceTypes; extending it to 8 is a
  separate trivial PR).
- A NERVE UI panel that surfaces the new RAG content. The data flows
  through `/ask` and the per-lead scoped chat (R3) immediately —
  no UI work needed for the immediate benefit.
- A programmatic check that `design_rationale` is non-empty on
  PROCEED briefs. Prompt-only enforcement today; the warehouse
  ingest accepts an empty string without complaint.

## Why

The lead-1 audit confirmed the four reasoning traces (`verdict_reasoning_trace`,
`diagnosis_alternatives_considered`, `positioning_alternatives_considered`,
photo classifications, layout decisions, NERVE consult summary) ARE
captured — Urban Cutz's brand-analysis.json had them. The gap was
two-fold:

1. **Design rationale** (free-form WHY the build picked what it did)
   wasn't captured anywhere. Adding it as a required metadata field
   closes the "the model made N reasonable calls and didn't explain
   them" loop.
2. **None of this reasoning was embedded.** A lead's chat could ask
   "what did the brief diagnose for this business" and the answer
   would come from the LeadRecord summary, not the rich trace inside
   the SiteBrief / BrandAnalysis / DemoArtefact / QaVisualResult rows.
   Extending `getLeadSourceIds()` + adding embed calls on the four
   ingest routes makes all that text RAG-queryable per-lead.

The autofix-history convention is the smallest of the three changes —
the script already produces an `AutofixSummary`; the skill just has to
attach it to the next QA result POST. Doing this means future analysis
can ask "what remedies fired across the beta batch, and how often did
the third iteration land vs the first?" without joining the local
run.jsonl into NERVE.

## Stack

- Existing infrastructure throughout. No new dependencies.
- `embedRecord` (lib/embeddings.ts) + `phaseLabelFor` (lib/phase.ts)
  — both already used by visit-event (R9 pattern).
- No Prisma migration. Embeddings land in the existing `Embedding`
  table with new `sourceType` values; `metadata.design_rationale`
  and `metadata.autofix_history` land in existing JSONB columns.

## Integrations

- Inbound: same four ingest endpoints. No payload schema changes from
  the producer's perspective. The skill prompts ask for new metadata
  fields, but the validators accept any JSONB so the wire format is
  backwards-compatible.
- Outbound: OpenAI `text-embedding-3-small` (already used). Marginal
  cost per ingest: ~£0.0001 per embedded chunk × 4 chunks per lead
  ≈ £0.0004 per full pipeline run. Negligible.

## How to verify

Programmatic:

```bash
cd apps/nerve && npx prisma generate && npx tsc --noEmit  # clean
```

End-to-end on a fresh lead (post-merge):

1. Re-link skills if needed: `bash scripts/setup-skills.sh`.
2. Run /spec-site-brief → /build-demo → /lead-json on a brand new
   lead. Confirm:
   - `brief.json.metadata` has `verdict_reasoning_trace` + alternatives.
   - `brand-analysis.json.metadata` has
     `positioning_alternatives_considered`.
   - `demo-artefact.json.metadata.design_rationale` is non-empty.
3. POST to each of the four ingest routes returns HTTP 200. The
   server logs should include zero `[<route>] embed failed:` entries
   in the happy path.
4. On `nerve.salespatch.co.uk/leads/<slug>` open LeadChatPanel and ask:
   - "What alternatives did the brief consider for the diagnosis?"
     → should retrieve from SiteBrief embedding.
   - "Why did the build pick this hero photo?" → should retrieve
     from DemoArtefact embedding's `design_rationale`.
   - "What bugs did visual-QA flag?" → should retrieve from
     QaVisualResult embedding.
5. The `EmbeddingsPanel` rollup count on `/leads/<slug>` should
   increase by 4 (one per new sourceType) for every new lead going
   forward.

Direct row inspection:

```sql
-- on the Neon SQL editor
SELECT "sourceType", count(*) FROM "Embedding" WHERE "metadata"->>'leadId' = 'urban-cutz' GROUP BY 1;
-- Pre-PR: rows for LeadRecord/Note/BusinessFact/VisitEvent only.
-- Post-PR + a fresh ingest: rows for SiteBrief/BrandAnalysis/DemoArtefact/QaVisualResult too.
```

## Known issues

- Existing pre-PR rows (urban-cutz brief/brand/demo/qa) don't have
  embeddings until the backfill script runs. The chat panel will
  answer correctly only after either (a) a re-ingest of those rows
  or (b) the backfill script extends to the 4 new sourceTypes.
- `embedRecord` is fire-and-forget — if it fails (OpenAI rate-limit,
  timeout), the row stays unembedded silently and only the
  `console.error` line surfaces. A future PR could push these
  failures into the `/system` page like other embed failures.
- `metadata.design_rationale` is prompt-required but not validator-
  enforced. A future PR could add a route-level check on PROCEED
  artefacts to surface "design_rationale missing" as a warning.
- The autofix_history convention lives in the skill prompt only. The
  autofix script itself doesn't write to NERVE — the skill assembles
  the history as it iterates. If a future Pi runner takes over the
  autofix loop, it'll need to do the same accumulation client-side.
