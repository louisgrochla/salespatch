# Webhook rewrite — commission paid only on confirmed payment

**What changed**
- `apps/sales-dashboard/src/app/api/payments/webhook/route.ts` — full rewrite. New event dispatch (`checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`, `customer.subscription.created`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`). Commission flow:
  - HARD GUARD: `session.payment_status === 'paid'` checked before any commission state changes.
  - Reads `commission_amount_pence` off the contractor's `sales_users` row — never hardcoded.
  - Updates `lead_assignments` with `status='sold'`, `sold_at`, `commission_amount_pence`, `customer_email`, `customer_phone`, `stripe_session_id`, `stripe_customer_id`. Atomic-ish via `.neq('status', 'sold')` guard.
  - Marks `lead_payment_sessions` row completed.
  - Spawns the £25/mo subscription with `trial_end = now + 30d` so the recurring fee starts 30 days after the £350 setup payment.
  - Cross-checks: refuses to credit if `metadata.salesperson_id` doesn't match `assignment.user_id`.
- `apps/sales-dashboard/src/lib/stripe.ts` — adds `getStripeHostingPriceId()` for the £25/mo recurring price ID (per-mode env vars: `STRIPE_HOSTING_PRICE_ID` / `STRIPE_TEST_HOSTING_PRICE_ID`).

**Why**
Step 5 of the customer payment flow handover. Per the user's hard correction: salesperson is paid on confirmed purchase, NOT on QR scan. QR-gen creates the eager-attribution session but never touches commission. Only this webhook, with `payment_status='paid'`, accrues commission.

**Stack**
Next.js 14, Stripe SDK 21+ (note: `Invoice.subscription` moved to `Invoice.parent.subscription_details.subscription`), Supabase Postgres.

**Integrations**
Stripe webhook events. Stripe Subscriptions API (server-side `subscriptions.create` with `trial_end` for the recurring £25/mo). Supabase `lead_assignments`, `lead_payment_sessions`, `cost_log`, `sales_users`, `stripe_events`.

**How to verify**
1. Pre-req: `STRIPE_HOSTING_PRICE_ID` (live) or `STRIPE_TEST_HOSTING_PRICE_ID` (test) must be set in Vercel env. Create a £25/mo recurring price in Stripe Dashboard for each mode and paste the IDs in.
2. Trigger `checkout.session.completed` via Stripe CLI with realistic metadata: `lead_assignment_id` matching a real assignment, `salesperson_id` matching `assignment.user_id`, `payment_status='paid'`.
3. Verify in Supabase:
   - `lead_assignments`: status='sold', commission_amount_pence == sales_users.commission_amount_pence for that contractor, sold_at set, customer_email/phone if Stripe provided them, stripe_session_id set.
   - `lead_payment_sessions`: status='completed', completed_at set.
   - `cost_log`: row with service='stripe' and approx 1.4% + 20p of £350.
   - Stripe dashboard: subscription created with trial_end ~30 days out.
4. Re-trigger the same event id → idempotency claim returns duplicate, no double-credit.
5. Trigger with `payment_status='unpaid'` → handler logs and ignores; no state change.
6. Trigger with mismatched `salesperson_id` metadata vs assignment.user_id → handler logs and refuses; no state change.

**Known issues**
- If `STRIPE_HOSTING_PRICE_ID` is unset, the £350 captures fine but the £25/mo subscription is skipped with a loud warning. Ops would need to manually attach a subscription in that case. Acceptable for the beta as the price ID is a one-time setup.
- Subscription creation failure is non-fatal (logged not thrown) so a Stripe API blip doesn't bounce the webhook into retry-loop hell. Manual reconciliation from logs.
- Push notification to contractor not yet wired — iOS polling (step 9) handles foreground UX, push is a v2 enhancement.
