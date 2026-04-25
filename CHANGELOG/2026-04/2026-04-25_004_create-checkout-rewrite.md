# Rewrite POST /api/payments/create-checkout for lead_id-only flow

**What changed**
- `supabase/migrations/2026-04-25_003_payment_columns.sql` — adds `commission_amount_pence` (default 15000) to `sales_users`; adds payment-flow columns to `lead_assignments` (`commission_amount_pence`, `customer_email`, `customer_phone`, `stripe_session_id`, `stripe_customer_id`, `stripe_subscription_id`, `payment_failed_at`).
- `apps/sales-dashboard/src/lib/payments.ts` — new helper. Money model constants (SETUP_FEE_PENCE=35000, MONTHLY_PENCE=2500), `getActiveSessionForAssignment`, `createCheckoutSessionForAssignment`, `getOrCreateActiveSession`, `previewUrlFor`. Builds `mode='payment'` Stripe Checkout (one-time £350) with `setup_future_usage='off_session'` and metadata locking `lead_assignment_id`/`salesperson_id`. Caches session in `lead_payment_sessions`.
- `apps/sales-dashboard/src/app/api/payments/create-checkout/route.ts` — fully rewritten. Auth-required, body `{lead_id}` only (legacy `lead_assignment_id` still accepted). Authorises assignment ownership before creating session. Returns `preview_url`, `checkout_url`, `session_id`, `session_expires_at`. Refuses if assignment status is already 'sold' (409).

**Why**
Step 4 of the customer payment flow handover. Backend must work before iOS can call it. Eager attribution means contractor's `salesperson_id` is in Stripe metadata before any customer interaction — when the webhook fires, attribution is unambiguous. The session id cache means the preview page (step 6) and Stripe webhook (step 5) can route on a stable id.

**Stack**
Next.js 14 (route handler), Supabase Postgres, Stripe SDK (`mode: 'payment'`).

**Integrations**
Stripe Checkout (hosted page, full-page redirect — not embedded). The recurring £25/mo subscription is NOT created here; it'll be created server-side in the webhook (step 5) with `trial_end = now + 30 days`. This matches the user's locked decision: customer pays £350 once, then £25 starting 30 days later.

**How to verify**
1. Run migrations 003 in Supabase SQL Editor (003_payment_columns).
2. With STRIPE_MODE=test (and test keys set), POST to `/api/payments/create-checkout` with `{lead_id: "<existing-assignment-id>"}` and a valid Bearer token.
3. Response should include a `checkout_url` starting with `https://checkout.stripe.com/...`.
4. A new row in `lead_payment_sessions` with `status='active'`, the Stripe session id, expires_at ~7 days out.
5. Call again with the same lead_id → returns the SAME session (cache hit, no new Stripe session created).
6. Call with a `lead_id` that doesn't belong to the caller → 403.

**Known issues**
- Mobile-API endpoint `apps/mobile-api/src/routes/payments.ts` still uses the old shape (`demo_id`, `business_name`, etc.) via a separate stripe wrapper package. Not touched — outside the salesperson-iOS path. Will be migrated separately if iOS ever uses it (currently doesn't for the customer payment flow).
- Existing iOS `APIClient` calls this route with the OLD body shape. Step 8 updates iOS to send `lead_id`. Until then, iOS payments break with 400 — acceptable as iOS payment UI also gets rewritten in steps 8–9.
- Webhook still uses old `pitch_outcomes`/`salesperson_metrics` flow with hard-coded £50. Step 5 rewrites the webhook to use the new commission/lead_assignments shape.
