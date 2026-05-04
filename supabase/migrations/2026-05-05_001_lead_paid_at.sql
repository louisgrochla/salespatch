-- Add paid_at column to lead_assignments. Set by the Stripe webhook
-- when checkout.session.completed lands with payment_status='paid'.
-- iOS reads this to distinguish "Confirmed" (real money in) from
-- "Projected" (SP claimed sold but no payment yet, e.g. closed_followup
-- before they actually pay).
--
-- sold_at is preserved as the lead-status flip timestamp; paid_at is
-- the strictly-stronger "money is in" timestamp. In live Stripe mode
-- they will normally be equal because the webhook fires both at once.
-- In test mode and for SP-claimed sales without a Stripe flow, paid_at
-- stays NULL.

ALTER TABLE lead_assignments
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_lead_assignments_paid_at
  ON lead_assignments(paid_at)
  WHERE paid_at IS NOT NULL;
