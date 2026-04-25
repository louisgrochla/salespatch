-- ============================================================
-- 2026-04-25 003 — payment-flow columns on sales_users + lead_assignments
-- ============================================================
-- Per-contractor flat commission (in pence) replaces hard-coded £50.
-- New default for fresh contractors = £150 (15000p) for the beta.
-- Editable via /admin/users/[id].
--
-- lead_assignments gains the customer-side payment fields the webhook
-- fills in once Stripe confirms payment_status='paid'.
--
-- Run in Supabase SQL Editor.

ALTER TABLE sales_users
  ADD COLUMN IF NOT EXISTS commission_amount_pence integer NOT NULL DEFAULT 15000;

ALTER TABLE lead_assignments
  ADD COLUMN IF NOT EXISTS commission_amount_pence integer,
  ADD COLUMN IF NOT EXISTS customer_email          text,
  ADD COLUMN IF NOT EXISTS customer_phone          text,
  ADD COLUMN IF NOT EXISTS stripe_session_id       text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text,
  ADD COLUMN IF NOT EXISTS payment_failed_at       timestamptz;
