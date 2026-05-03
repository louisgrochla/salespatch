-- pitch_attempts — lightweight Supabase mirror used by the sales-dashboard
-- /api/leads/[id]/pitch route. The full questionnaire data lives in NERVE
-- (the source of truth via /api/ingest/pitch). This table only tracks the
-- pointer + outcome so dashboard UI can rank "leads with pitches" without
-- a cross-region NERVE query.

CREATE TABLE IF NOT EXISTS pitch_attempts (
  id              uuid PRIMARY KEY,
  lead_id         text NOT NULL,
  user_id         text NOT NULL,
  assignment_id   text NOT NULL,
  outcome         text NOT NULL,
  nerve_pitch_id  text,
  quality_flag    text,
  pitched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pitch_attempts_lead         ON pitch_attempts(lead_id);
CREATE INDEX IF NOT EXISTS idx_pitch_attempts_user         ON pitch_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_pitch_attempts_assignment   ON pitch_attempts(assignment_id);
CREATE INDEX IF NOT EXISTS idx_pitch_attempts_pitched_at   ON pitch_attempts(pitched_at DESC);
