# Stripe test/live mode env switch

**What changed**
- `apps/sales-dashboard/src/lib/stripe.ts` — rewritten to be mode-aware. New helpers: `getStripeMode`, `getStripeSecretKey`, `getStripePublishableKey`, `getStripeWebhookSecret`. `getStripe()` now caches per-mode. Defence-in-depth: refuses to use `sk_live_` keys when `STRIPE_MODE=test` and vice versa.
- `apps/sales-dashboard/src/app/api/payments/create-checkout/route.ts` — switched from raw `process.env.STRIPE_SECRET_KEY` lookup to `getStripeSecretKey()` so it picks up the test key when `STRIPE_MODE=test`.
- `apps/sales-dashboard/src/app/api/payments/webhook/route.ts` — switched from raw `process.env.STRIPE_WEBHOOK_SECRET` lookup to `getStripeWebhookSecret()`.

**Why**
Step 1 of the customer payment flow handover (`HANDOVER_PAYMENT_FLOW.md`). Currently `STRIPE_SECRET_KEY` on Vercel is the live key — without a mode switch, any payment code we write in dev would charge real cards. This must land before any payment code is written or modified.

**Stack**
Next.js 14, Stripe SDK (`stripe@21`), TypeScript.

**Integrations**
Stripe (test + live modes). New env vars expected in deployment (added later, not now): `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_PUBLISHABLE_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_MODE`.

**How to verify**
- Production: `STRIPE_MODE=live` (or unset) + existing `STRIPE_SECRET_KEY` — payments behave as before. No regression.
- Preview: setting `STRIPE_MODE=test` without test keys returns clean 500 from payment routes (not a crash, not an accidental live charge).
- Defence check: setting `STRIPE_MODE=test` with a `sk_live_…` key throws `does not start with sk_test_. Refusing to use.` — verified by `getStripeSecretKey()` prefix guard.

**Known issues**
- Test keys not yet provisioned in Vercel (user needs to grab from Stripe dashboard). Code is ready; env vars will be added later.
- Pre-existing typescript errors in unrelated `apps/sales-dashboard` files (admin/* pages, leaflet types) — not introduced by this change.
