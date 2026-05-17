-- Creates qa_visual_results — the six-layer vision-pass QA artefact per
-- demo. Producer-parity ingest for `apps/nerve/scripts/qa-visual.ts`
-- (SDK runner, dormant) and `~/.claude/commands/build-demo.md` (manual
-- flow, active).
--
-- Distinct from `qa_results` (the static heuristic QA from `qa-demo.ts`):
-- `qa_results` answers "is the HTML clean" (regex over markup), while
-- `qa_visual_results` answers "is the demo good" (vision over rendered
-- screenshots, six layers). The two are stored separately so the
-- warehouse can join either or both without artificial NULLs in shared
-- columns.
--
-- Idempotency: `qa_visual_id` is the caller-supplied natural key,
-- conventional format `<lead_id>-qa-visual-<iso_no_colons>`. Replays
-- return 200 with inserted=false. Re-running visual QA on the same
-- artefact (eg after a fix) creates a new row with a fresh
-- qa_visual_id; latest-for-artefact lookups use the
-- (artefact_id, ran_at DESC) index.
--
-- PR-D nullable layer fields: each gradable layer's JSONB column is
-- nullable. When the producer's vision call failed permanently after
-- retries, the column is `null` AND the layer name appears in
-- `failed_layers`. The Zod validator at the producer side enforces the
-- exact-match invariant; downstream queries can `WHERE brand_fidelity
-- IS NOT NULL` to exclude failed-run rows from grade averages.
--
-- The `bug_count` and `has_critical` columns mirror the nullness of
-- `bugs` (when bugs is null, both derived fields are null too) — the
-- producer-side cross-field invariants enforce this; the schema is
-- permissive enough to accept both states.
--
-- Indexes:
--   - (lead_id, ran_at DESC): per-lead history, "latest run for this
--     lead" lookup
--   - (artefact_id, ran_at DESC): latest run per built demo
--   - (has_critical): quick filter for blocked-pitch demos
--   - (producer): cohort analytics by producer ("does manual flow score
--     differently from SDK runner once both are live?")

CREATE TABLE "qa_visual_results" (
  "id"                  TEXT PRIMARY KEY,
  "qa_visual_id"        TEXT NOT NULL,
  "artefact_id"         TEXT,
  "lead_id"             TEXT NOT NULL,
  "demo_path"           TEXT,
  "viewport_width"      INTEGER NOT NULL,
  "viewport_height"     INTEGER NOT NULL,
  "ran_at"              TIMESTAMP(3) NOT NULL,
  "producer"            TEXT NOT NULL,
  "model"               TEXT NOT NULL,

  -- Layer 1 (Bugs) — nullable; derived fields null iff bugs null
  "bugs"                JSONB,
  "has_critical"        BOOLEAN,
  "bug_count"           INTEGER,

  -- Layers 2-6 — nullable per PR-D partial-result contract
  "brand_fidelity"      JSONB,
  "owner_reaction"      JSONB,
  "voice_consistency"   JSONB,
  "customer_reaction"   JSONB,
  "section_grades"      JSONB,

  "failed_layers"       JSONB NOT NULL DEFAULT '[]',
  "notes"               TEXT,
  "source"              TEXT NOT NULL DEFAULT 'manual_skill',
  "metadata"            JSONB NOT NULL DEFAULT '{}',

  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "qa_visual_results_qa_visual_id_key"
  ON "qa_visual_results" ("qa_visual_id");

CREATE INDEX "qa_visual_results_lead_id_ran_at_idx"
  ON "qa_visual_results" ("lead_id", "ran_at" DESC);

CREATE INDEX "qa_visual_results_artefact_id_ran_at_idx"
  ON "qa_visual_results" ("artefact_id", "ran_at" DESC);

CREATE INDEX "qa_visual_results_has_critical_idx"
  ON "qa_visual_results" ("has_critical");

CREATE INDEX "qa_visual_results_producer_idx"
  ON "qa_visual_results" ("producer");
