# NERVE — Leads Operations View (plan + fresh-session bootstrap)

> **Status:** Plan only. Not yet implemented. Author: Claude session 2026-05-17.
> Designed to survive a `/clear` — everything a fresh session needs is in this file.

---

## ▶︎ Starter prompt for the fresh session

Paste this into the new session after `/clear`:

```
Read apps/nerve/LEADS-OPS-PLAN.md from the repo root and execute R8 as
its own PR — branch off main as feat/nerve-r8-leads-ops-view, follow
the project's per-round pattern (small focused commits, typecheck
clean before pushing, CHANGELOG entry, mark "in review" in the
RETHINK-AUDIT.md follow-ups section if you want, gh pr create at the
end). Use the design choices locked in at the top of the plan as
non-negotiable. Stop after R8 lands as a PR — R9 is a separate PR
the user will ask for later. Do not start R9 in the same session.
```

That's it. The rest of this file is what the fresh session needs to know.

---

## Context (what prompted this)

NERVE's `/leads` page today is a basic dedup'd list of `LeadRecord` + `LeadProfile` rows with a couple of count tiles. The per-lead 360° at `/leads/[id]` is rich (R2 added notes/embeddings/QA/Stripe panels; R3 added scoped chat; R4 added business facts; see `apps/nerve/RETHINK-AUDIT.md` for the full audit history). But **there is no cross-lead monitoring surface**.

Founder asked: "where do all of the assigned leads go? we should be able to see them all in one view." Specifically:
- Who is each lead **assigned to** (SP)?
- What **stage** is each lead at (new → approached → pitched → sold → paid → built)?
- Has the SP given any **feedback** on it?
- How much **time has the SP spent at the business** (visit sessions)?
- **Change requests** the customer asked for (currently buried in `/builds`)?
- All of that **in one row per lead**, filterable.

This data partially exists today across NERVE tables (`LeadAssignmentEvent`, `DemoArtefact`, `QaVisualResult`, `PitchLog`, `StripeEvent`, `OnboardingResponse`, `Note`, `BusinessFact`) and partially still lives only in Supabase (SP identity, visit sessions). The view needs both.

This plan is a follow-up to the original NERVE rethink (R1–R7 — all merged) and `R7 demos-fix` (PR #115 merged 2026-05-17). Not part of that audit; this is its own multi-round work.

## Design choices locked in (user-confirmed)

| # | Decision | Why |
|---|---|---|
| 1 | **Replace `/leads`** with the new ops table — don't add a new URL | Less nav clutter; existing muscle memory |
| 2 | **Live-pull from Supabase + add ingest later** — R8 ships using NERVE + Supabase live-pull; R9 adds a NERVE ingest for visit events + structured feedback | Ships fast; proves the design before locking schema |
| 3 | **Keep `/builds`, link from ops view** — `/builds` stays as the fulfilment-cycle view; new `/leads` links into it for full build detail | Different jobs: monitor vs fulfil |
| 4 | **Dense table + filters** — one row per lead, ~11 columns, filters at top. Click row → existing `/leads/[id]` | Matches NERVE's terminal aesthetic; fastest to scan at n>30 |

## Recent merged work for context (in case it's useful)

- PR #109 — R1 visual rethink (Section component, sidebar 6→4 groups, dashboard restructure)
- PR #110 — R2 lead 360° (Notes / Embeddings / QaVisual / Stripe panels on /leads/[id])
- PR #111 — R3 ask-the-business chat (scopeLeadSlug + getLeadSourceIds helper + LeadChatPanel)
- PR #112 — R4 business facts (BusinessFact model + ingest + inline UI)
- PR #113 — R5 external RAG API (POST /api/search, /api/ask)
- PR #114 — R6 visual-QA surface (/qa page)
- PR #115 — R7 demos-fix (/demos reads DemoArtefact not DemoRecord — fixed exactly the kind of plumbing drift this plan also addresses)

Pattern: each round = own branch off main, one PR, typecheck clean, CHANGELOG `.md` entry under `CHANGELOG/2026-05/`, audit doc update at `apps/nerve/RETHINK-AUDIT.md`. Follow it.

---

# R8 — UI + live-pull (first PR)

## Row shape

One row per canonical business. Source: prefer `LeadProfile` (SL-MAS, richer); fall back to `LeadRecord` (manual). Dedup via `normaliseName` from `apps/nerve/src/lib/sl-mas/businessIdentityStore.ts` (already used by the current `/leads/page.tsx:128–135`).

| # | Column | Source | Notes |
|---|---|---|---|
| 1 | Business | `LeadProfile.businessName` or `LeadRecord.name` + vertical + postcode/location | Link to `/leads/[id]` |
| 2 | Stage | Latest `LeadAssignmentEvent.status` for this lead's `leadId`; fall back to `LeadRecord.contactedStatus` | Coloured pill (reuse existing StatusPill) |
| 3 | Assigned to | SP display name via Supabase `sales_users` lookup keyed on `LeadAssignmentEvent.userId` | `—` when unassigned |
| 4 | Demo | Did a `DemoArtefact` row exist? Latest `QaVisualResult.hasCritical` flag | Compact ✓/✗/— rendering |
| 5 | Pitches | `PitchLog` count + most recent `outcome` (joined on `businessName`) | Match what `/leads/[id]` already does |
| 6 | Build | Paid? Onboarding completed? Has change requests? → live Supabase via existing `fetchBuilds()` in `apps/nerve/src/lib/supabase-builds.ts` | Link out to `/builds` for detail |
| 7 | Revenue | Sum `StripeEvent.amountTotalPence` per `assignmentId`, joined by `LeadAssignmentEvent.leadId` | `£X.XX` |
| 8 | Last activity | Max of `LeadAssignmentEvent.occurredAt`, `DemoArtefact.generatedAt`, `Note.updatedAt`, `BusinessFact.createdAt`, `PitchLog.date` | `formatDistanceToNow` |
| 9 | Visit time | Sum of Supabase `visits.duration_minutes` for this lead's `assignmentId`s | v1 renders `—` if no rows; R9 reads from NERVE instead |
| 10 | Feedback | Count of `Note.relatedSlug = id AND scope='lead'` + `LeadAssignmentEvent.notes IS NOT NULL` rows | Click → `/leads/[id]#notes` |
| 11 | Flags | has-critical-QA · unassigned · paid-unbuilt · overdue (>7d since paid) | Coloured pills (use the existing pill utility classes from `globals.css`) |

## Filter bar (above table)

Search params drive everything (server-side, no client JS needed):

- `stage` — multi-select pill: `not_contacted` · `contacted` · `pitched` · `sold` · `paid` · `rejected` · `unassigned`
- `vertical` — free-text input
- `sp` — SP display name dropdown (populated from `sales_users` Supabase query)
- `source` — multi-select: SP-sourced vs skill-sourced (`leadProfile.sourceMethod` etc.)
- `flag` — toggle: `only_critical_qa` · `only_paid_unbuilt` · `only_unassigned` · `only_active_onboarding`
- `q` — free-text search on business name + postcode + slug
- Reset button → `/leads`

Filters reuse the URL pattern already in `apps/nerve/src/app/(app)/qa/page.tsx` (search params, no JS).

## Files (R8)

**Replace:**
- `apps/nerve/src/app/(app)/leads/page.tsx` — current implementation is ~140 lines, becomes a thin orchestrator that calls the new query helper + renders the new table component.

**New:**
- `apps/nerve/src/app/(app)/leads/_components/LeadsOpsFilters.tsx` — server component form, reads + writes search params.
- `apps/nerve/src/app/(app)/leads/_components/LeadsOpsTable.tsx` — the dense table. Renders sub-cells via inline helpers (StageCell, DemoCell, BuildCell, FlagsCell). No client components needed; keep static.
- `apps/nerve/src/lib/sl-mas/leadOpsQuery.ts` — single `loadLeadsOps(filters)` function that fans out the ~12 parallel queries (Prisma + Supabase live-pull), zips them into one `LeadOpsRow[]`, applies filters. Pattern matches `qaVisualResultStore.computeBaselines` (single-query helper) and the existing per-page Promise.all in `apps/nerve/src/app/(app)/leads/page.tsx:47–80`.

**Extend:**
- `apps/nerve/src/lib/supabase-builds.ts` — already exports `fetchBuilds()` and `getSupabase()`. Add `fetchSalesUsers()` returning `{ userId: string, displayName: string, areaPostcode?: string }[]` and `fetchVisits(assignmentIds: string[])` returning `{ assignmentId, durationMinutes, startedAt }[]`. Reuse `SUPABASE_SERVICE_ROLE_KEY`.

**Leave untouched:**
- `apps/nerve/src/app/(app)/leads/[id]/page.tsx` — the per-lead 360° (R2/R3/R4 work).
- `apps/nerve/src/app/(app)/leads/new/page.tsx` + `_form.tsx` + `actions.ts` — manual entry path. Still works.
- `apps/nerve/src/app/(app)/builds/page.tsx` — separate, linked from the new view's Build column.

## Existing primitives to reuse

- `normaliseName` from `apps/nerve/src/lib/sl-mas/businessIdentityStore.ts` — already used in `/leads/page.tsx:128–135` for the manual-vs-SL-MAS dedup.
- `PageHeader` from `apps/nerve/src/components/PageHeader.tsx` — every page uses this.
- `Section` from `apps/nerve/src/components/Section.tsx` — R1 component, wrap each table in a Section with a framer line.
- `StatTile` from `apps/nerve/src/components/StatTile.tsx` — for the row of summary tiles above the filter bar.
- `PhasePill` / `StatusPill` from `apps/nerve/src/components/PhasePill.tsx` — for the Stage column pill.
- `cn` from `apps/nerve/src/lib/cn.ts` — class merger.
- `fetchBuilds()` + `getSupabase()` from `apps/nerve/src/lib/supabase-builds.ts` — Supabase service-role client. Extend with the two new helpers; don't reinvent.
- `pitchBriefStore`, `siteBriefStore`, etc. from `apps/nerve/src/lib/sl-mas/*.ts` — only if needed; the row data above is mostly groupBy counts that don't need per-store helpers.

## Sketch of the page structure

```tsx
// apps/nerve/src/app/(app)/leads/page.tsx
import { loadLeadsOps } from "@/lib/sl-mas/leadOpsQuery";

export default async function LeadsPage({ searchParams }) {
  const data = await loadLeadsOps(searchParams);
  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Leads" subtitle="..." />
      <Section title="state of play" framer="...">
        <StatTile grid: total · assigned · in-pitch · paid · unbuilt · flagged />
      </Section>
      <Section title="all leads" framer="...">
        <LeadsOpsFilters value={searchParams} options={data.filterOptions} />
        <LeadsOpsTable rows={data.rows} />
      </Section>
    </div>
  );
}
```

## Verification (R8)

```bash
cd apps/nerve && npx tsc --noEmit   # must be clean
```

On Vercel preview:
1. `/leads` renders the new dense table with one row per business (no duplicate manual+SL-MAS rows for the same business).
2. `?stage=pitched` filters to pitched leads only.
3. `?sp=<display-name>` filters to that SP's assigned leads only.
4. `?flag=only_critical_qa` filters to leads with the latest `QaVisualResult.hasCritical = true`.
5. SP names render (proves the live Supabase pull works). When `SUPABASE_SERVICE_ROLE_KEY` is unset locally, the SP column degrades to `—` cleanly.
6. Build column shows "paid · unbuilt" or "paid · onboarding" or "—" matching what `/builds` shows.
7. Click any row → `/leads/[id]` (R2's per-lead view).
8. Sidebar count badge for "Lead Intelligence" remains correct (it currently uses `leadRecord.count()` in `(app)/layout.tsx` — that's fine, doesn't need touching here).

---

# R9 — Visit + feedback ingest (second PR, after R8 lands)

> **Don't start R9 in the same session as R8.** The fresh session ships R8 only; come back for R9.

## Goal

Move SP visit data + structured per-visit feedback off live Supabase reads and into NERVE Postgres so:

- `/leads` ops view doesn't depend on Supabase being reachable from Vercel.
- The data is queryable by `/ask`, `/search`, and the per-lead scoped chat (R3).
- A `VisitEvent` row in NERVE means we can attribute SP time-on-business and outcome correlation in cohort analyses.

## Schema (migration `26_visit_events`)

```prisma
model VisitEvent {
  id              String   @id @default(cuid())
  eventId         String   @unique @map("event_id")     // producer-supplied natural key
  assignmentId    String   @map("assignment_id")        // Supabase lead_assignments.id
  leadId          String   @map("lead_id")              // slug
  userId          String   @map("user_id")              // sales_users.id
  type            String                                // "arrived" | "departed" | "pitched" | "feedback"
  durationMinutes Int?     @map("duration_minutes")     // populated on "departed"
  latitude        Float?
  longitude       Float?
  feedback        String?                               // free-form per-visit note
  rating          Int?                                  // 1-5 SP impression of the lead
  metadata        Json     @default("{}")
  occurredAt      DateTime @map("occurred_at")
  createdAt       DateTime @default(now()) @map("created_at")

  @@index([leadId, occurredAt(sort: Desc)])
  @@index([assignmentId, occurredAt(sort: Desc)])
  @@index([userId, occurredAt(sort: Desc)])
  @@index([type, occurredAt(sort: Desc)])
  @@map("visit_events")
}
```

## Files (R9)

**New:**
- `apps/nerve/prisma/migrations/26_visit_events/migration.sql`
- `apps/nerve/src/lib/sl-mas/visitEventStore.ts` — wire-type + `ingest`, `listForLead`, `listForAssignment`, `aggregateForLead` (sum minutes).
- `apps/nerve/src/app/api/ingest/visit-event/route.ts` — HMAC POST, same pattern as `apps/nerve/src/app/api/ingest/business-fact/route.ts`. Auto-embeds with `sourceType = "VisitEvent"` so feedback chunks reach `/ask`.

**Modified:**
- `apps/nerve/prisma/schema.prisma` — add `VisitEvent` model next to `LeadAssignmentEvent`.
- `apps/nerve/src/lib/sl-mas/leadEmbeddings.ts` — include `VisitEvent.id`s for leads in `getLeadSourceIds`.
- `apps/nerve/src/lib/sl-mas/leadOpsQuery.ts` — switch the visit-time + feedback-count cells from Supabase live-pull to `visitEventStore`. Fall back to Supabase if the NERVE table is empty (so R9 ships safely before producer wire-up completes).

**Producer wire-up (separate, in mobile-api / sales-dashboard repos):**
- mobile-api `POST /visits` and `PATCH /visits/:id` handlers fire-and-forget a NERVE ingest call after the local write succeeds. Use the same `OUTCOME_INGEST_SECRET` pattern. Sketch the curl in the R9 changelog.

## Out of scope for R9

- Backfill of historical Supabase visit data into NERVE. If wanted, write a one-off script under `apps/nerve/scripts/backfill-visit-events.ts` modelled on `apps/nerve/scripts/backfill-business-identities.ts`.
- Removing the Supabase live-pull from `/leads` ops view entirely. R9 keeps it as a fallback for the few-week period while the ingest stabilises.

## Verification (R9)

```bash
cd apps/nerve && npx prisma generate && npx tsc --noEmit
```

On Vercel preview:
1. Migration applies (Vercel build script runs `prisma migrate deploy`).
2. Signed curl to `/api/ingest/visit-event` returns 200 with a sample payload; unsigned returns 401.
3. After a manual ingest of one row for an existing lead, `/leads` ops view shows the visit time / feedback count from NERVE Postgres.
4. `/ask` scoped to that lead returns chunks that include the visit feedback text.

---

## Why this shape (one-paragraph rationale)

- **Replace `/leads`, don't add a URL**: existing muscle memory + nav real-estate.
- **Live-pull first, ingest later**: the data already exists in Supabase. Build the visual first to prove the design, then lock the schema in R9.
- **Keep `/builds` separate**: `/builds` is a focused 7-day fulfilment view with photos and copy-pasteable customer contact info. Different job from "monitor every lead in the pipeline."
- **Dense table over Kanban**: matches NERVE's terminal-feel aesthetic and is faster to scan when n > 30. Kanban shines at low-n. NERVE will cross n=30 fast in beta.

## What this plan deliberately doesn't do

- **No dashboard changes**: `/dashboard` already has the "state of play" tiles from R1 and the recent activity feed. Don't duplicate them on `/leads`.
- **No /builds rewrite**: linked-to, not folded-in.
- **No SP profile page**: an `/sp/[id]` page would be a natural next step (SP-side view: their leads, their feedback, their commission). Out of scope.
- **No drag-to-reassign / inline stage edits**: read-only ops surface for v1. Editing happens via the existing assignment flow in the sales-dashboard admin.
