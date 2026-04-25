# lead_payment_sessions cache table

**What changed**
- `supabase/migrations/2026-04-25_002_lead_payment_sessions.sql` — new migration: `lead_payment_sessions` table with `lead_assignment_id` FK, `stripe_session_id` unique, `stripe_session_url`, `expires_at`, `status` (active/expired/completed), price snapshots, RLS + service-role policy. Two indexes: one for "latest active session per lead" (preview page hot path), one for "find session by Stripe id" (webhook lookup).

**Why**
Step 3 of the customer payment flow handover. The `/preview/[leadId]` page needs a fast lookup for "is there an active checkout session for this lead?" — without a cache row, every preview render would either create a new Stripe session (cost + waste) or have to round-trip through Stripe's list API. The cache also gives us a stable contractor-attribution anchor: the session was created when the salesperson tapped "Take payment", so the metadata (lead_assignment_id, salesperson_id) on the Stripe session is the source of truth for who gets paid.

**Stack**
Supabase Postgres (RLS).

**Integrations**
Stripe Checkout (session_id is Stripe's). Used by step 4 (create-checkout) and step 6 (preview page).

**How to verify**
1. Run `supabase/migrations/2026-04-25_002_lead_payment_sessions.sql` in Supabase SQL Editor.
2. Verify in Supabase Table Editor: row appears, RLS enabled, indexes present.
3. After step 4 ships: tap "Take payment" → row appears with `status='active'` and a future `expires_at`.

**Known issues**
- Migration must be run manually in Supabase SQL Editor before deploy.
- No helper module yet — the table is consumed by step 4 (create-checkout rewrite). Helper functions land there.
