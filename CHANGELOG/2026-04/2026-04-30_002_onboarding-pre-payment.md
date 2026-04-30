# Onboarding moved before Stripe payment

**What changed**
- `apps/sales-dashboard/src/app/api/payments/customer-checkout-url/route.ts` — new public POST endpoint. Body `{ lead_id }`. Returns `{ checkout_url, already_paid }`. Same internal call as the salesperson `/api/payments/create-checkout` (`getOrCreateActiveSession`) but without the auth gate — anyone with the assignment UUID can fetch the customer-side checkout URL, which mirrors the public model used by `/preview/<id>` and `/onboarding/<id>`.
- `apps/sales-dashboard/src/middleware.ts` — added `/api/payments/customer-checkout-url` to PUBLIC_PATHS.
- `apps/sales-dashboard/src/lib/payments.ts` — Stripe `success_url` switched from `onboardingUrlFor(id)` to a new `paidUrlFor(id)` helper (renamed inline from the old `onboardingUrlFor`). Post-payment now lands on `/paid/<id>` instead of looping back through the form.
- `apps/sales-dashboard/src/app/preview/[leadId]/page.tsx` — dropped the server-side `getOrCreateActiveSession` round-trip (no Stripe call needed to render this page). The "Go live now" floating button now links to `/onboarding/<id>`. `PreparingCheckoutPill` removed (no longer reachable). Unused `CREAM_DIM` constant removed.
- `apps/sales-dashboard/src/app/onboarding/[leadId]/page.tsx` — flipped from post-payment to pre-payment. Header eyebrow changed from `✓ PAID · SETTING UP` to `SETTING UP · 1/5` (live step counter). The terminal `done` step removed; final action button is now `Continue to payment →` which marks the response complete and redirects to Stripe Checkout. On mount the page also calls `customer-checkout-url`; if the assignment is already sold the customer is bounced to `/paid/<id>`. Pre-warmed checkout URL means the redirect is instant. Fixed `’` JSX-text bug in DomainPicker. Removed dead `DoneState` component.
- `apps/sales-dashboard/src/app/paid/[leadId]/page.tsx` — copy updated for the new flow ("we have everything we need from the setup form" instead of "finish the setup form"). Removed the "Finish setup →" link (form is already done by the time you land here). Removed the unused `Link` import. Fixed `’` bugs.

**Why**
The user wants the customer to fill out the onboarding form *before* Stripe — captures contact + photos + domain + custom asks even if the customer ultimately drops off at checkout, and makes payment feel like the final commit step rather than a leap of faith. Auto-save still keeps every field as soon as it's typed, so a half-completed form is never lost.

**Stack**
Next.js 14 App Router. Server components for `/preview` + `/paid`, client component for `/onboarding` form. Public API endpoint via Next route handlers. Stripe Checkout (hosted page redirect). Supabase Postgres for `lead_assignments`, `lead_payment_sessions`, `lead_onboarding_responses`.

**Integrations**
- Stripe Checkout `success_url` → `https://salespatch.co.uk/paid/<id>?session_id=...`. The webhook is unchanged — it still fires on `checkout.session.completed` and flips the assignment to `sold`.
- iOS app — no change required. The share/QR URL still points at `/preview/<id>`. The new flow is invisible to iOS; the celebration polling logic (`isPaid` triggered when assignment status flips to `sold`) is unchanged.
- The salesperson-authenticated `/api/payments/create-checkout` endpoint is untouched. iOS still calls it as a background warm on share, which now also primes the same session that the customer-side `customer-checkout-url` call will pick up by reading the `lead_payment_sessions` cache.

**How to verify**
1. `npm --prefix apps/sales-dashboard run dev` (port 4300).
2. Open `/preview/<assignment-uuid>` on a mobile viewport — the "Go live now" floating button's `href` should be `/onboarding/<id>` (not a Stripe URL).
3. Tap through onboarding — header reads `SETTING UP · X/5`. The final step ("Anything else…") shows `Continue to payment →` instead of `Finish`.
4. Type a phone number → save indicator fires; refresh page → number persists. Auto-save still works pre-payment.
5. Tap `Continue to payment →` → marks completed in DB then redirects to Stripe Checkout. Pay with `4242…` → Stripe redirects to `/paid/<id>` → confirmation page renders with proper curly apostrophes and no "Finish setup" link.
6. Visit `/onboarding/<id>` after the webhook flips status to `sold` → page redirects to `/paid/<id>` (no form rendered).
7. Visit `/preview/<id>` after sold → renders the existing `PaidState` ("✓ Paid — building your site").

**Known issues**
- The new public endpoint is rate-limit-free; if abused, anyone with a UUID could spam `getOrCreateActiveSession` (Stripe API). Same exposure as `/preview` had server-side; not net-new. Consider adding a basic IP rate limit before scale.
- The form's `mark_completed` is fired-and-forgotten right before the Stripe redirect. If it fails the customer still proceeds to payment — analytics will undercount completed-form-but-paid edges. Acceptable for beta.
- "Already paid" detection on `/onboarding` mount uses a public endpoint that exposes the boolean. No PII leak (just the assignment status), but worth noting if the threat model changes.
- Webhook `checkout.session.completed` does NOT trigger anything onboarding-related anymore (since the form is already done). The handler stays the same — flips assignment to `sold` and accrues commission.
