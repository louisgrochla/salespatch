-- ============================================================
-- 2026-04-25 001 — stripe_events idempotency table
-- ============================================================
-- Stripe retries the same event under flaky network conditions.
-- Without this table, contractors would get paid twice when a retry
-- sneaks past. The webhook handler INSERTs first; if the row already
-- exists, it returns 200 immediately without touching commission state.
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS stripe_events (
  id            text PRIMARY KEY,             -- Stripe event_id (e.g. evt_1Abc…)
  type          text NOT NULL,                -- e.g. checkout.session.completed
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz                   -- set when handler completes successfully
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_received
  ON stripe_events(received_at DESC);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON stripe_events
  FOR ALL
  USING (true)
  WITH CHECK (true);
