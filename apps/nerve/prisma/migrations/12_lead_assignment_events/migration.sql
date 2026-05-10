-- Lead assignment events — Tier 2 funnel timeline.
--
-- B1 of Phase B. Append-only mirror of every status flip on Supabase
-- `lead_assignments`. Lets NERVE answer funnel questions the closed-
-- pitch-only `pitch_log` can't (visited→pitched conversion, per-SP
-- timing, leads that got visited but never pitched).
--
-- Producers: `apps/sales-dashboard/src/app/api/leads/[id]/status/route.ts`
-- and `.../pitch/route.ts` cascade. Both fire-and-forget — Supabase
-- write is source of truth, NERVE post failure never breaks the flip.
--
-- Idempotency: caller-supplied `event_id` = `<assignment_id>:<status>:
-- <iso_no_colons>`. Retries collapse onto the same row.
--
-- Status set: new | visited | pitched | sold | rejected (matches
-- knowledge/contracts/shared-enums.md AssignmentStatus). No CHECK
-- constraint at the DB level — kept loose so a future enum addition
-- doesn't require a migration; ingest route validates the set.

CREATE TABLE "lead_assignment_events" (
    "id"                       TEXT             NOT NULL,
    "event_id"                 TEXT             NOT NULL, -- caller-supplied idempotency key
    "assignment_id"            TEXT             NOT NULL, -- Supabase lead_assignments.id
    "lead_id"                  TEXT             NOT NULL, -- slug
    "user_id"                  TEXT, -- sales_users.id; null on system-initiated reopens
    "prev_status"              TEXT, -- null on the assignment's first event
    "status"                   TEXT             NOT NULL,
    "transition"               TEXT             NOT NULL, -- "prev_status→status" computed by caller
    "source"                   TEXT             NOT NULL DEFAULT 'status_patch', -- "status_patch" | "pitch_cascade" | "supabase_poll" | "backfill"
    "rejection_reason"         TEXT, -- populated when status=rejected
    "commission_amount_pence"  INTEGER, -- populated when status=sold
    "notes"                    TEXT,
    "latitude"                 DOUBLE PRECISION,
    "longitude"                DOUBLE PRECISION,
    "metadata"                 JSONB            NOT NULL DEFAULT '{}'::jsonb,
    "occurred_at"              TIMESTAMP(3)     NOT NULL,
    "created_at"               TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_assignment_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_assignment_events_event_id_key"           ON "lead_assignment_events" ("event_id");
CREATE INDEX        "lead_assignment_events_assignment_idx"         ON "lead_assignment_events" ("assignment_id", "occurred_at" DESC);
CREATE INDEX        "lead_assignment_events_lead_idx"               ON "lead_assignment_events" ("lead_id",       "occurred_at" DESC);
CREATE INDEX        "lead_assignment_events_user_idx"               ON "lead_assignment_events" ("user_id",       "occurred_at" DESC);
CREATE INDEX        "lead_assignment_events_status_idx"             ON "lead_assignment_events" ("status",        "occurred_at" DESC);
CREATE INDEX        "lead_assignment_events_transition_idx"         ON "lead_assignment_events" ("transition");
