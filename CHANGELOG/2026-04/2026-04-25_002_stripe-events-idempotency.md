# Stripe webhook idempotency

**What changed**
- `supabase/migrations/2026-04-25_001_stripe_events.sql` — new migration: `stripe_events` table (PK = Stripe event_id, plus `type`, `received_at`, `processed_at`). RLS enabled, service role policy.
- `apps/sales-dashboard/src/lib/stripe-events.ts` — new helper: `claimStripeEvent` and `markStripeEventProcessed`. Dedup gate is `processed_at IS NOT NULL`, so failed handler attempts are correctly retried by Stripe (no event silently swallowed).
- `apps/sales-dashboard/src/app/api/payments/webhook/route.ts` — claim-then-process middleware: returns 200 with `duplicate: true` on already-processed events; marks `processed_at` after successful handler run.

**Why**
Step 2 of the customer payment flow handover. Stripe retries the same event under flaky network conditions. Without this gate, contractors get paid twice. Must land before any further webhook logic changes (step 5).

**Stack**
Next.js 14 (Edge/Node webhook route), Supabase Postgres (RLS), Stripe SDK.

**Integrations**
Stripe webhook events (currently only `checkout.session.completed` is processed; idempotency now applies to any future event types added in step 5).

**How to verify**
1. Run `supabase/migrations/2026-04-25_001_stripe_events.sql` in Supabase SQL Editor.
2. Use Stripe CLI to forward webhooks: `stripe listen --forward-to <preview-url>/api/payments/webhook`.
3. Trigger `stripe trigger checkout.session.completed` — first delivery returns 200, row in `stripe_events` with `processed_at` set.
4. Manually re-deliver the same event from Stripe dashboard → second delivery returns `{received: true, duplicate: true}` 200, no commission state changes.
5. Force a handler error (e.g. break supabase URL) → first delivery 500, `processed_at` stays NULL. Restore env and re-deliver → handler runs again, `processed_at` set.

**Known issues**
- Concurrency: two simultaneous deliveries for the same un-processed event could both process. Stripe serialises retries (~60s gap) so unlikely in practice. If observed, switch to row-level lock per event_id.
- Migration must be run manually in Supabase SQL Editor before deploy. There's no automated migration runner in this repo.
