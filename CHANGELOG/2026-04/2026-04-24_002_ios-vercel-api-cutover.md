# iOS API cutover → sales-dashboard Vercel backend

## What changed

**Modified files**
- `apps/ios/SalesFlow/SalesFlow/APIClient.swift` — rewritten to hit `https://salesflow-sigma.vercel.app/api` with `{data: T}` envelope decoding. New `demoLogin()` method against `/api/auth/demo`. Training / leaderboard / photo endpoints now throw `SalesFlowError.unavailable` (no equivalents on the Vercel backend yet).
- `apps/ios/SalesFlow/SalesFlow/Models.swift` — CodingKeys updated to match the web schema:
  - `LeadDTO`: `id ← assignment_id`, `status ← assignment_status`, `contactPerson ← contact_name`
  - `Stats`: `queue ← new_count`, `visited ← visited_count`, `pitched ← pitched_count`, `sold ← sold_count`, `rejected ← rejected_count`, `earned ← total_commission`, plus `visits_today` / `sales_today`
  - Removed legacy `LoginResponse` struct — replaced by `APIClient.LoginPayload`
- `apps/ios/SalesFlow/SalesFlow/AuthStore.swift` — `debugAutoLogin()` → `debugDemoLogin()`. On DEBUG launch with no saved token the app calls `/api/auth/demo` to get a real session; falls back to an offline stub user only if the backend is unreachable. Added `persist(token:user:)` helper to collapse three copies of keychain/userDefaults/APIClient.token write logic.

## Why

User wants the iOS app to consume the same auth system and admin-assigned leads as the web dashboard. The old APIClient pointed at the OpenClaw runtime (`localhost:4350`) which is a separate backend — admin assignments in the web portal would never show on iOS.

## Stack

- Backend: Next.js 14.2 on Vercel (`salesflow-sigma`), Supabase (prod) / SQLite (local) behind `isSupabaseMode()`
- Auth: HMAC-SHA256 token in `Authorization: Bearer` header (`resolveUserFromRequest` accepts both cookie and Bearer)
- iOS: SwiftUI, URLSession, JSONDecoder with keyDecodingStrategy at field level via CodingKeys

## Integrations

- `https://salesflow-sigma.vercel.app/api/auth/login` — POST `{name, pin}` → `{data: {user, token}}`
- `https://salesflow-sigma.vercel.app/api/auth/demo` — POST → idempotent demo session + seeded leads
- `https://salesflow-sigma.vercel.app/api/auth/signup` — POST `{name, pin, phone, area_postcode}`
- `https://salesflow-sigma.vercel.app/api/auth/me` — GET (Bearer) → current user
- `https://salesflow-sigma.vercel.app/api/leads` — GET (Bearer) → `[LeadCard]`
- `https://salesflow-sigma.vercel.app/api/leads/:id` — GET → lead detail
- `https://salesflow-sigma.vercel.app/api/leads/:id/status` — PATCH `{status, location_lat?, location_lng?, notes?, commission_amount?, rejection_reason?}`
- `https://salesflow-sigma.vercel.app/api/stats` — GET → aggregate stats

Override at runtime with `UserDefaults.standard.set("https://localhost:3000/api", forKey: "apiBaseURL")` for local-laptop dev against `vercel dev`.

## How to verify

1. Erase + reinstall the app in the simulator (`xcrun simctl erase <uuid>` then reinstall)
2. Launch — on DEBUG the app POSTs `/api/auth/demo` and lands on ModeSelectView with "/ HI DEMO" eyebrow (user name "Demo Account" from the Vercel DB)
3. Tap "My dashboard" → LeadsView fetches `/api/leads` and `/api/stats` with the Bearer token
4. To verify admin-assigned leads flow through, open `/admin` (password `salesflow2026`) on the web dashboard, assign a lead to "Demo Account", pull-to-refresh LeadsView — the new lead should appear
5. `curl -X POST https://salesflow-sigma.vercel.app/api/auth/demo` to confirm backend is reachable (returns user + token JSON)

## Known issues

- **Demo account leads seed is empty in prod.** `POST /api/auth/demo` returns user + token but `GET /api/leads` returns `{"data": []}`. The demo route's seeding loop either isn't executing against Supabase or the RLS policy is rejecting inserts. Needs server-side debugging — iOS cutover is not blocked.
- **Training + leaderboard endpoints throw `unavailable`.** The Vercel backend has no `/api/training/*` or `/api/leaderboard` routes. AcademyPathView / LeaderboardView will surface the error. Re-implement on server or gate those screens off for now.
- **Visit tracking (`startVisit`/`endVisit`) is now local-only.** The Vercel API has no `/leads/:id/visit` route; iOS keeps the local timer for UX but posts nothing. Status transitions (including `visited`) already flow through `PATCH /leads/:id/status` which is implemented.
- **Stats fields `visitsThisWeek`, `salesThisWeek`, `totalCommission` are unpopulated** — the web `SalesStats` doesn't expose weekly breakdowns. Kept as optional for back-compat with seed data.
- **No on-device deploy.** iOS app runs in Simulator only until App Store / TestFlight pipeline is set up.
