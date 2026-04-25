-- ============================================================
-- 2026-04-25 002 — lead_payment_sessions cache table
-- ============================================================
-- Caches the active Stripe Checkout session per lead. The customer's
-- preview page (/preview/<lead_id>) reads the most recent non-expired
-- session via this table. If the cached session is expired or missing,
-- the preview page recreates one server-side and writes a new row —
-- the customer never sees the seam.
--
-- Eager attribution: a session is created the moment the salesperson
-- taps "Take payment" so the contractor's salesperson_id metadata is
-- locked into Stripe before the customer even scans. The session_id
-- in this table is the link from "the QR they scanned" back to "the
-- contractor who showed it".
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS lead_payment_sessions (
  id                    text PRIMARY KEY,
  lead_assignment_id    text NOT NULL REFERENCES lead_assignments(id) ON DELETE CASCADE,
  stripe_session_id     text NOT NULL UNIQUE,
  stripe_session_url    text NOT NULL,
  expires_at            timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'expired', 'completed')),
  amount_setup_pence    integer NOT NULL,             -- snapshot at session create
  amount_monthly_pence  integer NOT NULL,             -- snapshot at session create
  created_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz
);

-- Lookup the latest active session for a lead — preview page hot path.
CREATE INDEX IF NOT EXISTS idx_lps_assignment_status
  ON lead_payment_sessions(lead_assignment_id, status, created_at DESC);

-- Webhook needs to find the session row from Stripe's session_id.
CREATE INDEX IF NOT EXISTS idx_lps_stripe_session
  ON lead_payment_sessions(stripe_session_id);

ALTER TABLE lead_payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON lead_payment_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);
