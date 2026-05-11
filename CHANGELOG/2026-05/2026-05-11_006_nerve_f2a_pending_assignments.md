# F2(a) — Pending-assignments read endpoint

## What changed
- `apps/nerve/src/app/api/read/pending-assignments/route.ts` — new
  HMAC-signed GET endpoint. Returns NERVE-built leads that have a
  `demo_artefact` row but no `lead_assignment_events` row yet — the
  queue of leads ready for admin to assign to an SP.

## Why
First piece of F2 (admin queue + import-from-NERVE). The admin-panel
queue page (next PR) consumes this endpoint server-side via HMAC to
populate the pending-assignments view. Today's flow ("drag submit
folder into the New Lead form") will be replaced by "open
/leads/queue → click Assign" once PR 2 lands.

Endpoint design:
- **Dedup against canonical BusinessIdentity (F1).** If two slug
  variations both produced demos for the same physical business, only
  the one with the latest demo surfaces.
- **Lean payload.** Card-renderable fields only (business name,
  vertical, postcode, latest demo timestamp, demo count, QA score,
  pitch hook, diagnosis, pitch angle, brand swatch). Full HTML and
  markdown bodies stay in NERVE; the import handler (PR 2) re-queries
  with the `latest_artefact_id` / `latest_brief_id` /
  `latest_pitch_brief_id` returned in each card.
- **Optional vertical filter** + configurable limit (default 50,
  max 200).

The N+1 enrichment loop (latest demo + identity + brief + pitch brief +
QA per pending slug) is fine at single-operator scale where the queue
is < 50 leads. If it grows past ~200 a single grouped SQL with
explicit joins will replace it.

## Stack
- Next.js 14 app-router route handler
- Same HMAC pattern as `/api/read/strategies`,
  `/api/read/lead-profiles/winning-features`, and
  `/api/read/business-identity/lookup`
- Reads from existing stores (`demoArtefactStore`, `siteBriefStore`,
  `pitchBriefStore`, `qaResultStore`, `businessIdentityStore`) + one
  direct `leadProfile` lookup for IG + Google fields. No schema
  change.

## Integrations
- Endpoint exempted from NextAuth middleware via the existing
  `/api/read/*` matcher rule.
- Shares `OUTCOME_INGEST_SECRET` with the rest of the read endpoints.
- Admin-panel will need that secret in its env to call this endpoint
  server-side; PR 2 documents the env wire-up.

## How to verify
1. `cd apps/nerve && npm run typecheck` clean (verified locally ✅)
2. After Vercel deploys, smoke-test from local:
   ```bash
   ~/.claude/scripts/nerve/get-ingest.sh /api/read/pending-assignments
   ```
   Expect HTTP 200 + a `pending` array. With JP Nail (which is
   currently the only NERVE-built lead with a demo and no assignment),
   the response should contain one card with `canonical_slug=jp-nail`,
   `latest_artefact_id=jp-nail-demo-2026-05-11T154808Z`, `qa_score=100`.
3. With vertical filter:
   ```bash
   ~/.claude/scripts/nerve/get-ingest.sh /api/read/pending-assignments "vertical=grooming"
   ```
4. With limit:
   ```bash
   ~/.claude/scripts/nerve/get-ingest.sh /api/read/pending-assignments "limit=5"
   ```

## Known issues
- The card payload doesn't include the full demo HTML. Intentional —
  the import handler in PR 2 reads it server-side via a separate
  request (or directly from `demoArtefactStore.getByArtefactId` if
  admin-panel embeds NERVE as a library). Keeps the queue listing
  cacheable and tiny.
- Postcode in the card prefers canonical identity → lead_profile →
  site_brief → pitch_brief in that order. The dedup-key postcode
  (canonical) is the most authoritative; the others are fallbacks for
  pre-F1 rows.
- PR 2 (admin queue page + import handler in admin-panel) is the next
  session's work. PR 3 (assign action wiring) follows.
