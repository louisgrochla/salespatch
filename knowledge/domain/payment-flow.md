---
tags: [payment, stripe, commission, checkout]
related: [../entities/entity-lead.md, ../domain/lead-lifecycle.md]
---

# Payment Flow

Revenue comes from businesses purchasing their AI-generated website. Salespeople earn commission.

## Stripe Connect Setup

- Each salesperson onboards to Stripe Connect (express accounts).
- Onboarding endpoint: `POST /api/payments/connect-onboard` (sales-dashboard) or `POST /payments/connect-onboard` (mobile-api).
- Stripe account ID stored in Supabase `salesperson_metrics.stripe_connect_id`.

## Checkout Flow

1. Customer decides to buy → salesperson initiates checkout (or marks pitch outcome `closed_now`/`closed_followup` to record a relationship sale).
2. `POST /api/payments/create-checkout` creates a Stripe Checkout Session.
3. Customer pays → Stripe fires webhook to `POST /api/payments/webhook`.
4. Webhook confirms payment → `paid_at` set (strictly stronger than `sold_at`).
5. Commission calculated and credited.

## Pricing models — two paths

**Default (locked beta):** £299 setup + £25/mo recurring (30-day trial). Subscription is created by the webhook AFTER `checkout.session.completed`. Setup fee comes from `SETUP_FEE_PENCE`; monthly amount displayed is `MONTHLY_PENCE` (actual charge is pinned to `STRIPE_HOSTING_PRICE_ID`).

**Flat one-time (negotiated):** when `lead_assignments.agreed_price_pence` is set (captured at pitch time on `closed_now`/`closed_followup` outcomes), that amount overrides the env default AND the webhook **skips** creating the £25/mo subscription. Session metadata carries `billing_model='flat_one_time'`; preview/onboarding UI suppresses the "/mo" line and the welcome email omits the hosting rows.

## Sold vs paid — the deferred-payment pattern

For relationship sales (verbal close, Stripe deferred to pre-launch) the assignment can be `status='sold' AND paid_at IS NULL`. Every "already done, skip" guard in the payment flow keys on `paid_at`, NOT `status`, so payment can still be collected later:
- `payments.ts createCheckoutSessionForAssignment` refuses only when `paid_at != null`.
- `webhook/route.ts handleCheckoutCompleted` skips only when `paid_at != null`; the paid UPDATE uses `.is('paid_at', null)`.
- `/preview/[leadId]` and `/onboarding/[leadId]` show the pay CTA (or redirect to `/paid`) based on `paid_at`.

## Payout Tracking

- Sales dashboard `/payouts` page shows: pending, paid, total commission.
- Mobile-api `/payments/status/:demo_id` checks payment state.
- `lead_assignments.commission_amount` stores the final commission for that sale.

## Environment Variables

- `STRIPE_SECRET_KEY` — server-side Stripe API key
- `STRIPE_PUBLISHABLE_KEY` — client-side (exposed to browser)
- `STRIPE_WEBHOOK_SECRET` — validates webhook signatures

## Key Files

- Sales dashboard: `apps/sales-dashboard/src/app/api/payments/` (3 routes)
- Mobile API: `apps/mobile-api/src/routes/payments.ts`
- Supabase: `salesperson_metrics` table, `pitch_outcomes` table
