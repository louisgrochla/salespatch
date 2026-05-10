-- Salesperson events — Tier 2 SP lifecycle.
--
-- B3 of Phase B. Append-only mirror of every meaningful SP lifecycle
-- event: signup, profile edits, Stripe Connect setup, PIN reset,
-- deactivation. Lets the warehouse answer per-SP timeline questions
-- without having to read the sales-dashboard SQLite + Supabase split.
--
-- Producers: sales-dashboard signup handler, admin profile-edit
-- handler, payments-connect handler. All fire-and-forget after the
-- source-of-truth write succeeds.
--
-- Idempotency: `event_id` = `<user_id>:<type>:<iso_no_colons>`.
-- Retries collapse onto the same row.
--
-- Generic shape (type + denormalised fields + JSONB metadata) matches
-- the lead_assignment_events / stripe_events template — keeps the
-- schema small while letting new event types land without a migration.

CREATE TABLE "salesperson_events" (
    "id"                  TEXT             NOT NULL,
    "event_id"            TEXT             NOT NULL, -- caller-supplied idempotency key
    "user_id"             TEXT             NOT NULL, -- sales_users.id
    "type"                TEXT             NOT NULL, -- "signup" | "profile_update" | "stripe_connect_created" | ...
    "display_name"        TEXT, -- denormalised so analytics doesn't have to join
    "area_postcode"       TEXT,
    "stripe_connect_id"   TEXT, -- present on stripe_connect_* events
    "source"              TEXT             NOT NULL DEFAULT 'signup_handler',
    "notes"               TEXT,
    "metadata"            JSONB            NOT NULL DEFAULT '{}'::jsonb,
    "occurred_at"         TIMESTAMP(3)     NOT NULL,
    "created_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "salesperson_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salesperson_events_event_id_key"  ON "salesperson_events" ("event_id");
CREATE INDEX        "salesperson_events_user_idx"      ON "salesperson_events" ("user_id", "occurred_at" DESC);
CREATE INDEX        "salesperson_events_type_idx"      ON "salesperson_events" ("type",    "occurred_at" DESC);
