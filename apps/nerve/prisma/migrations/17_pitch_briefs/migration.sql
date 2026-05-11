-- Pitch briefs — output of the /lead-json skill captured into NERVE.
--
-- The lead-card surface (denormalised services / pain_points /
-- opening_hours / trust_badges / etc.) plus the sales playbook
-- (hook, opener, demo_moments, close_script, next_visit_reason,
-- specific_objections). This is the *prescription* side of the
-- "did the pitch close" loop — pairs with B1 lead_assignment_events
-- for the outcome.
--
-- Idempotent on pitch_brief_id (caller-supplied <slug>-pitch-<iso_no_colons>).
-- Replays collapse onto the same row; fresh skill runs create a new
-- history row. Latest-per-lead served by the (lead_id, generated_at DESC)
-- index.

CREATE TABLE "pitch_briefs" (
    "id"                   TEXT          NOT NULL,
    "pitch_brief_id"       TEXT          NOT NULL,
    "lead_id"              TEXT          NOT NULL,
    "brief_id"             TEXT,
    "business_name"        TEXT          NOT NULL,
    "vertical"             TEXT,
    "business_type"        TEXT,
    "postcode"             TEXT,
    "address"              TEXT,
    "description"          TEXT,
    "hero_headline"        TEXT,
    "cta_text"             TEXT,
    "services"             TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "pain_points"          TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "opening_hours"        TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "trust_badges"         TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "avoid_topics"         TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "contact_name"         TEXT,
    "contact_role"         TEXT,
    "brand_primary_hex"    TEXT,
    "brand_accent_hex"     TEXT,
    "demo_site_domain"     TEXT,
    "hook"                 TEXT,
    "opener"               TEXT,
    "demo_moments"         TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "close_script"         TEXT,
    "next_visit_reason"    TEXT,
    "specific_objections"  JSONB         NOT NULL DEFAULT '[]'::jsonb,
    "source"               TEXT          NOT NULL DEFAULT 'manual_skill',
    "metadata"             JSONB         NOT NULL DEFAULT '{}'::jsonb,
    "generated_at"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pitch_briefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pitch_briefs_pitch_brief_id_key" ON "pitch_briefs" ("pitch_brief_id");
CREATE INDEX        "pitch_briefs_lead_idx"           ON "pitch_briefs" ("lead_id", "generated_at" DESC);
CREATE INDEX        "pitch_briefs_vertical_idx"       ON "pitch_briefs" ("vertical", "generated_at" DESC);
CREATE INDEX        "pitch_briefs_brief_idx"          ON "pitch_briefs" ("brief_id");
