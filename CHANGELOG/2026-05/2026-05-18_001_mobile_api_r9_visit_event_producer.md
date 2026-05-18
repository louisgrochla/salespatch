# mobile-api — R9 visit event producer

**Date:** 2026-05-18
**Scope:** Wire the mobile-api visits handlers to fire NERVE's R9
`POST /api/ingest/visit-event` after the local SQLite write succeeds, so
the /leads ops view + RAG vault populate without depending on Supabase
being reachable from Vercel.
**Branch:** `feat/mobile-api-r9-visit-event-producer`
**Base branch:** `main`
**Pairs with:** `CHANGELOG/2026-05/2026-05-17_022_nerve_r9_visit_event_ingest.md`
("Producer wire-up" section).

## What changed

### Files

- **New** `apps/mobile-api/src/nerve-visit-forwarder.ts` — fire-and-forget
  producer. Mirrors the existing `nerve-forwarder.ts` pattern but targets
  the Phase B HMAC contract (`X-Ingest-Signature: sha256=<hex>`,
  `OUTCOME_INGEST_SECRET`). Exports `forwardVisitEventToNerve(payload)`
  and the canonical `buildVisitEventId(assignmentId, type, occurred_at)`
  helper so the event_id format stays in one place.
- **Modified** `apps/mobile-api/src/routes/visits.ts` — `POST /visits/start`
  emits an `arrived` event, `POST /visits/end` emits a `departed` event
  with `duration_minutes = round(duration_seconds / 60)`. Both look up
  the `lead_id` on `lead_assignments` to satisfy NERVE's required field,
  attach GPS when present, and tag the metadata with
  `{ source: "mobile-api", session_id }`. Forward calls are `void`-prefixed
  — never awaited on the request path.

### Skipped on purpose

- `pitched` and `feedback` event types are out of scope here. They live
  on different handlers (`PATCH /leads/:id/status` + `POST /leads/:id/intel`
  / `POST /leads/:id/pitch`); the R9 changelog brief was specifically the
  visits side. Follow-up will wire those once feedback capture lands.
- No backfill of historical `visit_sessions` rows — NERVE's R8 fallback
  to Supabase `fetchVisits()` covers that window.

## Why

R9 NERVE-side shipped 2026-05-17 with the schema, ingest endpoint, and
ops/embeddings consumers, but kept Supabase as the visit-time fallback
because no producer was wired up yet. This commit fills that gap for the
two highest-volume event types so the /leads ops view starts reading
NERVE-first for any lead a salesperson visits going forward.

Fire-and-forget is the right shape: a flaky NERVE deploy or a 5xx blip
must not regress the SP's local visit recording or block the response.

## Stack

- Express 4 (existing)
- `node:crypto` HMAC-SHA256 (matches the existing nerve-forwarder)
- `fetch` (Node 18+ global, already used by nerve-forwarder)
- No new dependencies.

## Integrations

- Outbound: `NERVE_VISIT_EVENT_URL` (default
  `https://nerve.salespatch.co.uk/api/ingest/visit-event`).
- Secret: `OUTCOME_INGEST_SECRET` (already shared with the other Phase B
  endpoints). When missing, the forwarder silently no-ops — local writes
  remain the source of truth.

## How to verify

Programmatic:

```bash
cd apps/mobile-api && npx tsc --noEmit
# 4 pre-existing payments.ts errors only (unrelated — packages/stripe +
# packages/supabase paths are missing on main as well).
```

End-to-end against a NERVE preview:

1. Export `OUTCOME_INGEST_SECRET=<preview value>` and
   `NERVE_VISIT_EVENT_URL=https://<preview>.vercel.app/api/ingest/visit-event`
   in the mobile-api env.
2. `POST /visits/start` with a real `assignment_id` → server returns
   201 immediately; tail the NERVE preview logs and confirm the
   `arrived` row lands in `visit_events`.
3. `POST /visits/end` with the returned `session_id` → server returns
   `{ ok: true, duration_seconds, verified }`; NERVE `visit_events`
   gains a matching `departed` row with `duration_minutes` populated.
4. `/leads` ops view in NERVE shows visit minutes for that lead from
   NERVE (the column source flips off the Supabase fallback once any
   NERVE row exists for the lead — see R8's `leadOpsQuery`).
5. Replay the same `POST /visits/start` (re-fire by inspecting
   network) — the second call would produce a different event_id only
   if `occurred_at` shifts; for a fixed timestamp NERVE returns
   `inserted: false`. Idempotency is on `event_id`, so the
   timestamp-bearing event_id makes a same-second replay collapse.

## Known issues

- `pitched` + `feedback` events are not yet emitted. The /leads ops
  view's `feedbackCount` column stays on the Supabase fallback until
  those producers are wired in a follow-up.
- The forwarder no-ops when `OUTCOME_INGEST_SECRET` is unset rather
  than logging. That's deliberate (we don't want noisy logs in dev) but
  if it causes "where are my events" confusion, swap the silent path
  for a once-per-process warning.
- Node's global `fetch` (≥18) is assumed, matching the existing
  `nerve-forwarder.ts` usage. If mobile-api ever needs to run on an
  older runtime the import would need to change.
