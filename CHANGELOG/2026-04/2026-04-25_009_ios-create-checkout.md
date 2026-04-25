# iOS — APIClient.createCheckout + share-sheet uses preview URL

**What changed**
- `apps/ios/SalesFlow/SalesFlow/APIClient.swift` — added `dashboardBaseURL` (different host than mobile-api: simulator → localhost:4300, device → https://salespatch.co.uk). Added `createCheckout(leadId:) -> CreateCheckoutResponse` POSTing to `/api/payments/create-checkout` with `{ lead_id }`. Added `CreateCheckoutResponse` decodable.
- `apps/ios/SalesFlow/SalesFlow/ClientPresentationView.swift` — added `leadAssignmentId: String` parameter and a `@State previewURL: String?`. Floating share button now lazily calls `APIClient.createCheckout(leadId:)` on first tap, caches the resulting `preview_url`, then opens DemoShareSheet. Replaces the old `"https://\(domain)"` construction (which produced the doubled-`https://` bug when `domain` already had a scheme prefix). Defensive `normalisedDomainURL()` fallback for when createCheckout fails.
- `apps/ios/SalesFlow/SalesFlow/LeadDetailView.swift` — caller now passes `lead.id`.
- `apps/ios/SalesFlow/SalesFlow/ModeSelectView.swift` — caller now passes `lead.id`.
- `apps/ios/SalesFlow/SalesFlow/ClientPresentationView.swift` `#Preview` — passes a stub leadAssignmentId.

**Why**
Step 8 of the customer payment flow handover. The QR/Share path now encodes `salespatch.co.uk/preview/<assignment-id>` (the preview page) instead of the raw Supabase demo URL. Routing the customer through `/preview` is what gives them the sticky payment CTA. Eager-attribution: createCheckout is called the moment the salesperson taps Share, locking salesperson_id into Stripe metadata before the customer scans.

**Stack**
Swift / SwiftUI. Foundation URLSession.

**Integrations**
- Sales-dashboard `/api/payments/create-checkout` (rewritten in step 4).
- Same SD_SECRET HMAC token works on both mobile-api (port 4350) and sales-dashboard (port 4300 / production).

**How to verify**
1. Build app in Xcode against the salespatch.co.uk dashboard (or a local dev server at localhost:4300 with proper env).
2. Open a lead with a `demoSiteDomain` set, hit "Show in client mode" → ClientPresentationView opens.
3. Tap floating share button → wait briefly for createCheckout call → DemoShareSheet appears with a `salespatch.co.uk/preview/<assignment-id>` URL.
4. Generate QR → URL shown is the preview URL, no doubled-`https://` prefix.
5. Save to Photos → scanned QR resolves to the preview page.
6. AirDrop / Email → shares the preview URL.
7. Verify in Supabase: a row exists in `lead_payment_sessions` with `lead_assignment_id = lead.id`, `status='active'`, future expires_at.

**Known issues**
- No Swift compile-check ran in this commit — mechanical change verified by Xcode build on the user's side.
- If createCheckout fails (offline, unauthorised, backend error), the share sheet falls back to the raw domain URL — same as before but with the doubled-https bug fixed. The sticky CTA flow won't work until network/auth is restored, but the share at least doesn't crash.
- Polling for "✓ Paid · £150" celebratory state is in step 9, not yet wired.
- Mobile-api `/payments/checkout-url` route still uses the old shape and is not touched. The iOS app no longer hits it from this flow; left as-is in case anything else depends on it.
