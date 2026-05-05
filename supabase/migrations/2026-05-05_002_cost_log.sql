-- cost_log — per-event ledger for outgoing costs (Stripe fees, invoice
-- payments, manual ops costs). Webhook inserts on every
-- checkout.session.completed (1.4% + 20p estimate) and every
-- invoice.payment_succeeded (£25/mo recurring revenue).
--
-- Defensive shape: cost_log may already exist in some envs from earlier
-- scaffolding, possibly with an incomplete schema. CREATE TABLE IF NOT
-- EXISTS only sets the primary key; ALTER TABLE ADD COLUMN IF NOT
-- EXISTS fills in everything else without disturbing existing rows.

CREATE TABLE IF NOT EXISTS cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE cost_log
  ADD COLUMN IF NOT EXISTS service     text,
  ADD COLUMN IF NOT EXISTS amount_gbp  numeric(10, 2),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS metadata    jsonb,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_cost_log_service    ON cost_log(service);
CREATE INDEX IF NOT EXISTS idx_cost_log_created_at ON cost_log(created_at DESC);
