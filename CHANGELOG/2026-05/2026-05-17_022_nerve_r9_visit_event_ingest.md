# NERVE — R9 visit event ingest

**Date:** 2026-05-17
**Scope:** Mirror SP visit data + per-visit feedback from mobile-api into
NERVE Postgres so the R8 leads ops view doesn't depend on Supabase being
reachable from Vercel and so feedback text flows into the RAG vault.
**Branch:** `feat/nerve-r9-visit-event-ingest`
**Base branch:** `main`
**Plan:** `apps/nerve/LEADS-OPS-PLAN.md` § R9.

## What changed

### Schema (migration 26)

- **New** `apps/nerve/prisma/migrations/26_visit_events/migration.sql` — adds
  the `visit_events` table with idempotent natural key `event_id`. Columns:
  `assignment_id`, `lead_id`, `user_id`, `type` (arrived | departed |
  pitched | feedback), `duration_minutes`, `latitude`, `longitude`,
  `feedback`, `rating`, `metadata`, `occurred_at`, `created_at`. Four
  indexes for the dominant query shapes (per-lead timeline, per-assignment
  aggregation, per-SP cohort, per-type filtering).
- **Modified** `apps/nerve/prisma/schema.prisma` — `VisitEvent` model added
  next to `LeadAssignmentEvent` (Phase B family). No `phaseLabel` column;
  the dissertation phase label is derived at embed time from
  `occurred_at` via `phaseLabelFor()` to avoid bloating the event table.

### Files

- **New** `apps/nerve/src/lib/sl-mas/visitEventStore.ts` — wire-type
  contract + `ingest` / `getById` / `listForLead` / `listForAssignment` /
  `aggregateForLead` / `aggregateAcrossLeads`. Pattern mirrors
  `leadAssignmentEventStore` (Phase B1) — append-only, idempotent on
  `event_id`.
- **New** `apps/nerve/src/app/api/ingest/visit-event/route.ts` — HMAC-
  signed POST handler. Shares `OUTCOME_INGEST_SECRET` with the other
  Phase B endpoints (X-Ingest-Signature: sha256=<hex>). Dev bypass via
  `OUTCOME_INGEST_ALLOW_UNSIGNED=true`. Auto-embeds the `feedback` field
  with `sourceType = "VisitEvent"` on the insert path so chunks reach
  `/ask`, `/search`, and the R3 per-lead scoped chat. Embedding failure
  is swallowed (the row stays queryable; embed failure is best-effort).
- **Modified** `apps/nerve/src/lib/sl-mas/leadEmbeddings.ts` —
  `getLeadSourceIds()` now also returns `VisitEvent.id`s where
  `leadId === lead && feedback IS NOT NULL`. R2's EmbeddingsPanel +
  R3's scoped chat both pick up visit feedback chunks for free.
- **Modified** `apps/nerve/src/lib/sl-mas/leadOpsQuery.ts` — visit-time +
  feedback-count cells switched to NERVE-first. `aggregateAcrossLeads()`
  is called once at fan-out time; per-row, if NERVE has any visit events
  for that lead, the row's `visitMinutes` comes from the sum of
  `duration_minutes` and `feedbackCount` adds the `feedback`-row count.
  Supabase's live `fetchVisits()` stays as the fallback for leads with no
  NERVE rows yet — keeps R9 shippable before mobile-api wire-up
  propagates for every lead.

### Producer wire-up (separate, not in this PR)

The mobile-api side fires the NERVE ingest after the local SQLite +
Supabase writes succeed. Sketch (mobile-api repo, not yet wired):

```ts
// apps/mobile-api/src/handlers/visits.ts (after the local write):
const body = JSON.stringify({
  event_id: `${assignmentId}:${type}:${occurredAt.replace(/[:.]/g, "")}`,
  assignment_id: assignmentId,
  lead_id: leadSlug,
  user_id: salespersonId,
  type,                // "arrived" | "departed" | "pitched" | "feedback"
  duration_minutes,    // populated on "departed"
  feedback,            // free-form per-visit note when present
  rating,              // 1-5 SP impression of the lead
  latitude,
  longitude,
  metadata: { source: "mobile-api" },
  occurred_at: occurredAt,
});
const sig = `sha256=${crypto
  .createHmac("sha256", process.env.OUTCOME_INGEST_SECRET!)
  .update(body)
  .digest("hex")}`;
fetch(`${NERVE_BASE_URL}/api/ingest/visit-event`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Ingest-Signature": sig },
  body,
}).catch(() => { /* fire and forget */ });
```

Test curl against the Vercel preview once `OUTCOME_INGEST_SECRET` is set:

```bash
BODY='{"event_id":"a1:feedback:20260517T210000Z","assignment_id":"a1","lead_id":"the-tartan-pig","user_id":"u1","type":"feedback","feedback":"Owner wants the menu photos refreshed","rating":4,"occurred_at":"2026-05-17T21:00:00Z"}'
SIG="sha256=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$OUTCOME_INGEST_SECRET" -hex | awk '{print $2}')"
curl -sS -X POST https://<preview>.vercel.app/api/ingest/visit-event \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Signature: $SIG" \
  -d "$BODY"
```

## Why

R8 shipped the cross-lead ops view but the visit-time + (future) feedback
cells depended on Supabase being reachable from Vercel. That's fragile in
two ways: any Supabase outage blanks the column, and visit feedback never
flowed into the RAG vault so `/ask` couldn't see "what did the SP say
about this customer when they were there." R9 mirrors the data into NERVE
Postgres and auto-embeds the feedback text so both problems disappear.

R9 keeps the Supabase fallback so it's safe to ship before every producer
is wired up.

## Stack

- Next.js 14 App Router (existing)
- Prisma — `VisitEvent` model with the standard create / findUnique /
  findMany aggregation pattern.
- `node:crypto` for HMAC-SHA256 (existing `verifySignature` helper).
- `embedRecord` (existing) targets `sourceType = "VisitEvent"`; no new
  pgvector work.
- No new dependencies.

## Integrations

- Inbound: mobile-api `POST /visits` + `PATCH /visits/:id` (wiring sketched
  above, lives in the mobile-api repo, not in this PR).
- Outbound: none new. NERVE's existing `/ask`, `/search`, and R3 scoped
  chat surface the visit feedback automatically via `getLeadSourceIds()`.

## How to verify

Programmatic:

```bash
cd apps/nerve && npx prisma generate && npx tsc --noEmit   # both clean
```

On the Vercel preview:

1. Migration applies cleanly on Vercel build (`prisma migrate deploy`
    runs in `build` script — check the build log for migration 26).
2. Signed curl above to `/api/ingest/visit-event` returns
   `{"event_id":"…","inserted":true,…}`. Replay the same body — returns
   `inserted:false`.
3. Unsigned curl (omit the header) returns 401.
4. Curl with a bad type ("type":"loitering") returns 400 with the
   expected validation message.
5. `/leads` ops view: the lead the ingest targeted now shows visit
   minutes from NERVE (not `—`, not the Supabase fallback) and its
   feedback count includes the new feedback row.
6. `/ask` scoped to that lead returns chunks that include the visit
   feedback text. (Open `/leads/<slug>`, scroll to LeadChatPanel, ask
   "what did the SP say about the menu photos?")

## Known issues

- Local dev still can't run without `DATABASE_URL` — visual verification
  on the preview.
- Backfill of historical Supabase `visits` rows into NERVE is out of
  scope. If wanted, a one-off script under
  `apps/nerve/scripts/backfill-visit-events.ts` modelled on
  `backfill-business-identities.ts` would do it.
- The Supabase fallback in `leadOpsQuery` stays in place for the few-week
  ingest-stabilisation window. Remove it once mobile-api has propagated
  to every lead — likely a one-line follow-up.
- VisitEvent.feedback embeds only on insert. If a producer re-asserts a
  visit with edited feedback, the embedding stays stale. Acceptable
  today (mobile-api treats visits as immutable); revisit if that changes.
