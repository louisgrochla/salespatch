# /paid/[leadId] — fallback thank-you page

**What changed**
- `apps/sales-dashboard/src/app/paid/[leadId]/page.tsx` — new public page. Big "✓ You're paid." reassurance, primary CTA linking to `/onboarding/[leadId]`, leadId reference shown small. Inline CSS for fast paint.

**Why**
Step 10 of the customer payment flow handover. Soft landing for cases where:
- the onboarding page errors and the customer gets bounced here
- the salesperson manually shares this URL with a paid customer
The route is in the public middleware allow-list (added in step 6).

**Stack**
Next.js 14 App Router (server component), inline CSS, next/link.

**Integrations**
None — pure presentational page that links back to `/onboarding/<leadId>`.

**How to verify**
1. Visit `https://salespatch.co.uk/paid/<any-id>` on a phone.
2. Renders centred ✓ + "You're paid." headline + "Finish setup →" button.
3. Tapping the button navigates to `/onboarding/<id>`.
4. Reference id is shown in monospace at the bottom.

**Known issues**
- Page shows "You're paid" without verifying the lead is actually sold. By design — this is a fallback / shared-link landing, not the canonical post-payment page (Stripe redirects straight to /onboarding). If misuse becomes a concern, gate behind a `?session_id=` query and verify with Stripe.
