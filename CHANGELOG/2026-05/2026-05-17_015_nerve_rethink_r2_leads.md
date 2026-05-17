# NERVE rethink — R2 lead 360° polish

**Date:** 2026-05-17
**Scope:** Second of six rounds in the NERVE rethink (see `apps/nerve/RETHINK-AUDIT.md`).
**Branch:** `feat/nerve-rethink-r2-leads`
**Base branch:** `main` (independent of R1 — does not depend on R1 merging)

## What changed

- **New** `apps/nerve/src/app/(app)/leads/[id]/_components/primitives.tsx` — extracted the locally-declared `Section`, `Panel`, `Row`, `Swatch`, `formatIso`, `safeHost`, `outcomeColor` from `page.tsx` so new panels can import them. Same shapes, same behaviour.
- **New** `apps/nerve/src/app/(app)/leads/[id]/_components/NotesPanel.tsx` — surfaces notes scoped to this lead via `Note.relatedSlug = id`. Each row: title (links to `/notes/[id]`), scope chip, tags, markdown body excerpt (capped 32rem height).
- **New** `apps/nerve/src/app/(app)/leads/[id]/_components/EmbeddingsPanel.tsx` — RAG coverage panel. Empty state when no chunks; otherwise a table of source types with chunk count and last-embedded timestamp, plus a one-line "queryable from /ask and /search" framer.
- **New** `apps/nerve/src/app/(app)/leads/[id]/_components/QaVisualPanel.tsx` — table of six-layer vision QA rows. Computes section-mean grade inline. Critical flag colour-coded.
- **New** `apps/nerve/src/app/(app)/leads/[id]/_components/StripeEventsPanel.tsx` — table of payment events. Status colour-coded (paid/succeeded/complete = green, failed/canceled = red, pending = yellow). Currency-aware amount formatter.
- **Modified** `apps/nerve/src/lib/sl-mas/stripeEventStore.ts` — added `listForAssignments(assignmentIds: string[], limit?: number)` that short-circuits to `[]` when the input array is empty (avoids Prisma generating `IN ()`).
- **Modified** `apps/nerve/src/app/(app)/leads/[id]/page.tsx`:
  - Imports primitives from `_components/primitives` instead of declaring them locally.
  - Imports the four new panel components.
  - Added `qaVisualResultStore.listForLead(id, 20)` and `prisma.note.findMany({ where: { relatedSlug: id }, … })` to the main `Promise.all`.
  - Added post-`Promise.all` queries for `stripeEventStore.listForAssignments(...)` and `prisma.embedding.groupBy(...)`.
  - Renders the four new panels at appropriate spots: Notes after stat tiles, QaVisual after QaResults, Stripe after Onboarding, Embeddings at the bottom before the id footer.
  - Updated `hasSlMasData` to include `qaVisualResults.length > 0` and `notes.length > 0` so leads with only notes or only QA-visual data don't 404.
  - Removed the inline `Section`/`Panel`/`Row`/`Swatch`/`formatIso`/`safeHost`/`outcomeColor` function declarations now that they live in `_components/primitives.tsx`.

## Why

The audit (section 4a in `apps/nerve/RETHINK-AUDIT.md`) flagged five data sources visible in the schema but not surfaced on `/leads/[id]`:

1. Notes scoped via `Note.relatedSlug` — context-rich human annotations sat invisible.
2. RAG embeddings — no way to know whether the vault could answer questions about a given lead.
3. SalespersonEvent rows — deferred (per-lead value is low; events are SP-scoped).
4. Stripe events tied to the lead's assignment(s) — payment outcomes invisible despite being in the warehouse.
5. QaVisualResult rows — the 10-PR vision QA stack was only inspectable via CLI scripts and a markdown report.

R2 closes four of these (Notes, Embeddings, QaVisual, Stripe) and extracts shared primitives so future rounds can add panels without further duplication. The fifth (SalespersonEvent) is deferred — it's an SP-side concern, more naturally lives on an SP-detail view in a later round.

## Stack

- Next.js 14 App Router (existing)
- Prisma (existing)
- Tailwind 3 (existing tokens reused)

## Integrations

None. UI + read-only Prisma queries only. No new schema, no new ingest endpoints.

## How to verify

Programmatic:

```bash
cd apps/nerve && npx tsc --noEmit   # passes, exit 0
```

On the Vercel preview:

1. Open the preview URL the PR surfaces.
2. Sign in with founder credentials.
3. Navigate to a lead with rich data — e.g. `/leads/jp-nail` (the first end-to-end lead) or `/leads/the-tartan-pig`.
4. Confirm the four new sections render between the existing ones in this order: Notes → QA results → Visual QA → Lead profile → Assignment timeline → Onboarding → Stripe events → Pitch history → Composer iterations → API spend → RAG coverage.
5. For a lead with no notes, confirm `NotesPanel` is hidden (not rendered as an empty block).
6. For a lead with no embeddings yet, confirm `EmbeddingsPanel` renders an explanatory empty-state block instead of a malformed table.
7. Sanity-check `hasSlMasData` short-circuit: navigate to a lead slug that only has notes attached and confirm the page renders (was a 404 before this PR).

## Known issues

- Local dev server can't run without `DATABASE_URL`. Visual verification waits for Vercel preview.
- The existing creative / QA / commerce / spend panels remain inline in `page.tsx` — only the primitives plus the four new panels were extracted in this round. Further componentisation can happen as a follow-up if needed.
- Unified chronological timeline (merge pitches + assignments + Stripe + composer + QA into one stream) deliberately not built — per-event tables remain. Revisit if a lead routinely accumulates > 20 events of mixed types.
- R3 (ask-the-business chat) will hang a per-lead RAG chat panel off the `EmbeddingsPanel` data — the embedding aggregation here is the substrate the chat will filter on.
