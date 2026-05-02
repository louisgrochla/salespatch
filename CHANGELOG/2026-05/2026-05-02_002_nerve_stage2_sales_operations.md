# NERVE — Stage 2: Sales Intelligence + Operations Log

**Date:** 2026-05-02
**Branch:** `claude/nice-kare-edfa44`

## What changed

### Shared
- `src/lib/auth-guard.ts` — `requireSession()` for server actions and route handlers
- `src/lib/csv.ts` — RFC 4180 CSV serialiser
- `src/components/PageHeader.tsx` — page header + `HeaderLink` / `HeaderPrimary` action buttons
- `src/components/Form.tsx` — `Field`, `TextInput`, `TextArea`, `Select`, `Checkbox`, `SubmitButton`, `FormError` (dense, monospace, dark)

### Sales Intelligence — `/sales`
- `actions.ts` — `createPitch`, `updatePitch`, `deletePitch` server actions. Each writes to `PitchLog`, syncs `PitchObjection`/`ObjectionTag`, re-embeds via `embedRecord`, revalidates `/sales` + `/dashboard`.
- `_components/PitchForm.tsx` — shared new/edit form with all 13 pitch fields including comma-separated objection tags
- `_components/PitchTable.tsx` — sortable table with status pills, phase pills, objection inline list, click-to-detail
- `_components/SalesFilters.tsx` — outcome / phase / sector / business type / lead source / demo version dropdowns + business-name search
- `page.tsx` — table view with quick stat tiles (total / closed / rejected / follow up + close rate), filters applied via search params, 500-row cap with overflow notice
- `new/page.tsx` — manual entry form
- `[id]/page.tsx` — detail view with read-only field grid; `?edit=1` swaps to the form. Delete is a destructive button on the header.
- `analytics/page.tsx` — conversion buckets by phase / sector / business type / lead source / demo version, objection frequency with bar viz, sample-size confidence colouring (n<10 red, n<30 amber, n≥30 fg), distribution stripes per row
- `api/sales/export/route.ts` — CSV + JSON export, accepts the same query params as the table page so exports match the active view

### Operations Log — `/operations`
- `actions.ts` — `createOperationsLog`, `updateOperationsLog`, `deleteOperationsLog` (all 4 types share one row; each type has its own field subset)
- `_components/OperationsForm.tsx` — type-aware form, conditionally renders the right field block based on the type dropdown
- `_components/Timeline.tsx` — chronological merged timeline with type-coloured pills (weekly grey, decision blue, failure red, iteration green), headline + secondary line preview, tag chips, phase pill
- `_components/OperationsFilters.tsx` — type / phase / tag filters
- `page.tsx` — timeline view with per-type counts, filters
- `new/page.tsx` — entry form, accepts `?type=decision|failure|iteration|weekly` to preselect
- `[id]/page.tsx` — type-aware read-only blocks; `?edit=1` to edit
- `api/operations/export/route.ts` — CSV + JSON export

### Bug fixes carried into Stage 2
- Tightened `phaseLabelFor` call inside the pitch webhook's try/catch (already in `b9999ca` from Stage 1 follow-up)

## Why

Per the staged plan, Stage 2 makes the founder's manual-beta data flow real: pitches can be entered by hand or by webhook, viewed in a dense queryable table, broken down for early findings, and exported one click at a time. Same for operations notes — the dissertation needs a continuous narrative log, not just sales rows.

Phase labels are recomputed on every save, not derived at read time, so editing phase boundaries can never retroactively rewrite history. Embeddings re-fire on every mutation (currently skip in dev with no `OPENAI_API_KEY`).

## Stack

Same as Stage 1 — no new deps beyond what was already installed. Server actions used end-to-end for mutations.

## Integrations

- Reuses Stage 1's `embedRecord` for re-embedding on save. When `OPENAI_API_KEY` is set, every CRUD save replaces the row's embeddings; until then, the skip-and-backfill pattern lets development proceed without OpenAI billing.

## How to verify

Dev server already running on `http://localhost:4400`. Sign in with `FOUNDER_EMAIL` / `FOUNDER_PASSWORD`.

1. **Sales table** — `/sales` shows 7 seeded pitches with all columns and stat tiles.
2. **Filters** — flip outcome/phase/sector dropdowns; URL updates; rows narrow.
3. **New pitch** — `/sales/new` → fill in → "Create pitch" → lands on detail page. Dashboard total ticks up.
4. **Edit pitch** — detail page → "edit" → change a field → "Save changes" → values updated.
5. **Delete pitch** — detail page → "delete" → returns to table, row gone, dashboard count down by 1.
6. **Analytics** — `/sales/analytics` shows conversion bucketed by phase/sector/type/lead/demo + objection frequency.
7. **CSV export** — `/sales` → click "csv" → file downloads with current filters applied. Quoted fields handled per RFC 4180.
8. **JSON export** — same, with "json".
9. **Operations timeline** — `/operations` shows 4 seeded entries, one of each type, type-coloured pills.
10. **New operations entry** — `/operations/new` → switch type dropdown → form fields adapt → save.
11. **Operations export** — same CSV/JSON pattern.

## Known issues / out of scope

- `/sales/analytics` time-efficiency widget (avg lead-gen time, demo-build time pre/post automation) deferred — needs data points we don't capture yet.
- Both list pages cap at 500 rows; pagination ships when needed.
- Embeddings still skip in dev. Run `npm run db:backfill-embeddings` once `OPENAI_API_KEY` is added.
- Quick-entry buttons on the dashboard for "Save literature source" and "Add financial entry" still link to routes that 404 — those land in Stage 3 and Stage 4 respectively.
- Tag filter on `/operations` is exact-match (`{ has: tag }` in Postgres `text[]`), not substring.
