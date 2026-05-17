-- R9 (visit events): SP visit timeline + structured per-visit feedback
-- mirrored from mobile-api into NERVE Postgres. R8 introduced the leads
-- ops view but the visit-time and feedback columns relied on a live
-- Supabase pull from `visits`; R9 lets NERVE serve those columns from
-- its own table so /leads doesn't fail when Supabase is unreachable from
-- Vercel and so feedback text auto-embeds into the RAG vault.
--
-- Producer: `apps/mobile-api/src/handlers/visits.ts` POST/PATCH fire-
-- and-forget a NERVE ingest after the local write succeeds. Same
-- `OUTCOME_INGEST_SECRET` HMAC pattern as the other Phase B ingests
-- (lead_assignment_events, stripe_events, salesperson_events). NERVE
-- failure must not surface to the SP.
--
-- Idempotency: `event_id` is caller-supplied, conventional format
-- `<assignmentId>:<type>:<iso_no_colons>`. Retries collapse onto the
-- same row. Multiple legitimate visits of the same type to the same
-- assignment (e.g. two "arrived" events on different days) produce
-- distinct rows because the timestamps differ.
--
-- Type set: "arrived" | "departed" | "pitched" | "feedback". The R9
-- aggregator sums `duration_minutes` across all "departed" events for
-- a given assignment to compute "time at the business". Free-form
-- `feedback` text is also embedded with `sourceType = "VisitEvent"` so
-- `/ask` retrieves it per-lead via the R3 scoped-chat allow-list.
--
-- Indexes:
--   - (lead_id, occurred_at DESC): per-lead visit timeline
--   - (assignment_id, occurred_at DESC): per-assignment aggregation
--   - (user_id, occurred_at DESC): per-SP cohort analytics
--   - (type, occurred_at DESC): type-scoped queries (e.g. all "feedback")

CREATE TABLE "visit_events" (
  "id"               TEXT PRIMARY KEY,
  "event_id"         TEXT NOT NULL,
  "assignment_id"    TEXT NOT NULL,
  "lead_id"          TEXT NOT NULL,
  "user_id"          TEXT NOT NULL,
  "type"             TEXT NOT NULL,
  "duration_minutes" INTEGER,
  "latitude"         DOUBLE PRECISION,
  "longitude"        DOUBLE PRECISION,
  "feedback"         TEXT,
  "rating"           INTEGER,
  "metadata"         JSONB NOT NULL DEFAULT '{}',
  "occurred_at"      TIMESTAMP(3) NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "visit_events_event_id_key"
  ON "visit_events" ("event_id");

CREATE INDEX "visit_events_lead_id_occurred_at_idx"
  ON "visit_events" ("lead_id", "occurred_at" DESC);

CREATE INDEX "visit_events_assignment_id_occurred_at_idx"
  ON "visit_events" ("assignment_id", "occurred_at" DESC);

CREATE INDEX "visit_events_user_id_occurred_at_idx"
  ON "visit_events" ("user_id", "occurred_at" DESC);

CREATE INDEX "visit_events_type_occurred_at_idx"
  ON "visit_events" ("type", "occurred_at" DESC);
