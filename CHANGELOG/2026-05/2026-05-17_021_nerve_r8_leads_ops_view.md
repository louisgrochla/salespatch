# NERVE — R8 leads ops view

**Date:** 2026-05-17
**Scope:** Replace `/leads` with a cross-lead operations table — one row per
canonical business with stage, assignment, demo/QA, pitches, build, revenue,
visits, feedback, and flag columns. Driven by Prisma + Supabase live-pull.
**Branch:** `feat/nerve-r8-leads-ops-view`
**Base branch:** `main`
**Audit doc:** `apps/nerve/LEADS-OPS-PLAN.md` (R8 section; R9 plan kept inline
for the next PR).

## What changed

### Why the rewrite

The pre-R8 `/leads` page was two stacked lists (SL-MAS profiles + manual
records) with status / source / vertical filters and a source-perf rollup —
useful for the inventory question ("what leads do we have?") but not the
ops question ("who's working on what right now?"). Founder asked: "where do
all of the assigned leads go? we should be able to see them all in one
view." Specifically: assignment, stage, feedback, time-on-business, change
requests, in a single dense table.

The data to answer that has existed across NERVE + Supabase since Phase B
(`LeadAssignmentEvent`, `StripeEvent`, `OnboardingResponse`, `Note`,
`BusinessFact`, `QaVisualResult`, plus Supabase `sales_users` / `visits`).
R8 stitches them together; R9 will move the live-pull side (SP identity +
visits) into NERVE proper via a `VisitEvent` ingest.

### Files

- **New** `apps/nerve/src/lib/sl-mas/leadOpsQuery.ts` — single
  `loadLeadsOps(searchParams)` helper. Fans out ~10 parallel queries
  (Prisma groupBys + Supabase live-pull), zips them per canonical business
  using `normaliseName` dedup, computes the stage + flag derivations, and
  applies the URL-driven filters server-side. Exports `LeadOpsRow`,
  `LeadOpsFilterOptions`, `LeadOpsSummary`, `STAGE_ORDER`, plus the
  `LeadOpsStage` / `LeadOpsFlag` string-literal unions.
- **New** `apps/nerve/src/app/(app)/leads/_components/LeadsOpsFilters.tsx` —
  server-component form. Stage + source render as checkboxes
  (multi-select), vertical / SP / flag render as selects, plus a free-text
  search box. Submits as GET to `/leads` so the URL is the only state.
- **New** `apps/nerve/src/app/(app)/leads/_components/LeadsOpsTable.tsx` —
  dense 11-column table. Sub-cells via inline helpers (BusinessCell,
  StageCell, AssignedCell, DemoCell, PitchCell, BuildCell, RevenueCell,
  ActivityCell, VisitCell, FeedbackCell, FlagsCell). Reuses existing
  `pill` + `nv-table` utility classes from `globals.css`; no client
  components.
- **Replaced** `apps/nerve/src/app/(app)/leads/page.tsx` — old 372-line
  implementation reduced to ~55 lines (orchestrator: PageHeader + state-of-
  play tiles + Section wrapping the filters + table). The old
  `VerticalFilter`, source-perf rollup, and dedup logic now live inside
  `loadLeadsOps`.
- **Extended** `apps/nerve/src/lib/supabase-builds.ts` — added
  `fetchSalesUsers()` returning `{userId, displayName, areaPostcode}[]`
  (display-name fallback: `display_name` → `first_name last_name` → id)
  and `fetchVisits(assignmentIds)` returning a per-assignment
  `{durationMinutes, startedAt}` map. Both degrade to empty when
  `SUPABASE_SERVICE_ROLE_KEY` is unset. `getSupabase()` made `export` so
  the new helpers can colocate alongside `fetchBuilds()`.

### Untouched

- `apps/nerve/src/app/(app)/leads/[id]/page.tsx` (R2 360°) — the row click
  destination. Unchanged.
- `apps/nerve/src/app/(app)/leads/new/` (manual entry) — still the path for
  founder-added leads. Linked from the new PageHeader's "+ new manual lead".
- `apps/nerve/src/app/(app)/builds/page.tsx` — separate fulfilment surface.
  The new view links into it from the Build column.

### Row shape

| col | source | notes |
|---|---|---|
| business | `LeadProfile.businessName` / `LeadRecord.name` + vertical + postcode/location | links to `/leads/[id]` |
| stage | latest `LeadAssignmentEvent.status` → `paid`-if-built wins; manual `contactedStatus` is fallback | coloured pill |
| assigned to | Supabase `sales_users` keyed on `LeadAssignmentEvent.userId` | `—` when unassigned or Supabase down |
| demo | `DemoArtefact` count + latest `QaVisualResult.hasCritical` | ✓ / critical / clean |
| pitches | `PitchLog` count + latest outcome (joined on `businessName`) | matches the per-lead view's join |
| build | Supabase `lead_onboarding_responses` + `lead_assignments` via `fetchBuilds()` | links to `/builds` |
| revenue | `StripeEvent.amountTotalPence` summed where `paymentStatus = "paid"` and `assignmentId` matches | `£X.XX` |
| last activity | max of every per-lead timestamp (event / demo / qa / pitch / note / fact / paidAt / profile) | `formatDistanceToNow` |
| visit time | Supabase `visits.duration_minutes` summed per assignment | `—` when no rows or Supabase down |
| feedback | `Note.relatedSlug = id AND scope='lead'` count + `LeadAssignmentEvent.notes` presence | links to `/leads/[id]#notes` |
| flags | critical-QA · unassigned · paid-unbuilt · overdue (>7d since paid) | coloured pills |

### Stage derivation

Priority: paid (build.paid && !built) > latest event status > `LeadRecord.contactedStatus` >
`unassigned`. Event status maps as `new → not_contacted`, `visited →
contacted`, `pitched → pitched`, `sold → sold`, `rejected → rejected`.
`contactedStatus.closed → sold` for back-compat with the legacy NERVE flow.

### Filter URLs

- `?stage=pitched` — multi-select via repeat (`?stage=pitched&stage=sold`)
- `?vertical=cafe` — exact match against `LeadProfile.vertical` /
  `LeadRecord.sector`
- `?sp=Sarah%20T` — SP display-name match (case-sensitive; dropdown
  populated from `fetchSalesUsers()`)
- `?source=sl-mas` / `?source=manual` — multi-select
- `?flag=only_critical_qa` / `only_paid_unbuilt` / `only_unassigned` /
  `only_active_onboarding`
- `?q=tartan` — free-text on business name + leadId + postcode + location
- Reset link clears all

## Why

Founder asked for one ops view where the whole pipeline is scannable. The
data was already in NERVE + Supabase; the surface was missing. R8 builds
the surface and R9 moves the last live-pull (visits) into NERVE so the
view doesn't depend on Supabase being reachable from Vercel.

## Stack

- Next.js 14 App Router (existing)
- Prisma — `groupBy` on `DemoArtefact` / `Note` / `BusinessFact` / `StripeEvent`,
  `findMany` with `distinct` on `QaVisualResult`, `findMany` on
  `LeadAssignmentEvent` + `LeadProfile` + `LeadRecord` + `PitchLog`.
- `@supabase/supabase-js` (existing) — service-role for `sales_users`,
  `visits`, and `lead_onboarding_responses` joins.
- `date-fns` `formatDistanceToNow` for the activity column.
- No new dependencies.

## Integrations

- Supabase service-role read (existing — already used by `/builds`). New
  tables touched: `sales_users`, `visits`.
- No new ingest, no new webhooks, no new env vars.

## How to verify

Programmatic:

```bash
cd apps/nerve && npx tsc --noEmit   # passes, exit 0
```

On the Vercel preview:

1. `/leads` renders the new dense table with one row per business — no
   duplicate manual+SL-MAS rows for the same canonical name.
2. State-of-play tiles show total / assigned / in-pitch / paid / unbuilt /
   flagged counts.
3. `?stage=pitched` filters to pitched leads only.
4. `?sp=<display-name>` filters to that SP's assigned leads only (the SP
   dropdown is empty when Supabase service-role isn't reachable — the
   subtitle warns about that).
5. `?flag=only_critical_qa` filters to leads whose latest visual-QA review
   has `hasCritical = true`.
6. `?q=tartan` filters by free-text across name + slug + postcode.
7. SP names render when Supabase is up; when down, the "assigned to" /
   "visits" / "build" columns degrade to `—` cleanly.
8. Build column shows "paid · onboarded" / "paid · active" / "paid ·
   changes" matching what `/builds` shows, and links to `/builds`.
9. Click any row → `/leads/[id]` (R2's per-lead 360°).
10. Sidebar count badge for "Lead Intelligence" remains correct (it still
    uses `leadRecord.count()` in `(app)/layout.tsx` — intentionally not
    touched).

## Known issues

- Local dev server can't run without `DATABASE_URL` — visual verification
  on the preview only.
- The "feedback" column counts `Note.scope=lead` + `LeadAssignmentEvent.notes`
  rows but does not yet count `OnboardingResponse.topChanges` or
  `BusinessFact` rows. Volume justifies it as is; revisit if signal gets
  noisy.
- SP filter matches on display name (string); if two SPs share a name the
  filter narrows to both. Sufficient at current N; switch to userId when
  the cohort grows.
- R9 (visit + feedback ingest) is the planned follow-up — see
  `apps/nerve/LEADS-OPS-PLAN.md` § R9. Don't ship it in the same PR as R8;
  it's its own migration + ingest endpoint.
