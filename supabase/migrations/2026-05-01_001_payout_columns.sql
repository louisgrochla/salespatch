-- ============================================================
-- 2026-05-01 001 — manual-payout columns on lead_assignments
-- ============================================================
-- Tracks when admin pays out the salesperson commission for a sold
-- assignment. Used by /api/payments/payout (admin-triggered) so a double
-- click can't double-pay.
--
-- payout_status values:
--   'pending'   — sold but not yet paid out (default for any sold row)
--   'paid_out'  — Stripe transfer succeeded
--   'failed'    — Stripe rejected the transfer; see payout_failure_reason
--
-- Run in Supabase SQL Editor.

ALTER TABLE lead_assignments
  ADD COLUMN IF NOT EXISTS payout_status         text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payout_transfer_id    text,
  ADD COLUMN IF NOT EXISTS payout_paid_out_at    timestamptz,
  ADD COLUMN IF NOT EXISTS payout_failed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS payout_failure_reason text;

-- Index narrows the "what's owed" admin view: status='sold' AND
-- payout_status='pending' is the queue.
CREATE INDEX IF NOT EXISTS lead_assignments_pending_payouts_idx
  ON lead_assignments(user_id, status, payout_status)
  WHERE status = 'sold' AND payout_status = 'pending';
