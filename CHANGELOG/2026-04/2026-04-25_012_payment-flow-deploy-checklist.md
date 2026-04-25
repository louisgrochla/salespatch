# Payment flow — pre-deploy checklist

**What changed**
- Nothing (this entry is the deploy checklist for the 11-step payment flow shipped today).

**Why**
Step 11 of the customer payment flow handover is end-to-end testing on real devices with real Stripe test cards and one £1 live transaction. That requires environment setup and a deploy — both of which are the user's call.

**Pre-deploy environment setup (do in this order)**

### 1. Run Supabase migrations
In Supabase SQL Editor, run in order:
- `supabase/migrations/2026-04-25_001_stripe_events.sql`
- `supabase/migrations/2026-04-25_002_lead_payment_sessions.sql`
- `supabase/migrations/2026-04-25_003_payment_columns.sql`
- `supabase/migrations/2026-04-25_004_lead_onboarding_responses.sql`

### 2. Create Supabase Storage bucket
In Supabase Dashboard → Storage → New bucket:
- Name: `customer-uploads`
- Public: ON (or implement signed download URLs everywhere photos are read)

### 3. Set up Stripe in TEST mode first
In Stripe Dashboard (test mode):
- API keys → copy `sk_test_…` + `pk_test_…`
- Products → create "Hosting & support" recurring £25 GBP / month → note the **price ID** (`price_…`)
- Webhooks → add endpoint `https://salespatch.co.uk/api/payments/webhook` (or preview URL) → select events:
  - `checkout.session.completed`
  - `checkout.session.expired`
  - `payment_intent.payment_failed`
  - `customer.subscription.created`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `charge.refunded`
- Copy the test webhook secret (`whsec_…`)

### 4. Vercel preview env (test mode)
Add to Vercel preview deployments:
- `STRIPE_MODE=test`
- `STRIPE_TEST_SECRET_KEY=sk_test_…`
- `STRIPE_TEST_PUBLISHABLE_KEY=pk_test_…`
- `STRIPE_TEST_WEBHOOK_SECRET=whsec_…`
- `STRIPE_TEST_HOSTING_PRICE_ID=price_…`

### 5. Per-contractor commission setup
- Sign in as admin → /admin/users/[id] for each beta contractor
- Set their commission to £150 (or whatever you decide). Default is £150 (15000p).

### 6. Deploy preview to Vercel
**STOP — confirm STRIPE_MODE=test before deploying.** Then `vercel --prod=false` (or push branch for preview).

### 7. End-to-end test (test mode)
On a real iPhone with the iOS app pointing at the preview deployment:
- [ ] Tap "Take payment" on a lead with a `demoSiteDomain` set.
- [ ] QR appears with `salespatch.co.uk/preview/<assignment-id>`. NO doubled-`https://`.
- [ ] Customer scans QR on a separate iPhone → demo loads in <1.5s with sticky bottom bar reading `Go live now · £350 setup, then £25/mo →`.
- [ ] Customer taps the bar → Stripe Checkout opens with test card `4242 4242 4242 4242` / any future date / any CVC.
- [ ] Payment succeeds → redirects to `/onboarding/<id>` step 1.
- [ ] Fill 5 questions; each field auto-saves with a "✓ Saved" indicator. Refresh → answers persist.
- [ ] Photo upload → shows ✓ filename in the list. Check Supabase Storage `customer-uploads/<id>/`.
- [ ] Finish → "You're in" final state. `lead_onboarding_responses.completed_at` populated.
- [ ] Salesperson's iOS within ≤5s of webhook fire: share sheet auto-dismisses, full-screen "✓ Paid · £150 in your wallet" appears.
- [ ] Verify Supabase `lead_assignments` row: `status='sold'`, `sold_at`, `commission_amount_pence=15000`, `customer_email`, `customer_phone`, `stripe_session_id`, `stripe_customer_id`.
- [ ] Verify Stripe Dashboard: a subscription exists with the customer, status `trialing`, trial_end ~30 days.
- [ ] Re-trigger the same webhook event from Stripe Dashboard → response is `{received:true, duplicate:true}`. No double-credit.
- [ ] Re-visit `/preview/<id>` → shows "✓ Paid — your real site is being built" instead of the CTA.

### 8. Set up Stripe in LIVE mode
Repeat step 3 in live mode:
- `sk_live_…`, `pk_live_…`, live webhook endpoint + secret, live recurring price ID.

### 9. Vercel production env (live mode)
Add to Vercel production:
- `STRIPE_MODE=live`
- `STRIPE_SECRET_KEY=sk_live_…` (already set if existing payments worked)
- `STRIPE_PUBLISHABLE_KEY=pk_live_…`
- `STRIPE_WEBHOOK_SECRET=whsec_…`
- `STRIPE_HOSTING_PRICE_ID=price_…`

### 10. Deploy production
**STOP — confirm STRIPE_MODE=live and the live webhook endpoint is registered.**
`cd apps/sales-dashboard && vercel --prod --yes`

### 11. One real £1 test
- Update the setup price to £1 temporarily, OR use Stripe Refund flow.
- Run end-to-end with a real card.
- Refund yourself afterward.
- Restore price to £350.

**How to verify**
This *is* the verification doc. Tick each [ ] box.

**Known issues / open follow-ups**
- Push notifications to contractor on sold (currently iOS polling-only).
- 14-day refund waiver custom field on Stripe Checkout (UK Consumer Contracts Regs).
- Clawback policy on refund — write into contractor agreement.
- VAT on £350 — decide "inc. VAT" vs "+ VAT" before crossing £90k threshold.
- Domain handling on day 1: capture is wired; manual fulfilment process to be documented separately.
- SMS reminder at +24h for abandoned onboarding forms.
- `customer-uploads` bucket permissions: public read assumed. Switch to signed download URLs if data sensitivity requires.
- Mobile-api `/payments/checkout-url` route still uses old shape — not touched, kept for safety, no longer called by the iOS payment flow.
