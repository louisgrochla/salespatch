-- Site briefs + brand analyses.
--
-- A2 of the SL-MAS Phase A buildout. Captures the spec-site-brief skill's
-- output (or the Pi `brief-generator-agent` output, autumn) verbatim plus
-- structured fields the AI layer can query without reparsing markdown.
--
-- Two tables, decoupled but conventionally 1:1 per generated brief:
--   site_briefs     — the brief.md body + verdict + diagnosis + pitch angle
--   brand_analyses  — the Phase 2 brand intelligence (palette / type /
--                     positioning) lifted out as structured JSON
--
-- Both keyed on a caller-supplied id (`brief_id`, `analysis_id`) so the
-- skill can replay safely. Indexed by `lead_id` so the latest brief / latest
-- analysis for a given lead is a fast lookup, and history is preserved by
-- ordering on generated_at / analyzed_at DESC.
--
-- snake_case column names matched to Pi-side SQLite for SQL portability.
-- Prisma client uses camelCase via @map.

-- ── site_briefs ──────────────────────────────────────────────────────────
CREATE TABLE "site_briefs" (
    "id"                  TEXT             NOT NULL,
    "brief_id"            TEXT             NOT NULL, -- caller-supplied natural key, eg "<slug>-<iso_no_colons>"
    "lead_id"             TEXT             NOT NULL, -- slug, indexed for "latest brief for X"
    "business_name"       TEXT             NOT NULL,
    "business_type"       TEXT,
    "vertical"            TEXT,
    "postcode"            TEXT,
    "address"             TEXT,
    "owner_name"          TEXT,
    "verdict"             TEXT             NOT NULL, -- "PROCEED" | "PASS"
    "verdict_reason"      TEXT, -- one-line reason
    "google_rating"       DOUBLE PRECISION,
    "google_review_count" INTEGER,
    "instagram_handle"    TEXT,
    "instagram_followers" INTEGER,
    "years_trading"       TEXT, -- free-form, eg "~9 months", "since 2014"
    "awards_press"        TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
    "diagnosis"           TEXT, -- the Phase 3 problem statement
    "pitch_angle"         TEXT, -- the lead-with line for the door
    "test_of_success"     TEXT, -- the recognition reaction the demo must trigger
    "blueprint_sections"  JSONB, -- the Phase 6 demo blueprint, structured
    "brief_markdown"      TEXT             NOT NULL, -- full body verbatim
    "source"              TEXT             NOT NULL DEFAULT 'manual_skill', -- "manual_skill" | "pi_brief_generator"
    "metadata"            JSONB            NOT NULL DEFAULT '{}'::jsonb,
    "generated_at"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_briefs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "site_briefs_brief_id_key"            ON "site_briefs" ("brief_id");
CREATE INDEX        "site_briefs_lead_id_generated_at_idx" ON "site_briefs" ("lead_id", "generated_at" DESC);
CREATE INDEX        "site_briefs_vertical_generated_at_idx" ON "site_briefs" ("vertical", "generated_at" DESC);
CREATE INDEX        "site_briefs_verdict_idx"             ON "site_briefs" ("verdict");

-- ── brand_analyses ───────────────────────────────────────────────────────
CREATE TABLE "brand_analyses" (
    "id"                     TEXT             NOT NULL,
    "analysis_id"            TEXT             NOT NULL, -- caller-supplied natural key
    "lead_id"                TEXT             NOT NULL, -- slug, indexed
    "brief_id"               TEXT, -- soft FK to site_briefs.brief_id, nullable for analyses without an attached brief
    "dominant_hex"           TEXT, -- "#0E0E10"
    "dominant_pct"           INTEGER, -- 0-100
    "neutral_hex"            TEXT,
    "neutral_pct"            INTEGER,
    "accent_hex"             TEXT,
    "accent_pct"             INTEGER,
    "display_font"           TEXT, -- e.g. "Abril Fatface"
    "display_fallback"       TEXT, -- e.g. "serif"
    "body_font"              TEXT,
    "body_fallback"          TEXT,
    "mono_font"              TEXT,
    "mono_fallback"          TEXT,
    "logo_description"       TEXT, -- description detailed enough for SVG reproduction
    "logo_kind"              TEXT, -- "clean_vector" | "hand_imperfect" | "asset_only"
    "voice_adjectives"       TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
    "voice_quotes"           TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[], -- verbatim
    "positioning_reference"  TEXT, -- e.g. "Sang Bleu London"
    "positioning_rationale"  TEXT, -- one-line why
    "asset_notes"            TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[], -- what must be lifted from photos
    "analysis_markdown"      TEXT, -- the Phase 2 section verbatim, optional
    "source"                 TEXT             NOT NULL DEFAULT 'manual_skill',
    "metadata"               JSONB            NOT NULL DEFAULT '{}'::jsonb,
    "analyzed_at"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "brand_analyses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brand_analyses_analysis_id_key"           ON "brand_analyses" ("analysis_id");
CREATE INDEX        "brand_analyses_lead_id_analyzed_at_idx"   ON "brand_analyses" ("lead_id", "analyzed_at" DESC);
CREATE INDEX        "brand_analyses_brief_id_idx"              ON "brand_analyses" ("brief_id");
CREATE INDEX        "brand_analyses_positioning_reference_idx" ON "brand_analyses" ("positioning_reference");
