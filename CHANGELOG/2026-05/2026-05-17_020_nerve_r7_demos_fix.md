# NERVE — R7 demo-library plumbing fix

**Date:** 2026-05-17
**Scope:** Post-audit follow-up — closes the "skill demos don't show in the Demo Library" bug surfaced during R6 verification.
**Branch:** `feat/nerve-r7-demos-fix`
**Base branch:** `main`

## What changed

### Root cause

NERVE had two unrelated demo tables:

| Table | Producer | UI reader |
|---|---|---|
| `DemoRecord` (legacy) | `/demos/new` manual-entry form (rarely used) | `/demos` list + `/demos/[id]` + `/dashboard` tile + sidebar count |
| `DemoArtefact` (Phase A) | `/build-demo` skill via `POST /api/ingest/demo-artefact` | `/leads/[id]` (via the R2 panel) only |

Skill-generated demos hit the Phase A table and surfaced on the per-lead page. The Demo Library, the dashboard "active demos" tile, and the sidebar count badge all read the legacy table — which only contained a few stale manual rows. From the user's perspective: "skill demos don't show in NERVE."

### Files

- **Rewrote** `apps/nerve/src/app/(app)/demos/page.tsx` — reads `prisma.demoArtefact.findMany`. New columns: generated_at · business · lead (deep-link to `/leads/[id]`) · vertical · aesthetic positioning · photo count · html size · palette swatch · source. New top section: per-vertical rollup with artefact count + avg photos + avg html size.
- **Rewrote** `apps/nerve/src/app/(app)/demos/[id]/page.tsx` — now a redirect helper. Accepts the `DemoArtefact.id` or the producer-supplied `artefactId` natural key; redirects to `/leads/<leadId>` where the iframe preview + brief + brand + QA panels already live (R2). Unknown ids redirect to `/demos`.
- **Rewrote** `apps/nerve/src/app/(app)/demos/new/page.tsx` — manual entry retired. Shows a one-paragraph framer pointing at `/build-demo` so any bookmarked link still lands somewhere coherent.
- **Deleted** `apps/nerve/src/app/(app)/demos/actions.ts` and `apps/nerve/src/app/(app)/demos/_form.tsx` — dead code once the manual form is gone. No external callers (grep confirmed).
- **Modified** `apps/nerve/src/app/(app)/dashboard/page.tsx`:
  - "active demos" tile renamed to "demos built", swapped to `prisma.demoArtefact.count()`.
  - Recent activity feed: source swapped from `demoRecord` (ordered on `createdAt`) to `demoArtefact` (ordered on `generatedAt`). Phase label hard-coded to "Phase 1" — `DemoArtefact` doesn't carry a `phaseLabel` column today and the activity row is rendered in the current phase anyway.
- **Modified** `apps/nerve/src/app/(app)/layout.tsx` — sidebar count swapped to `prisma.demoArtefact.count()`.

### Untouched

- `DemoRecord` model in `prisma/schema.prisma` — preserved for data continuity. If you decide the legacy rows are worthless after a few weeks, a follow-up PR can drop the table.
- `apps/nerve/src/lib/evidence.ts` — still resolves the legacy `"DemoRecord"` sourceType for any embeddings that pre-date Phase A. Correct as-is.

## Why

R6 closed out the six-round audit. Post-merge sanity walk surfaced this connection bug — skill demos exist in the warehouse but the operator-facing Demo Library was reading the wrong table. R7 wires the UI to the actually-populated table, retires the dead manual-entry path, and keeps legacy data intact.

## Stack

- Next.js 14 App Router (existing)
- Prisma (existing)
- No new dependencies.

## Integrations

None. UI + read-only Prisma queries only.

## How to verify

Programmatic:

```bash
cd apps/nerve && npx tsc --noEmit   # passes, exit 0
```

On the Vercel preview:

1. `/demos` — should now list every artefact `/build-demo` has produced (JP Nail, tartan-pig, etc.) with the new columns. Sidebar count badge should rise from the old (stale) `DemoRecord` count to the larger `DemoArtefact` count.
2. Click any demo row — should redirect to `/leads/<leadId>` and the R2 iframe preview + brief + brand panels.
3. Visit `/demos/<some-artefact-id>` directly — same redirect behaviour.
4. Visit `/demos/<garbage-id>` — redirects back to `/demos` (no 500).
5. Visit `/demos/new` — should show the "manual entry retired, run /build-demo" framer; no form, no submit button.
6. `/dashboard` — "demos built" tile shows the new count, hint reads "lifetime via /build-demo skill". Recent activity feed should include demo entries with the artefact's `business_name`.

## Known issues

- Local dev server can't run without `DATABASE_URL` — visual verification on the preview only.
- Outcome column on the Demo Library row is intentionally not implemented yet (would need a join through `LeadAssignmentEvent`). Defer until volume justifies.
- The `DemoArtefact` table doesn't carry `phaseLabel`; dashboard recent activity hard-codes "Phase 1" for demo rows. Acceptable until a phase boundary actually flips during operations.
- `evidence.ts` lookup for `sourceType = "DemoArtefact"` doesn't exist — falls through to default. No DemoArtefact embeddings are written today (R3's `getLeadSourceIds` only includes `LeadRecord` + `Note` + `BusinessFact`); if a future skill embeds DemoArtefacts, add the case then.
