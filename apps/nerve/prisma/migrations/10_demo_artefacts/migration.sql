-- Demo HTML artefacts.
--
-- A3 of Phase A. Stores every generated demo HTML inline so the artefact
-- trail is replayable + queryable from NERVE without going back to the
-- filesystem or Supabase Storage. Pairs naturally with A1 (composer
-- iterations — the in-progress edits) and A2 (site_briefs — the brief
-- that drove the demo).
--
-- One row per generated demo. Caller-supplied `artefact_id` (convention:
-- `<lead_slug>-demo-<iso_no_colons>`) lets the build-demo skill / Pi
-- composer replay safely without double-inserting on transient network
-- failure. History is preserved by ordering on `generated_at` DESC, so
-- iterating on the same lead just appends new rows.
--
-- HTML stored as TEXT; Postgres handles MB-scale fine. Vercel request
-- body limit is 4.5MB so the route validator caps inline payloads under
-- that — anything larger needs aggressive image compression upstream
-- (the build-demo skill already resizes via sips).
--
-- snake_case column names matched to the wider pattern. Prisma client
-- uses camelCase via @map.

CREATE TABLE "demo_artefacts" (
    "id"                     TEXT             NOT NULL,
    "artefact_id"            TEXT             NOT NULL, -- caller-supplied natural key
    "lead_id"                TEXT             NOT NULL, -- slug, indexed for "latest demo for X"
    "brief_id"               TEXT, -- soft FK to site_briefs.brief_id (nullable; demo may exist without a recorded brief)
    "composer_iteration_id"  TEXT, -- soft FK to composer_iterations.iteration_id (the final manual iteration, if any)
    "business_name"          TEXT             NOT NULL,
    "vertical"               TEXT,
    "html_inline"            TEXT             NOT NULL, -- the full self-contained demo.html
    "html_size_bytes"        INTEGER          NOT NULL, -- denormalised for size queries / billing
    "photo_count"            INTEGER          NOT NULL DEFAULT 0, -- how many <img data:...> embeds inside the html
    "aesthetic_positioning"  TEXT, -- eg "East London serious-studio editorial" (mirrored from brand_analyses for join-free queries)
    "dominant_hex"           TEXT, -- mirrored from brand_analyses
    "source"                 TEXT             NOT NULL DEFAULT 'manual_skill', -- "manual_skill" | "pi_composer"
    "metadata"               JSONB            NOT NULL DEFAULT '{}'::jsonb,
    "generated_at"           TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "demo_artefacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "demo_artefacts_artefact_id_key"           ON "demo_artefacts" ("artefact_id");
CREATE INDEX        "demo_artefacts_lead_id_generated_at_idx"  ON "demo_artefacts" ("lead_id", "generated_at" DESC);
CREATE INDEX        "demo_artefacts_brief_id_idx"              ON "demo_artefacts" ("brief_id");
CREATE INDEX        "demo_artefacts_vertical_generated_at_idx" ON "demo_artefacts" ("vertical", "generated_at" DESC);
CREATE INDEX        "demo_artefacts_aesthetic_positioning_idx" ON "demo_artefacts" ("aesthetic_positioning");
