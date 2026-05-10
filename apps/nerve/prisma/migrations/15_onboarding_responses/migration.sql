-- Onboarding responses — post-sale customer signal.
--
-- B4 of Phase B (closes Phase B). Mirrors the customer's post-sale
-- onboarding form into NERVE so the warehouse can join "we sold a
-- demo to a barber" with "the customer actually said they want X, Y,
-- and Z changed about it".
--
-- Producer: sales-dashboard `/api/onboarding/[leadId]` POST handler
-- fans out after the Supabase upsert returns the cumulative row.
-- Fire-and-forget — Supabase is source of truth.
--
-- Idempotency: natural key is `lead_assignment_id` (unique). The form
-- auto-saves on every keystroke; each save upserts in place. `save_count`
-- increments on each ingest so analytics can spot drop-off ("12 saves
-- but never marked complete").

CREATE TABLE "onboarding_responses" (
    "id"                    TEXT             NOT NULL,
    "lead_assignment_id"    TEXT             NOT NULL, -- natural key
    "contact_phone"         TEXT,
    "contact_email"         TEXT,
    "top_changes"           TEXT,
    "anything_else"         TEXT,
    "has_existing_domain"   BOOLEAN,
    "existing_domain"       TEXT,
    "domain_preferences"    JSONB,           -- string[]
    "photos"                JSONB             DEFAULT '[]'::jsonb, -- [{ url, filename, content_type, uploaded_at }]
    "completed_at"          TIMESTAMP(3),    -- set when mark_completed:true was last sent
    "welcome_sent_at"       TIMESTAMP(3),    -- mirrors Supabase column
    "save_count"            INTEGER          NOT NULL DEFAULT 0,
    "first_saved_at"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_saved_at"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_payload"           JSONB,
    "metadata"              JSONB            NOT NULL DEFAULT '{}'::jsonb,
    "created_at"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "onboarding_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_responses_lead_assignment_id_key" ON "onboarding_responses" ("lead_assignment_id");
CREATE INDEX        "onboarding_responses_completed_idx"          ON "onboarding_responses" ("completed_at" DESC);
CREATE INDEX        "onboarding_responses_welcome_idx"            ON "onboarding_responses" ("welcome_sent_at" DESC);
CREATE INDEX        "onboarding_responses_last_saved_idx"         ON "onboarding_responses" ("last_saved_at" DESC);
