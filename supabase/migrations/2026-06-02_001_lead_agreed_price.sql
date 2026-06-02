-- Add agreed_price_pence to lead_assignments. Captured at pitch time when
-- the SP negotiates a price below the £299 default. When set, the customer
-- payment view uses this as the setup-fee amount AND treats the deal as a
-- flat one-time fee (no recurring £25/mo subscription is created by the
-- webhook). When NULL, the locked beta money model (£299 setup + £25/mo)
-- applies.
--
-- Stored in pence (integer) to match payments.ts conventions. The same
-- pitch path that writes the NERVE `commission_amount_pence` event field
-- also writes this column on the local lead_assignments row.

ALTER TABLE lead_assignments
  ADD COLUMN IF NOT EXISTS agreed_price_pence integer;

CREATE INDEX IF NOT EXISTS idx_lead_assignments_agreed_price_pence
  ON lead_assignments(agreed_price_pence)
  WHERE agreed_price_pence IS NOT NULL;
