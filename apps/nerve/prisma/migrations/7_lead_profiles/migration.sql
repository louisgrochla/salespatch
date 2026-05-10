-- Lead profile snapshots.
--
-- Rich enriched-data snapshot produced by the Pi `lead-profiler-agent` or
-- the manual `/build-demo` spec-site research workflow. Distinct from the
-- existing LeadRecord (simpler founder-facing record) — this is the
-- AI-introspectable corpus: Instagram followers + post count, review
-- summaries, services, qualifier verdicts, plus the raw scout/profiler
-- payloads kept for audit so future agents can re-derive without
-- re-scraping.
--
-- One row per lead, keyed on the natural slug `lead_id`. Re-profiling
-- upserts in place so a Pi rerun replaces the previous snapshot rather
-- than accreting duplicates.
--
-- snake_case column names matched to runtime Pi SQLite for SQL
-- portability. Prisma client uses camelCase via @map.

-- ── lead_profiles ────────────────────────────────────────────────────────
CREATE TABLE "lead_profiles" (
    "id"                     TEXT             NOT NULL,
    "lead_id"                TEXT             NOT NULL,
    "business_name"          TEXT             NOT NULL,
    "business_type"          TEXT,
    "vertical"               TEXT,
    "category"               TEXT,
    "address"                TEXT,
    "postcode"               TEXT,
    "phone"                  TEXT,
    "email"                  TEXT,
    "website_url"            TEXT,
    "website_quality_score"  INTEGER,
    "google_rating"          DOUBLE PRECISION,
    "google_review_count"    INTEGER,
    "best_reviews"           JSONB,
    "instagram_handle"       TEXT,
    "instagram_followers"    INTEGER,
    "instagram_post_count"   INTEGER,
    "instagram_bio"          TEXT,
    "photo_count"            INTEGER          NOT NULL DEFAULT 0,
    "has_logo"               BOOLEAN          NOT NULL DEFAULT false,
    "has_hero_image"         BOOLEAN          NOT NULL DEFAULT false,
    "opening_hours"          TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
    "services"               JSONB,
    "price_range"            TEXT,
    "qualification_score"    DOUBLE PRECISION,
    "qualification_reasons"  TEXT[]           NOT NULL DEFAULT ARRAY[]::TEXT[],
    "qualifier_verdict"      TEXT,
    "latitude"               DOUBLE PRECISION,
    "longitude"              DOUBLE PRECISION,
    "raw_scout_data"         JSONB,
    "raw_profiler_data"      JSONB,
    "metadata"               JSONB            NOT NULL DEFAULT '{}'::jsonb,
    "profiled_at"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lead_profiles_lead_id_key"                      ON "lead_profiles" ("lead_id");
CREATE INDEX        "lead_profiles_vertical_profiled_at_idx"         ON "lead_profiles" ("vertical", "profiled_at" DESC);
CREATE INDEX        "lead_profiles_qualifier_verdict_profiled_at_idx" ON "lead_profiles" ("qualifier_verdict", "profiled_at" DESC);
CREATE INDEX        "lead_profiles_postcode_idx"                     ON "lead_profiles" ("postcode");
