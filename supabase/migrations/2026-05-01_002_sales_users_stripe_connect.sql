-- ============================================================
-- 2026-05-01 002 — sales_users.stripe_connect_id
-- ============================================================
-- The original sales-dashboard-tables.sql never included this column,
-- so production sales_users is missing it. The admin user-detail GET
-- (/api/admin/salespeople/[id]) selects it, which made every fetch
-- error out with "User not found" once the manual-payout feature
-- shipped. /api/payments/connect and /api/payments/payout also need it.
--
-- Idempotent: safe to re-run.
--
-- Run in Supabase SQL Editor.

ALTER TABLE sales_users
  ADD COLUMN IF NOT EXISTS stripe_connect_id text;
