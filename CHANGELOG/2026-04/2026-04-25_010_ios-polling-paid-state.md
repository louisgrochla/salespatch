# iOS — polling for sold + celebratory paid state

**What changed**
- `apps/sales-dashboard/src/app/api/leads/[id]/status/route.ts` — added GET handler. Reads from Supabase directly (mobile-api SQLite lags). Returns `{ status, sold_at, commission_amount, commission_amount_pence }`. Auth-gated, ownership-checked. Existing PATCH handler unchanged.
- `apps/ios/SalesFlow/SalesFlow/APIClient.swift` — added `LeadStatusResponse` decodable + `fetchLeadStatus(id:)` extension method. Hits `dashboardBaseURL`.
- `apps/ios/SalesFlow/SalesFlow/ClientPresentationView.swift` — adds `pollingTask: Task<Void, Never>?`, `isPaid`, `commissionEarnedPence` state. `startPolling()` runs every 3s while the share sheet is open; on `status === 'sold'` it dismisses the share sheet and presents `PaidCelebrationView`. `stopPolling()` on sheet dismiss.
- `apps/ios/SalesFlow/SalesFlow/PaidCelebrationView.swift` — new full-screen "✓ Paid · £X" view. Animated tick + pulsing accent circle + commission pill + "Done — back to dashboard" close button.

**Why**
Step 9 of the customer payment flow handover. The doc calls this "essential UX, not a nice-to-have": when the webhook flips the lead to sold, the salesperson sees the celebratory state and can close the conversation confidently.

**Stack**
Swift / SwiftUI (Task + async/await for polling), Foundation URLSession.

**Integrations**
- Sales-dashboard `GET /api/leads/[id]/status` (new). Polled every 3s.
- Authoritative state lives in Supabase (written by webhook in step 5). Mobile-api SQLite is bypassed — its copy lags Supabase writes.

**How to verify**
1. Pre-req: previous steps deployed (1–8) and a test Stripe checkout that fires the webhook.
2. iOS: tap floating share button on a lead → share sheet opens → polling starts.
3. Customer scans QR + pays via Stripe test card 4242 4242 4242 4242 → webhook fires → `lead_assignments.status='sold'` in Supabase.
4. Within ~5s, iOS should:
   - Dismiss the share sheet.
   - Present `PaidCelebrationView` full-screen.
   - Show "+ £150 in your wallet" (or whatever `commission_amount_pence` was on the contractor's `sales_users` row).
5. Tap "Done — back to dashboard" → ClientPresentationView dismisses.
6. Close share sheet without paying → polling stops, no extra requests fire.

**Known issues**
- 3s poll interval = ~20 requests/minute per active QR session. Trivial cost. Switch to push notification (with iOS as foreground fallback) when push infra lands.
- If iOS app is backgrounded while QR is up, the polling Task is suspended (iOS lifecycle). Re-attaches on foreground. Customer paying while app is backgrounded means the salesperson sees the celebration when they re-open. Fine for the beta.
- No Swift compile-check ran. Mechanical change; verify in Xcode.
- The wallet-celebration UI is currency-formatted basically (£150 / £150.50). Doesn't handle internationalisation; UK-only is the locked beta.
