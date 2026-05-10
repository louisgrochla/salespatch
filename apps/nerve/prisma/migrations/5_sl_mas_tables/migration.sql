-- SL-MAS pipeline learning tables.
--
-- Mirrors the better-sqlite3 schemas in src/learning/decisionStore.ts,
-- src/memory/episodicStore.ts, src/memory/strategicStore.ts,
-- src/runtime/modelRegistry.ts. Co-locates the SL-MAS data layer with
-- NERVE so pitch outcome ingest writes atomically alongside PitchLog
-- upsert and the Pi drops out of the dashboard hot path.
--
-- All snake_case column names matched to runtime SQLite for SQL
-- portability. Prisma client uses camelCase via @map.

-- ── decisions ────────────────────────────────────────────────────────────
CREATE TABLE "decisions" (
    "id"              TEXT             NOT NULL,
    "agent_id"        TEXT             NOT NULL,
    "run_id"          TEXT             NOT NULL,
    "node_id"         TEXT             NOT NULL,
    "action"          TEXT             NOT NULL,
    "reasoning"       TEXT             NOT NULL,
    "alternatives"    JSONB            NOT NULL,
    "confidence"      DOUBLE PRECISION NOT NULL,
    "inputs_summary"  TEXT             NOT NULL,
    "output_summary"  TEXT             NOT NULL,
    "tags"            TEXT[],
    "created_at"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "decisions_agent_id_created_at_idx" ON "decisions" ("agent_id", "created_at" DESC);
CREATE INDEX "decisions_run_id_created_at_idx"   ON "decisions" ("run_id", "created_at" ASC);
CREATE INDEX "decisions_tags_idx"                ON "decisions" USING GIN ("tags");

-- ── outcomes ─────────────────────────────────────────────────────────────
CREATE TABLE "outcomes" (
    "id"                     TEXT             NOT NULL,
    "decision_id"            TEXT             NOT NULL,
    "outcome_type"           TEXT             NOT NULL,
    "result"                 TEXT             NOT NULL,
    "metric_value"           DOUBLE PRECISION,
    "metric_name"            TEXT,
    "notes"                  TEXT             NOT NULL,
    "lag_hours"              DOUBLE PRECISION,
    "recorded_at"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attribution_weight"     DOUBLE PRECISION,
    "attribution_reasoning"  TEXT,
    CONSTRAINT "outcomes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outcomes_decision_id_idx" ON "outcomes" ("decision_id");
CREATE INDEX "outcomes_recorded_at_idx" ON "outcomes" ("recorded_at" DESC);
ALTER TABLE "outcomes"
  ADD CONSTRAINT "outcomes_decision_id_fkey"
  FOREIGN KEY ("decision_id") REFERENCES "decisions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── learning_insights ────────────────────────────────────────────────────
CREATE TABLE "learning_insights" (
    "id"             TEXT             NOT NULL,
    "agent_id"       TEXT             NOT NULL,
    "pattern"        TEXT             NOT NULL,
    "sample_size"    INTEGER          NOT NULL,
    "avg_metric"     DOUBLE PRECISION,
    "recommendation" TEXT             NOT NULL,
    "generated_at"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_insights_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "learning_insights_agent_id_generated_at_idx" ON "learning_insights" ("agent_id", "generated_at" DESC);

-- ── outcome_ingest_log ───────────────────────────────────────────────────
-- external_id is the idempotency key — duplicate ingests caught at INSERT.
CREATE TABLE "outcome_ingest_log" (
    "external_id"        TEXT         NOT NULL,
    "source"             TEXT         NOT NULL,
    "payload"            JSONB        NOT NULL,
    "matched_decisions"  INTEGER      NOT NULL,
    "match_strategy"     TEXT         NOT NULL,
    "episode_id"         TEXT,
    "ingested_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outcome_ingest_log_pkey" PRIMARY KEY ("external_id")
);
CREATE INDEX "outcome_ingest_log_source_ingested_at_idx" ON "outcome_ingest_log" ("source", "ingested_at" DESC);

-- ── sl_mas_kv ────────────────────────────────────────────────────────────
CREATE TABLE "sl_mas_kv" (
    "key"        TEXT         NOT NULL,
    "value"      TEXT         NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sl_mas_kv_pkey" PRIMARY KEY ("key")
);

-- ── episodes ─────────────────────────────────────────────────────────────
CREATE TABLE "episodes" (
    "id"                          TEXT             NOT NULL,
    "pipeline_run_id"             TEXT             NOT NULL,
    "pipeline_definition_id"      TEXT             NOT NULL,
    "trigger"                     TEXT,
    "lead_id"                     TEXT,
    "business_name"               TEXT,
    "vertical"                    TEXT,
    "region"                      TEXT,
    "started_at"                  TIMESTAMP(3)     NOT NULL,
    "ended_at"                    TIMESTAMP(3),
    "status"                      TEXT             NOT NULL,
    "total_cost_usd"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reflection_iterations"       INTEGER          NOT NULL DEFAULT 0,
    "agent_outputs_summary"       JSONB            NOT NULL,
    "critic_scores"               JSONB            NOT NULL,
    "working_memory_snapshot"     JSONB            NOT NULL,
    "strategies_used"             TEXT[],
    "pivot_tags"                  TEXT[],
    "pitch_outcome"               TEXT,
    "outcome_received_at"         TIMESTAMP(3),
    "close_amount_gbp"            DOUBLE PRECISION,
    "days_to_outcome"             DOUBLE PRECISION,
    "outcome_notes"               TEXT,
    "created_at"                  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "episodes_pipeline_run_id_key"          ON "episodes" ("pipeline_run_id");
CREATE INDEX        "episodes_lead_id_started_at_idx"       ON "episodes" ("lead_id", "started_at" DESC);
CREATE INDEX        "episodes_pitch_outcome_started_at_idx" ON "episodes" ("pitch_outcome", "started_at" DESC);
CREATE INDEX        "episodes_vertical_started_at_idx"      ON "episodes" ("vertical", "started_at" DESC);
CREATE INDEX        "episodes_pivot_tags_idx"               ON "episodes" USING GIN ("pivot_tags");

-- ── strategies ───────────────────────────────────────────────────────────
CREATE TABLE "strategies" (
    "id"                  TEXT             NOT NULL,
    "vertical"            TEXT             NOT NULL,
    "region"              TEXT,
    "strategy_type"       TEXT             NOT NULL,
    "parameters"          JSONB            NOT NULL,
    "sample_size"         INTEGER          NOT NULL DEFAULT 0,
    "close_rate"          DOUBLE PRECISION,
    "confidence_lower"    DOUBLE PRECISION,
    "confidence_upper"    DOUBLE PRECISION,
    "status"              TEXT             NOT NULL DEFAULT 'new',
    "last_evaluated_at"   TIMESTAMP(3),
    "created_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "strategies_vertical_status_close_rate_idx" ON "strategies" ("vertical", "status", "close_rate" DESC);

-- ── model_registrations ──────────────────────────────────────────────────
CREATE TABLE "model_registrations" (
    "id"            TEXT         NOT NULL,
    "kind"          TEXT         NOT NULL,
    "agent_id"      TEXT,
    "version"       TEXT         NOT NULL,
    "source"        TEXT         NOT NULL,
    "endpoint"      TEXT,
    "weights_path"  TEXT,
    "active"        BOOLEAN      NOT NULL DEFAULT false,
    "metadata"      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "model_registrations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "model_registrations_kind_agent_id_active_idx" ON "model_registrations" ("kind", "agent_id", "active");
