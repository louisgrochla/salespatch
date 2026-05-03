# NERVE — Dissertation topic update

**Date:** 2026-05-02
**Branch:** `claude/nice-kare-edfa44`

## What changed

User updated the dissertation topic. Adapted NERVE's research metadata
to fit the new framing without losing version history.

### Schema (migration `1_dissertation_meta_extras`)
Added to `DissertationMeta` (all nullable, additive — no data loss):
- `degree` — e.g. "BA (Hons) Digital Marketing and Business Analytics"
- `institution` — e.g. "Robert Gordon University, Aberdeen"
- `wordCountTargetMin`, `wordCountTargetMax` — replaces single target
- `submissionDeadlineNote` — free text for use while the exact deadline
  is TBC (per spec: confirmed September 2025)
- `academicFraming` — the reusable paragraph that describes the study
  to a supervisor in the right register. Per the spec it must be
  surfaced by `/ask` whenever the dissertation framing is queried;
  Stage 5's system prompt will inject it.
- `degreeRelevanceMarketing`, `degreeRelevanceAnalytics` — markdown
  bullet lists that connect the study to each half of the degree

### Seed (`prisma/seed.ts`)
Rewritten to populate all of the above. Idempotent — re-runs are safe;
title and RQ versions only append when the value changes.

Set:
- Working title: "Distributed AI-Augmented Sales: Can a Self-Learning
  Multi-Agent Platform Produce Sustainable Income Across a Non-Technical
  Contractor Network?"
- RQ: full three-phase RQ from the spec
- Degree, institution, target range (10k–12k), all framing text
- Phase 1 description: matches the manual-beta narrative from the spec
- Sections: replaced with the exact 6 from the spec (Introduction,
  Literature Review, Methodology, Findings, Discussion, Conclusion).
  Targets sum to 12,000 (top of the 10k–12k range). Old chapters with
  no content (e.g. Abstract from the prior seed) are dropped; chapters
  with content are preserved.
- Methodology doc for Phase 1: full mixed-methods narrative including
  the NERVE-as-infrastructure paragraph
- Calendar: 8 milestones, including "confirm submission deadline" and
  "confirm word-count limit" both due September 2025

### UI
- `/research/dissertation` page: now shows degree, institution, deadline
  note, target range (renders "10,000 — 12,000 words"), the academic
  framing block (with a "surfaced by /ask" tag), and the two
  degree-relevance blocks side by side. Form has inputs for everything.
- `/research` dashboard: surfaces the academic framing prominently
  between the research question and the progress tiles, plus a
  three-tile strip showing degree / institution / word count target.
- `/research/literature` form: suggested theme list updated to match
  the spec's 8 themes (algorithmic entrepreneurship, platform economics
  and two-sided markets, gig economy sustainability, multi-agent
  systems in commercial applications, AI in SME marketing and sales
  automation, conversion rate optimisation, distributed income models,
  lean startup methodology).

### Migration tooling housekeeping
- Added `prisma/migrations/migration_lock.toml` so future
  `migrate diff --from-migrations` calls work without re-baselining.

## Why

The user's research scope and framing evolved. The version-history
tables for working title and research question are designed exactly for
this — both new strings get a v1 row in the seed (the first time the
table is empty); future edits append v2, v3, etc. so the evolution of
the question is itself preserved as evidence of academic development.

## How to verify

Dev server already running on `http://localhost:4400`. Sign in.

1. **Dashboard** at `/research`: title and RQ now show the new text.
   Below the RQ, the academic framing paragraph appears in its own
   card with a "surfaced by /ask" tag. Below that, three tiles:
   degree / institution / word count target.
2. **Dissertation editor** at `/research/dissertation?history=1`:
   working title, RQ, degree, institution, supervisor (—), submission
   note, word count range, status, academic framing, degree relevance
   markdown blocks. Right sidebar shows v1 for both title and RQ.
3. **Edit** at `/research/dissertation?edit=1`: every new field has its
   own form input. Changing the title and saving creates a v2 history
   row — sidebar updates to show v2 above v1.
4. **Sections** at `/research/sections`: exactly 6 chapters
   (Introduction, Literature Review, Methodology, Findings, Discussion,
   Conclusion). Targets: 1,500 / 3,000 / 2,000 / 2,500 / 2,000 / 1,000
   (sum = 12,000).
5. **Methodology** at `/research/methodology`: Phase 1 doc now contains
   the full mixed-methods narrative including the NERVE paragraph.
6. **Calendar** at `/research/calendar`: 8 milestones including the
   September-2025 supervisor-handbook confirmations.
7. **Literature form** at `/research/literature/new`: the suggested
   themes hint shows the new list.

## Notes / regrets

I caused a data loss event mid-migration. Running
`prisma migrate diff --shadow-database-url "$DIRECT_URL"` was wrong —
giving the production URL as the shadow URL drops and recreates the
schema as part of the diff. The schema rebuilt cleanly from the
migration files but the seeded operational data (sample pitches, ops
log entries, demo literature, etc) was lost. The `_prisma_migrations`
table was also wiped, which is why I had to `migrate resolve --applied`
to baseline 0_init.

Recovery path going forward: never use the production URL as the shadow
URL. For ad-hoc migration generation, either spin up a separate Neon
branch as the shadow, or use `prisma migrate diff --from-empty` (no
shadow needed) and accept that it'll re-emit the full schema rather
than just the diff.

The canonical research data was rebuilt from the seed; the only thing
truly lost was the demo pitch + operations rows that I added inline
during Stage 2 verification. Anything you'd added by hand is gone too,
so I'm flagging it explicitly: if you'd entered any pitches via
`/sales/new` between Stage 2 and now, those are not recoverable from
this side.
