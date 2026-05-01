# 2026-05-01 — sales_users.stripe_connect_id missing in prod

## What changed
- New migration `supabase/migrations/2026-05-01_002_sales_users_stripe_connect.sql` adds `stripe_connect_id text` to `sales_users` (idempotent `ADD COLUMN IF NOT EXISTS`).
- `supabase/sales-dashboard-tables.sql` updated to include the column in the canonical `CREATE TABLE` so fresh setups don't repeat the bug.

## Why
Every `/admin/users/<id>` page was rendering "Lookup failed — User not found." `GET /api/admin/salespeople/[id]` selects `stripe_connect_id` on `sales_users`, but the original `sales-dashboard-tables.sql` never declared that column. Postgres errored on the SELECT, the route fell through to the 404 branch, and the UI showed "User not found" for every account. Same column is also read by `/api/payments/connect` and `/api/payments/payout`, so onboarding + payouts were broken too.

## Stack
- Supabase (Postgres) — DDL migration
- Next.js — no app code changed; the existing routes already reference the column

## Integrations
- Stripe Connect — `stripe_connect_id` is the destination account for admin-triggered transfers in `/api/payments/payout`

## How to verify
1. Run `supabase/migrations/2026-05-01_002_sales_users_stripe_connect.sql` in the Supabase SQL Editor against the production project.
2. Reload `/admin/users` on `salespatch.co.uk` and tap any contractor — page should load with full profile, stats, recent leads, Money section, activity timeline.
3. The Money section's "Pay £X" button stays disabled with the amber "hasn't finished Stripe Connect onboarding" notice until `stripe_connect_id` is populated for that user (expected — onboarding via `/api/payments/connect` writes it).

## Known issues
- Existing rows in `sales_users` get `stripe_connect_id = NULL`. Salespeople have to complete Stripe Connect onboarding (handled by `/api/payments/connect`) before admin can pay them out. Pre-existing constraint, not a regression.
