# F2 fix — fire B1 producer on import so queue dedupes

## What changed
- `apps/sales-dashboard/src/lib/nerve-ingest.ts` — add `nerve_import`
  to the `LeadAssignmentEventSource` union.
- `apps/nerve/src/lib/sl-mas/leadAssignmentEventStore.ts` — mirror the
  same `nerve_import` addition on the NERVE side. The ingest validator
  doesn't enforce the source value (any string is accepted), but the
  type union keeps producers honest.
- `apps/sales-dashboard/src/app/api/admin/import-from-nerve/route.ts` —
  after the Supabase/SQLite `lead_assignments` insert succeeds, fire
  `postLeadAssignmentEvent` with `prev_status=null`, `status='new'`,
  `source='nerve_import'`, `metadata={ imported_by, nerve_artefact_id,
  nerve_brief_id, nerve_pitch_brief_id }`. Fire-and-forget — never
  blocks the response; the Supabase row is already written and the SP
  sees the lead regardless of whether NERVE's ingest succeeded.

## Why
F2 import had a queue-dedupe defect — the import handler only wrote to
Supabase `lead_assignments`, but the F2 queue endpoint
(`/api/read/pending-assignments` in NERVE) excludes leads based on the
NERVE `lead_assignment_events` table. With no event fired on import,
assigned leads stayed in the queue forever.

Confirmed live earlier today: JP Nail was assigned to a salesperson
~30 minutes before this fix, then re-queried `/api/read/pending-assignments`
showed `total=1, slug=jp-nail` — exactly what should NOT happen.

This is a one-edit fix: import handler now mirrors the same producer
pattern the B1 status/pitch handlers use, just with the initial `new`
status as the seed event. No schema change; no migration; no behaviour
change for the existing B1 paths.

## Stack
- `crypto.randomUUID` for the assignmentId (existing).
- `buildEventId(assignmentId, status, occurredAt)` helper from
  `nerve-ingest.ts` for idempotency on retry.
- `postLeadAssignmentEvent` HMAC POST helper. Reuses `OUTCOME_INGEST_SECRET`
  already set in the sales-dashboard Vercel project.

## Integrations
- NERVE `/api/ingest/lead-assignment` — same endpoint the existing B1
  status_patch + pitch_cascade producers post to.
- F2 `/api/read/pending-assignments` queue listing — once the new
  event row exists, the queue dedups on next refresh.

## How to verify
1. `cd apps/sales-dashboard && npx tsc --noEmit` — clean (one
   pre-existing `resend` not-found in `src/lib/email.ts`, unrelated).
2. `cd apps/sales-dashboard && npx next build` — clean ✓.
3. `cd apps/nerve && npx tsc --noEmit` — clean.
4. After Vercel deploy:
   - Assign a lead from the admin queue. Expected: lead disappears
     from the queue on next refresh (within 5s — the queue route is
     no-store cached).
   - Confirm via HMAC GET `/api/read/lead-bundle?slug=<slug>` that
     the lead still has all its NERVE bundle data intact.
   - Confirm via NERVE `/leads/<slug>` page that the assignment
     timeline now has the `*→new` event with `source='nerve_import'`
     and the `metadata` block carrying the artefact/brief IDs.

## Known issues
- JP Nail still sits in the queue right now because the assignment
  fired BEFORE this fix shipped. After this deploys, a fresh assign
  on a different lead will dedup correctly. To clean up JP Nail
  retroactively the simplest path is: have the SP reject the
  assignment (status flips to `rejected` → B1 fires `*→rejected` →
  queue excludes it). Alternative: insert a manual `lead_assignment_event`
  row in NERVE for JP Nail via SQL (event_id arbitrary, status='new',
  source='backfill').
- Separate defect — pitch_brief field — not addressed in this PR.
  When `/lead-json` is skipped on a lead before assignment, the
  SP's playbook surface (hook, opener, services, hero_headline,
  cta_text, demo_moments, brand_colours, trust_badges) lands empty
  on their phone because every one of those fields sources from
  `pitch_brief` in the bundle. Fix: run `/lead-json` as part of
  the pipeline. No code change needed on the import handler — the
  bundle mapper does the right thing when pitch_brief is non-null.
