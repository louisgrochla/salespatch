-- Per-call API spend ledger.
--
-- Each outbound call to a paid external API (OpenRouter, Apify, Google
-- Places, etc.) writes one row here. Written by the Pi runtime via
-- fire-and-forget POST to /api/ingest/spend (see
-- src/lib/spendReporter.ts on the runtime side). HMAC-signed, idempotent
-- via natural duplicates being acceptable (cheap appends).
--
-- Lets the founder answer "how much did vertical=barber cost in May?"
-- from one query without scraping provider dashboards.
--
-- snake_case columns to match the rest of the SL-MAS section; Prisma
-- client surfaces camelCase via @map.

CREATE TABLE "spend_ledger" (
    "id"             TEXT             NOT NULL,
    "provider"       TEXT             NOT NULL,
    "model"          TEXT,
    "agent_id"       TEXT,
    "run_id"         TEXT,
    "node_id"        TEXT,
    "lead_id"        TEXT,
    "vertical"       TEXT,
    "cost_usd"       DOUBLE PRECISION NOT NULL,
    "input_tokens"   INTEGER,
    "output_tokens"  INTEGER,
    "total_tokens"   INTEGER,
    "request_kind"   TEXT,
    "success"        BOOLEAN          NOT NULL DEFAULT true,
    "error_message"  TEXT,
    "metadata"       JSONB            NOT NULL DEFAULT '{}'::jsonb,
    "occurred_at"    TIMESTAMP(3)     NOT NULL,
    "created_at"     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spend_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spend_ledger_provider_occurred_at_idx" ON "spend_ledger" ("provider", "occurred_at" DESC);
CREATE INDEX "spend_ledger_agent_id_occurred_at_idx" ON "spend_ledger" ("agent_id", "occurred_at" DESC);
CREATE INDEX "spend_ledger_lead_id_occurred_at_idx"  ON "spend_ledger" ("lead_id", "occurred_at" DESC);
CREATE INDEX "spend_ledger_run_id_idx"               ON "spend_ledger" ("run_id");
