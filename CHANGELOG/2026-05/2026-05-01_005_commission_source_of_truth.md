# 2026-05-01 — commission_amount_pence is the single source of truth

## What changed

**Server (already correct, just verified):**
- `/api/payments/webhook` already reads `sales_users.commission_amount_pence` at `checkout.session.completed` and snapshots it into `lead_assignments.commission_amount_pence` + `commission_amount`. This is the only place commission accrues. ✓
- `/admin/users/[id]` PATCH already writes to `sales_users.commission_amount_pence` (validated 0–£1000). ✓

**Server — plumb the value out to clients:**
- `lib/types.ts` — `SalesUser` gains `commission_amount_pence: number | null`.
- `lib/auth-db.ts` — `SalesUserRow` and `normaliseRow()` now carry the column.
- `lib/auth.ts` — both `loginUser()` and `createSalesUser()` populate it (legacy SQLite paths only — Supabase is the prod source).
- `api/auth/me/route.ts`, `api/auth/login/route.ts`, `api/auth/demo/route.ts` — all three responses now include `commission_amount_pence` so iOS + web can render it without a separate fetch.

**Web display:**
- `app/profile/page.tsx` — Commission row now shows `£{N} per close` derived from the per-user value, not the hardcoded `… · £50 per close`.

**iOS display:**
- `Models.swift` — `User` Codable gains `commissionAmountPence: Int?` plus `commissionPounds` / `commissionDisplay` helpers.
- `PayoutsView.swift` — header "Per sale" stat, "Commission terms" row, confirmed-sales rows, pipeline rows, hero `totalEarned` + `potentialEarned` all read `authStore.currentUser?.commissionAmountPence`. No more `* 50` constant.
- `ProfileView.swift` — "Per sale" stat in performance ribbon now derived. HelpView step 06 onboarding copy rephrased to point at the Payouts tab instead of stating "£50".
- `LeadDetailView.swift` — Pricing card "Your commission" row reads from `authStore.currentUser`.

**Default:** `15000` pence (£150) — falls back to this if `commission_amount_pence` is null on legacy/older session payloads.

## Why
Admin can edit per-salesperson commission from `/admin/users/[id]`, but the value was only being read by the Stripe webhook. Every contractor-facing display (web profile, iOS PayoutsView, ProfileView, LeadDetailView pitch pricing) was hardcoding `£50` — wrong for the new £150 beta default, and immediately stale whenever admin changed a contractor's rate.

## Stack
- Next.js 14 / TypeScript — dashboard API + web profile
- Supabase (Postgres) — `sales_users.commission_amount_pence` column (added in migration `2026-04-25_003`, default 15000)
- SwiftUI — iOS PayoutsView, ProfileView, LeadDetailView
- Codable — `User` model on iOS

## Integrations
- Stripe — unchanged. Webhook still reads `commission_amount_pence` from `sales_users` at `checkout.session.completed`.

## How to verify
1. As admin, open `/admin/users/<id>` → "Commission per confirmed sale" → set to e.g. £200 → Update commission. (Requires the `stripe_connect_id` migration from `2026-05-01_004` to be run so the page loads.)
2. Web: visit `/profile` as that contractor → "Commission" row reads `£200 per close`.
3. iOS: kill + relaunch (or hit `/api/auth/me` again on next foreground) → Payouts tab "Per sale" stat reads `£200`, "Commission terms" reads `£200 flat per confirmed sale`, confirmed-sales rows show `£200`, hero totals recalculate. Profile tab "Per sale" reads `£200`. Open any lead → Pitch tab → "Your commission" reads `£200`.

## Known issues
- iOS reflects the user's **current** rate everywhere — including historical confirmed sales. The accurate per-sale snapshot lives in `lead_assignments.commission_amount_pence` (stamped at sale time), but the iOS `Lead` SwiftData model doesn't carry a commission field. Acceptable for now since beta contractors won't see rate changes mid-cohort. If we ever need historical accuracy in the iOS UI, plumb the snapshot through `LeadAssignment` → `Lead`.
- Marketing copy in `apps/sales-dashboard/src/app/signup/page.tsx` and `apps/ios/SalesFlow/SalesFlow/SignUpView.swift` still says `£50 per sale`. Pre-account screens have no per-user data, and changing the public-facing number is a separate marketing decision — left untouched intentionally.
- iOS users mid-session won't see the new value until their next `/api/auth/me` call (foreground refresh or sign-out / sign-in).
