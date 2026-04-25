# Handover — Customer payment + preview + onboarding flow

Paste this whole file into a fresh Claude Code thread to implement.

---

## What this builds

A salesperson shows a demo on their iOS app. They tap **Share / Take payment**. Their phone shows a QR. The customer scans it on **their own phone** and lands on `salespatch.co.uk/preview/<lead_id>` — the demo site with a sticky cream-on-ink bottom bar that says:

```
Get this site live · £350 setup, then £25/mo  →
```

Customer scrolls the demo on their own phone, in their own hand. When they're convinced, they tap the bar. Stripe Checkout opens (full-page redirect). They pay. They land on `salespatch.co.uk/onboarding/<lead_id>` — a 5-step questionnaire (contact / top changes / photos / domain / anything else). Each answer auto-saves. Final screen: "You're in. We'll text you within 24h."

Meanwhile, the salesperson's iOS app is polling `/api/leads/:id` every 3 seconds while the QR is up. The moment the Stripe webhook fires, the lead flips to `sold` and the iOS screen shows a celebratory "✓ Paid · £50 in your wallet" state. The conversation ends with a clean handshake.

---

## Why this flow (not the alternative)

We considered: customer pays on the salesperson's phone via the iOS app. We rejected it. **Customer-on-their-own-phone wins** because:

1. The customer holds their own device — no germy phone hand-off, no "feeling watched while paying".
2. They scroll the demo at their own pace; salesperson can step back.
3. Post-payment dopamine is highest 0–60s after card clears — that's exactly when we want the onboarding answers.
4. PCI scope stays at zero (Stripe-hosted Checkout via full-page redirect).

The salesperson's role is: show, hand the customer a QR, step back, and watch the iOS app for the green-tick flip.

---

## Settle these four decisions BEFORE writing any code

These choices propagate everywhere. Lock them in writing:

### 1. Sticky CTA copy

Recommended baseline:
```
Get this site live · £350 setup, then £25/mo  →
```

The recurring fee MUST appear on the bar, not just on the Checkout page. UK consumer law on subscription disclosure is tightening — hide it and you'll get chargebacks. Test variations against this baseline; do not drop the recurring disclosure.

### 2. Onboarding question count

Recommended five:

1. **Confirm contact** — best mobile to text on (we already have email from Stripe).
2. **Top 3 changes for day 1** — single textarea, optional, framed as "bigger asks come after launch" so we don't bleed margin.
3. **Photos** — direct upload to Supabase Storage `customer-uploads` bucket OR SMS fallback ("text to 0…").
4. **Domain** — toggle: "Got a domain?" → if yes, capture it; if no, ask for top 3 preferred names in priority order.
5. **Anything else?** — optional textarea, 30-second cap.

Each answer auto-saves to a new `lead_onboarding_responses` table on every keystroke (debounced 500ms). No "Submit at end" button — bail-mid-form recovery is critical.

### 3. Domain handling on day 1

Pick one and write it into the answer to question 4:
- **Always launch on `<biz-slug>.salespatch.co.uk`**, then migrate to customer's domain post-launch (simpler, faster ship time).
- **If customer has a domain, use theirs from day 1** (more impressive, more support burden).

Recommendation: launch on subdomain, migrate later. Sets clearer expectations.

### 4. Photo intake mechanism

- Direct upload to Supabase Storage from the onboarding form (most reliable).
- SMS to a Twilio number that Webhooks into the same bucket (lower friction, more infra).

Recommendation: **direct upload as primary, SMS as fallback link** ("Or text photos to 07xxx — we'll match them to your record by sender number"). Build the upload first; SMS can be a v2.

### Plus: settle these legal/finance items

- **14-day refund window** (UK Consumer Contracts Regulations 2013): for a £350 service that hasn't been delivered, customer has 14 days to cancel for any reason. Add a Stripe Checkout custom field: "I want my site delivered within 14 days, I waive my right to cancel" (Stripe supports this). Without the waiver, you can't start fulfilment until day 15.
- **Clawback policy**: if customer refunds at day 12, do you claw back the contractor's £50? Earlier docs say "no clawback" — that's a marketing promise that costs you £50 per refund. Confirm or change. Whatever you decide, write it into the contractor agreement.
- **VAT**: at £350/sale you hit the £90k UK VAT threshold at ~257 sales. Decide _now_: is the published price "£350 inc. VAT" (you eat 20% margin once registered) or "£350 + VAT" (price visibly jumps £70 the day you register)? Don't surprise yourself.

---

## Architecture

### URLs

- **`/preview/<lead_id>`** — public, no auth. Customer's phone lands here from the QR. Server-renders the demo HTML inline + sticky CTA. Cached at edge keyed by `lead_id` (revalidate every 60s so updates propagate).
- **`/onboarding/<lead_id>`** — public, no auth. Customer redirected here after Stripe success. 5-step form, auto-saves to Supabase. Stable URL — customer can come back and finish later.
- **`/paid/<lead_id>`** — fallback thank-you if onboarding skipped or errored.

### Stripe session lifecycle

Eager creation, lazy refresh:

1. Salesperson taps "Take payment" in iOS → `POST /api/payments/create-checkout` with `lead_id` only.
2. Backend looks up assignment + contractor + commission_rate + demo URL. Creates Stripe session in `mode: 'subscription'` with:
   - One-time invoice item: £350.
   - Subscription priced at £25/mo with `trial_period_days: 30`.
   - `metadata: { lead_assignment_id, salesperson_id }`.
   - `success_url: https://salespatch.co.uk/onboarding/<lead_id>?session_id={CHECKOUT_SESSION_ID}`.
   - `cancel_url: https://salespatch.co.uk/preview/<lead_id>`.
   - `expires_at`: 7 days out (Stripe max).
   - `customer_creation: 'always'` — so Stripe builds a Customer record we can subscribe.
3. Returns `{ preview_url, checkout_url, session_expires_at }`.
4. iOS QR encodes **only `preview_url`**. Never the Checkout URL — too long to scan, and changes on session refresh.
5. Preview page reads `lead_id` from path. On render, fetches the most-recent non-expired Stripe session for that lead from `lead_payment_sessions` table. If expired or missing, recreates one server-side and caches the new ID. Customer never sees the seam.

### Webhook idempotency (non-negotiable)

Add a `stripe_events` table:

```sql
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,                      -- Stripe event_id
  type TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
```

Webhook handler checks `INSERT INTO stripe_events ON CONFLICT DO NOTHING` first. If the event already exists, return 200 immediately without processing. Stripe retries the same event under flaky network conditions; without this, contractors get paid twice.

### Webhook events to handle

- `checkout.session.completed` — flip `lead_assignments.status='sold'`, set `sold_at`, `commission_amount` (from assignment's commission_rate or fixed £50), stash `customer_email` + `customer_phone` on the lead's notes JSON, fire push to contractor.
- `checkout.session.expired` — clear the cached session id; preview page will create a fresh one on next view.
- `payment_intent.payment_failed` — mark a soft "payment_failed_at" but DO NOT change lead status. Customer might retry.
- `customer.subscription.created` — log the subscription_id on the lead so you can manage it later.
- `invoice.payment_succeeded` — for the £25/mo recurring; don't change lead status, just log to a `customer_invoices` table for revenue tracking.
- `invoice.payment_failed` — fire ops alert; don't touch lead.
- `charge.refunded` — out of scope for v1, but plan for it: trigger admin notification + decide clawback policy.

### Test/live key separation (do BEFORE any payment code)

Currently `STRIPE_SECRET_KEY` on Vercel is the **live key**. First time you write a Checkout integration in dev you _will_ accidentally charge a real card. Fix this _before_ writing any payment code:

```ts
// src/lib/stripe.ts
export function getStripe() {
  const mode = process.env.STRIPE_MODE ?? 'live';
  const key =
    mode === 'test'
      ? process.env.STRIPE_TEST_SECRET_KEY
      : process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe secret key missing for mode ' + mode);
  return new Stripe(key);
}
```

Add `STRIPE_TEST_SECRET_KEY` and `STRIPE_TEST_PUBLISHABLE_KEY` env vars. Set `STRIPE_MODE=test` on Vercel preview deployments, `STRIPE_MODE=live` on production.

### iOS polling

While the QR sheet is up:
```swift
// LeadDetailView or wherever QRCodeView is presented
.task(id: leadId) {
    while !Task.isCancelled {
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        if let updated = try? await api.fetchLead(id: leadId), updated.status == .sold {
            withAnimation { showPaidConfetti = true }
            break
        }
    }
}
```

When the lead flips to sold, transition to a "✓ Paid · £50" celebratory state. The QR auto-dismisses. The salesperson can close the conversation immediately and confidently. **This is essential UX, not a nice-to-have.**

---

## Bug to fix first

The current iOS QR (screenshot from session) encodes:
```
https://https://llaknqdcfvnvrdttxngd.supabase.co/storage/v1/object/public/demo-sites/11fable.html
```

Two `https://` prefixes. Looks like the iOS code prepends `https://` to a string that already has it. Find the prepend logic in `apps/ios/SalesFlow/SalesFlow` (likely `QRCodeView.swift` or `DemoShareSheet.swift` or wherever the demo URL is built) and unconditionally normalise:

```swift
let url = rawURL.hasPrefix("http") ? rawURL : "https://\(rawURL)"
```

This stops mattering the moment the QR encodes `https://salespatch.co.uk/preview/<lead_id>` instead of the raw Supabase URL — but fix the bug regardless so the iOS app never produces malformed URLs.

---

## What's already built (reuse, don't rebuild)

- **iOS**: `QRCodeView`, `DemoShareSheet`, `ClientPresentationView`. Both currently encode the raw demo URL.
- **Backend**: `POST /api/payments/create-checkout` exists at `apps/sales-dashboard/src/app/api/payments/create-checkout/route.ts` (or similar — check `api/payments/`). Currently takes `demo_id, salesperson_id, business_name, customer_email`. **Rewrite to take `lead_id` only and derive everything from the assignment row.**
- **Webhook**: `apps/sales-dashboard/src/app/api/payments/webhook/route.ts` exists, signature-verified. Currently writes to `pitch_outcomes` and `salesperson_metrics`. **Add idempotency middleware + `lead_assignments.status='sold'` update.**
- **Demo storage**: Supabase public bucket `demo-sites`, URL stashed in `lead_assignments.notes.demo_site_domain`.
- **Custom domain**: `salespatch.co.uk` is live on Vercel. Use it for all customer-facing URLs.
- **Brand system**: `apps/sales-dashboard/src/lib/brand.tsx` — full token palette + primitives. Use these for the preview overlay and onboarding pages.

---

## Order of operations (do in this order, not parallel)

| Step | What | Time | Why this order |
|------|------|------|----------------|
| 1 | `STRIPE_MODE` env switch + lazy `getStripe()` for test/live separation | 30 min | Before any payment code so you don't charge real cards in dev |
| 2 | `stripe_events` idempotency table + webhook middleware | 1 hr | Before reworking webhook logic |
| 3 | `lead_payment_sessions` table for caching active session ids per lead | 30 min | Needed by step 4 |
| 4 | Rewrite `POST /api/payments/create-checkout` to take `lead_id`, mode `subscription` with trial, store metadata, cache session id | 2–3 hrs | Backend must work before iOS calls it |
| 5 | Rewrite webhook: flip lead to sold, write `customer_email/phone/sold_at/commission_amount/stripe_session_id`, push to contractor | 2 hrs | Closes the loop server-side |
| 6 | Build `/preview/[leadId]` page: server-fetch demo + inject sticky CTA + scan-tracking POST | 4 hrs | Now the customer-facing surface exists |
| 7 | Build `/onboarding/[leadId]` page: 5-step form with auto-save | 3 hrs | Post-payment landing |
| 8 | iOS `APIClient.createCheckout(leadId:)` + repurpose `QRCodeView` to fetch + encode preview URL | 2 hrs | Salesperson path |
| 9 | iOS polling-while-QR-up, celebratory paid state | 1 hr | The closing handshake |
| 10 | `/paid/[leadId]` thank-you fallback page | 30 min | If onboarding skipped |
| 11 | End-to-end test: real iPhone, real Android, Stripe test cards (4242…), then one real £1 transaction in live mode to verify | 2 hrs | Don't skip — find the bugs before contractors do |

Total: ~16 hours focused work. Don't try to ship in less; you'll skip step 1 or 2 and regret it during the first refund.

---

## Edge cases to plan for

- **Customer doesn't have their phone or has a janky camera** → keep the SMS share path the iOS app already has. Salesperson texts the preview URL.
- **Customer scans, browses, walks out** → reusable preview link, comes back tomorrow. They show their partner; partner scans on a different phone; the same Stripe session works (or auto-refreshes if expired).
- **Customer pays then scans again** → preview page detects `paid_at IS NOT NULL` on the assignment and shows a "✓ Paid — your site is being built" state instead of the CTA bar. Avoids accidental double-payments.
- **Customer's phone signal drops mid-Checkout** → Stripe handles this gracefully on reconnect. Your job is just stable URLs.
- **3G in a basement bookshop in Aberdeen** → server-render the preview, edge-cache the demo HTML, lazy-load images. First paint must be under 1.5s on a throttled connection.
- **Customer disputes 30 days later** → 14-day decision (above) covers it. Webhook handler for `charge.refunded` should fire ops alert + admin action to mark lead refunded + clawback per policy.
- **Onboarding form abandonment** → auto-save means you keep what you got. Send a follow-up SMS at +24h: "Hey [name], finish setting up [biz] here: [link]". Recovers ~30%.

---

## Mobile preview page hardening

- `viewport-fit=cover` and respect safe-area-insets — sticky CTA must clear iOS home indicator and Android nav bar.
- QR error correction level **`H` (30%)** — at arm's length in mixed lighting, M misses too often.
- Test the preview page at 320pt width (iPhone SE) — CTA must not truncate.
- Light-tile background behind the QR in iOS — the dark brand UI is gorgeous but QR scanners hate dark backgrounds. Wrap the QR in a cream square inside the dark card.
- Strip or wrap inline `<a href>` links in the demo HTML server-side. The demo will have its own "Order now" / "Book" buttons that 404 in preview context. Either regex them out, or wrap in a click-handler that shows "This is a preview — get the real site below ↓".

---

## Tracking the scan

When the customer's phone first hits `/preview/<lead_id>`, fire `POST /api/leads/:id/viewed` server-side. Now the contractor's iOS app can show "Demo viewed 12s ago" before the payment lands. If the customer says "let me think", the salesperson knows they actually engaged. Useful signal.

---

## Reference files (read before starting)

1. `apps/sales-dashboard/src/app/api/payments/create-checkout/route.ts` — current payments entry point.
2. `apps/sales-dashboard/src/app/api/payments/webhook/route.ts` — current webhook logic.
3. `apps/sales-dashboard/src/lib/stripe.ts` — lazy Stripe client (extend for test/live mode switch).
4. `apps/sales-dashboard/src/lib/brand.tsx` — design primitives for preview + onboarding pages.
5. `apps/sales-dashboard/src/app/admin/leads/page.tsx` — example of how rich form pages are built in this brand.
6. `apps/sales-dashboard/public/site/apply.html` — example of dark-themed multi-step flow with auto-save (the apply form already does the pattern you'll copy for onboarding).
7. iOS: `QRCodeView.swift`, `DemoShareSheet.swift`, `ClientPresentationView.swift`, `APIClient.swift` — current QR + demo flow.

---

## Done = these all work end-to-end on real devices

- [ ] Salesperson taps "Take payment" → QR appears with `salespatch.co.uk/preview/<lead_id>`.
- [ ] Customer scans on their own iPhone → demo loads in <1.5s with sticky bottom bar.
- [ ] Customer taps bar → Stripe Checkout (test card 4242 4242 4242 4242 / any future date / any CVC).
- [ ] Pay → redirect to `/onboarding/<lead_id>` step 1.
- [ ] Fill 5 questions → final celebratory screen.
- [ ] Salesperson's iOS shows "✓ Paid · £50" within ≤5s of webhook fire.
- [ ] `lead_assignments` row has `status='sold'`, `sold_at`, `customer_email`, `commission_amount=50`.
- [ ] `lead_onboarding_responses` row has all 5 answers.
- [ ] Stripe webhook event in `stripe_events` table with `processed_at` set.
- [ ] Re-firing the same Stripe webhook event does NOT duplicate the commission.

When all 10 tick, you're live. Switch `STRIPE_MODE=live`, do one £1 real-card test, then announce.
