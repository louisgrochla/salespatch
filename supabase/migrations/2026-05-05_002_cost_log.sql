-- cost_log — per-event ledger for outgoing costs (Stripe fees, invoice
-- payments, manual ops costs). The Stripe webhook inserts here on every
-- checkout.session.completed (1.4% + 20p estimate) and on every
-- invoice.payment_succeeded (£25/mo recurring revenue).
--
-- The webhook calls supabase.from('cost_log').insert(...) without
-- checking the response, so before this migration ran the inserts
-- silently dropped (Supabase returns {error} rather than throwing).
-- Lead-status flip + commission write succeeded fine, but the cost
-- ledger was empty.

CREATE TABLE IF NOT EXISTS cost_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service      text NOT NULL,         -- 'stripe', 'stripe-invoice', 'openai', etc.
  amount_gbp   numeric(10, 2) NOT NULL,
  description  text,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_log_service    ON cost_log(service);
CREATE INDEX IF NOT EXISTS idx_cost_log_created_at ON cost_log(created_at DESC);
