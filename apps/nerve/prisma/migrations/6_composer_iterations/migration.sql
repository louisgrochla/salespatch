-- Composer Workbench iteration log.
--
-- Every save in tools/workbench/ writes a row here: AI-generated HTML,
-- manual edits, renames, deletes. Captures the founder's manual iteration
-- trail outside the local filesystem so /build-demo and future agents can
-- consult prior attempts for the same vertical.
--
-- Idempotency key is iteration_id (caller-supplied,
-- <lead_slug>-<iso_no_colons>) so retries from the workbench when the
-- round-trip fails don't double-insert. snake_case columns to match the
-- rest of the SL-MAS schema; Prisma client uses camelCase via @map.

-- ── composer_iterations ──────────────────────────────────────────────────
CREATE TABLE "composer_iterations" (
    "id"                    TEXT         NOT NULL,
    "iteration_id"          TEXT         NOT NULL,
    "lead_id"               TEXT,
    "business_name"         TEXT,
    "vertical"              TEXT,
    "html_output"           TEXT         NOT NULL,
    "css_output"            TEXT,
    "prompt"                TEXT,
    "response"              TEXT,
    "edit_kind"             TEXT         NOT NULL,
    "editor_notes"          TEXT,
    "parent_iteration_id"   TEXT,
    "metadata"              JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "composer_iterations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "composer_iterations_iteration_id_key"           ON "composer_iterations" ("iteration_id");
CREATE INDEX        "composer_iterations_lead_id_created_at_idx"     ON "composer_iterations" ("lead_id", "created_at" DESC);
CREATE INDEX        "composer_iterations_edit_kind_created_at_idx"   ON "composer_iterations" ("edit_kind", "created_at" DESC);
CREATE INDEX        "composer_iterations_parent_iteration_id_idx"    ON "composer_iterations" ("parent_iteration_id");
