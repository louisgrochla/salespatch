# 2026-05-11 · NERVE leads index — surface SL-MAS slug leads

## What changed
- `apps/nerve/src/app/(app)/leads/page.tsx`: the listing page now shows two
  sections instead of one:
  1. **SL-MAS leads** (top) — skill-emitted, slug-keyed. Queries
     `prisma.leadProfile.findMany` + group-by counts over `siteBrief`,
     `demoArtefact`, `leadAssignmentEvent`. Columns: business, vertical,
     postcode, ★ rating, IG followers, brief count, demo count, stage
     ("in pipeline" / "demo only"), profiled date.
  2. **Manual lead records** (below) — operator-added, cuid-keyed.
     Preserves the existing source-performance table + LeadRecord listing
     unchanged.
- Both sections link to the same `/leads/[id]` detail page (E1), so SL-MAS
  slugs that were previously only reachable by typing the URL are now
  one click away.
- Added vertical filter on the SL-MAS section via `?vertical=` searchParam
  (dropdown populated from distinct `lead_profiles.vertical` values).
- Page header retitled "Leads" with combined `N SL-MAS · M manual` subtitle.

## Why
Closes the loop on E1. E1 built the detail page but didn't expose
slug-only leads anywhere in NERVE's navigation — they were only reachable
by knowing the slug. The summer beta operator surface needs to *find* a
lead before drilling into it. This is the missing rung.

Per leverage principle agreed this morning: ship things that close a
usage loop now, not things that sit dormant.

## Stack
Next.js 14 server component, Prisma group-by queries (3 of them, joined
in JS via Map lookups). No new dependencies. Reuses existing Tailwind
tokens + `nv-table` styles.

## Integrations
- `prisma.leadRecord.findMany` / `.groupBy` (existing)
- `prisma.leadProfile.findMany` (new on this page)
- `prisma.siteBrief.groupBy by leadId` (new)
- `prisma.demoArtefact.groupBy by leadId` (new)
- `prisma.leadAssignmentEvent.groupBy by leadId` (new)

## How to verify
1. Open `https://nerve.salespatch.co.uk/leads`
2. Expect: SL-MAS section at top listing the bulk-smoke seed slugs
   (`source-barber`, `riverside-cafe`, `ace-bakery`, etc.) with brief +
   demo counts populated and stage column showing "demo only" or
   "in pipeline"
3. Click any SL-MAS row → lands on the E1 detail page for that slug
4. Manual section below still shows existing LeadRecord rows with the
   source-performance table on top, unchanged
5. `?vertical=barber` filters the SL-MAS section only

## Known issues
- The group-by queries scan the full SL-MAS tables on every page load. At
  current data volume (10-ish leads) that's free. If `lead_profiles` grows
  past a few thousand rows the page will get slow — at that point swap to
  a materialised view or a denormalised counter column.
- SL-MAS section doesn't honour the `?status=` / `?source=` filters used
  by the manual section (those columns don't exist on lead_profiles).
- Leads that have site_briefs / demos but NO lead_profile won't appear
  in the SL-MAS section (lead_profiles is the base table). Today this
  shouldn't happen — all producer skills write a profile first — but
  worth knowing.
