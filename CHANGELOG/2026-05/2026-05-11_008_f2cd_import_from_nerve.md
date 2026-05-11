# F2(c) + F2(d) — Import-from-NERVE + SP picker, fused into one PR

## What changed
- `apps/nerve/src/app/api/read/lead-bundle/route.ts` — new HMAC GET
  endpoint. Returns the full bundle for one slug in a single payload:
  `business_identity` (F1 canonical) + `site_brief` (with full
  markdown) + `demo_artefact` (with full inline HTML) + `pitch_brief`
  (lead-card surface from /lead-json) + `brand_analysis` (palette +
  typography) + `lead_profile` (contact info + reviews) +
  `qa_result` (latest score for the artefact). Independent of the
  F2(a) `/api/read/pending-assignments` listing — that one strips
  bodies to keep the queue fast; this one ships everything because
  the import path needs it. 404 if no slug data exists in any
  Phase A/B store. Same canonical-query HMAC pattern as every
  other `/api/read/*` endpoint.
- `apps/nerve/src/app/api/public/demo/[slug]/route.ts` — new
  **public** demo route. Returns the latest `demo_artefact.html_inline`
  for a slug as raw `text/html`. Sits under `/api/public/*` (already
  exempted by middleware). No auth — sales-pitch demos are designed
  to be shareable URLs the SP hands to the customer at the door.
  Self-contained HTML by /build-demo convention (inline CSS + JS +
  data: image embeds) so no asset fetches escape the route. 404
  HTML response when the slug has no demo yet.
- `apps/admin-panel/src/app/api/leads/import-from-nerve/route.ts` —
  new POST handler. Body `{ slug, user_id }`. Validates the
  salesperson exists + is active, rejects if the slug already has a
  non-rejected assignment, fetches the bundle from NERVE via the
  existing `nerveGet` HMAC helper, maps it into a `notes` JSON shape
  matching the sales-dashboard manual `/api/admin/leads` POST (so
  iOS + sales-dashboard render the lead identically regardless of
  source), and inserts `lead_assignments` + `sales_activity_log`
  rows in one tx. Uses the canonical slug as `lead_id` — that's the
  join key NERVE recognises, so the existing B1 producer's status
  events trace back to the demo_artefact / pitch_brief on the same
  key. `demo_site_domain` points at
  `https://nerve.salespatch.co.uk/api/public/demo/<slug>` so the SP
  has a real working URL with zero Supabase upload plumbing.
- `apps/admin-panel/src/app/leads/queue/page.tsx` — adds an SP picker
  dropdown + wires the Assign button on each card. Fetches the team
  via `/api/team` on mount (filtered to `active=true`) and exposes
  `name · area · N active` per option. Click Assign →
  POST `/api/leads/import-from-nerve` → success banner with "Open
  demo" link → queue + team refresh. Per-card error inline if the
  POST fails (invalid SP, NERVE down, duplicate, etc).

## Why
Closes F2 — the operator pipeline from "/build-demo finished in
Claude Code" to "salesperson sees the lead in their app" is now one
click instead of: download submit folder → open admin manual upload
form → drag photos → paste 25 fields → upload demo to Supabase →
pick SP → save. The submit folder becomes audit-only on disk.

Fused F2(c) and F2(d) into one PR per the user's "or fuse into one
PR if scope feels tight" option. They share the lead_assignments
schema gap (`user_id NOT NULL` so import without assign has no home
in the current schema), so splitting them would have meant shipping
an import API with no caller for ~24 hours. Tighter as one ship.

Day-1 leverage: the founder can run /build-demo on a lead in Claude
Code, open admin /leads/queue, pick an SP from the dropdown, click
Assign, and the SP sees the lead in their dashboard. No file
shuffling, no copy-paste, no separate Supabase upload step.

## Stack
- NERVE side: Next.js 14 App Router routes, Prisma stores from
  Phase A (siteBriefStore, demoArtefactStore, brandAnalysisStore,
  leadProfileStore, qaResultStore), pitchBriefStore (capture
  enrichment), businessIdentityStore (F1). `node:crypto` for HMAC
  verification.
- Admin side: Next.js 14 App Router, better-sqlite3 via existing
  `@/lib/db` helpers (`run` + `queryOne` + `transaction`). Existing
  `nerve-read.ts` HMAC GET helper from F2(b). `lucide-react` for
  icons.
- No new dependencies. No DB migrations.

## Integrations
- `OUTCOME_INGEST_SECRET` shared between NERVE (signs/verifies
  ingest + read endpoints) and admin-panel (signs read calls). Set
  in Vercel admin-panel project before F2(b) shipped; same env
  works for F2(c).
- `NERVE_BASE_URL` defaults to `https://nerve.salespatch.co.uk` in
  both apps. Used by admin import handler to build the
  `demo_site_domain` URL pointed at NERVE's public demo route.
- Sales-dashboard + iOS read `notes.demo_site_domain` from
  `lead_assignments` — they treat the NERVE-served demo URL the
  same way they treat a Supabase-hosted one. No changes needed on
  the consumer side.

## How to verify
1. `cd apps/nerve && npx tsc --noEmit` — clean ✓
2. `cd apps/admin-panel && npx tsc --noEmit` — clean ✓
3. `cd apps/admin-panel && npx next build` — clean ✓ (admin-panel
   builds fully; NERVE has pre-existing prerender errors on
   `/login` + `/supervisor/login` from missing NEXTAUTH_URL at
   build time, unrelated to this PR. All new routes are `force-dynamic`
   so unaffected.)
4. After Vercel deploy:
   - GET `https://nerve.salespatch.co.uk/api/public/demo/jp-nail-lash-brow-studio`
     returns the rendered demo HTML in the browser.
   - HMAC GET `/api/read/lead-bundle?slug=jp-nail-lash-brow-studio`
     via `~/.claude/scripts/nerve/get-ingest.sh` returns the full
     bundle JSON (site_brief, demo_artefact with html_inline,
     pitch_brief, brand_analysis, lead_profile, qa_result, business_identity).
   - Open admin `/leads/queue`. JP Nail card has a dropdown listing
     active SPs. Pick one, click Assign. Success banner appears,
     card disappears from queue, lead shows up in `/leads` for that
     SP with all the pitch-brief surface fields populated.
   - Hit the same card a second time → 409 "Lead already assigned".
5. B1 trace: after the assign, the SP can flip the lead's status
   (new → visited → pitched) from sales-dashboard. The existing B1
   producer fires `postLeadAssignmentEvent` with `lead_id=<slug>`.
   NERVE's lead_assignment_events table records the events keyed
   on the same slug as the demo_artefact, so `/leads/<slug>` on
   NERVE shows the full timeline in one view.

## Known issues
- The two Verify Test Cafe stubs from the May 10 simulate-ingest.sh
  runs are still in the queue. They can be assigned, but they
  contain no real demo content (test fixtures), so the SP would
  see "Demo not found" on /api/public/demo/. Acceptable today —
  flagged in the queue UI with "slug only" amber badge. Bulk-reject
  affordance is not in scope for this PR.
- The /api/public/demo route has no rate limit and is anonymously
  accessible. Sales-pitch demos are designed to be shareable, but
  this means anyone who guesses a slug can read the demo HTML. For
  the current scale (single founder, manual lead production) this
  is fine; future hardening could add a HMAC-signed URL or short
  TTL token if a lead's contents become genuinely sensitive.
- `lead_assignments.contact_name` / `contact_role` columns are
  populated indirectly via `notes.contact_name` / `notes.contact_role`
  in the import handler — the admin-panel local SQLite schema
  doesn't declare those columns (sales-dashboard adds them when
  it owns the DB), and we don't want admin-panel's CREATE TABLE
  IF NOT EXISTS to diverge from the shared schema. Reading via
  notes JSON keeps both code paths happy.
- F1 backfill still not run in prod — same caveat as F2(a)/F2(b).
  Pre-F1 producer rows lazily fill via `lookupOrCreate` on next
  producer hit; non-blocking.
