# Manual admin-triggered Stripe Connect payouts

**What changed**
- `supabase/migrations/2026-05-01_001_payout_columns.sql` — adds `payout_status` (`'pending' | 'paid_out' | 'failed'`, default `'pending'`), `payout_transfer_id`, `payout_paid_out_at`, `payout_failed_at`, `payout_failure_reason` columns to `lead_assignments`. Partial index on `(user_id, status, payout_status)` where `status='sold' AND payout_status='pending'` so the "what's owed" admin query is cheap.
- `apps/sales-dashboard/src/app/api/payments/payout/route.ts` — full rewrite. Was: hardcoded £50, no auth, no idempotency, took `salesperson_id`. Now:
  - Admin-only (`admin_token` cookie via `validateAdminToken`).
  - Body `{ lead_assignment_id }` — pays one specific sale.
  - Reads commission from `lead_assignments.commission_amount_pence` (set by webhook on the sale).
  - Reads `stripe_connect_id` from joined `sales_users`; refuses if missing with a clear error.
  - 409 if assignment is not `sold` or already `paid_out`.
  - Two-layer idempotency: DB row gate (`.neq('payout_status', 'paid_out')`) + Stripe `idempotencyKey: 'payout:<assignment_id>'`. Even if the DB write loses to a network error, Stripe won't double-bill.
  - Failure path writes `payout_status='failed'` + reason so admin sees it and can retry.
- `apps/sales-dashboard/src/app/api/admin/salespeople/[id]/route.ts` — GET response now includes `user.stripe_connect_id` (so the UI can warn if Connect setup is incomplete) and a new top-level `sold_payouts` array — every sold assignment with its commission, payout state, transfer id, and failure reason.
- `apps/sales-dashboard/src/app/admin/users/[id]/page.tsx` — new "Money / Payouts" Section between Recent leads and Activity timeline. Shows total owed in the eyebrow ("Owed: £450 across 3 sales"), and a table per sale: business name + sold-relative-time, commission amount, state pill (● Pending / ✓ Paid / ⚠ Failed), and a Pay £X button (or Retry £X for failed). Confirm dialog before sending. Inline result message under the row. If the salesperson has no `stripe_connect_id`, the button is disabled and an amber notice appears at the top of the section.

**Why**
The existing `/api/payments/payout` was a stub from earlier in development — wrong amount (hardcoded £50), no auth, no idempotency. With real money about to move during the beta, every one of those gaps had to close before a single payout button could go live. Also no way to do it from the UI.

**Stack**
Next.js 14 route handler. Stripe Connect Express transfers via `stripe.transfers.create`. Supabase Postgres (column adds, partial index). Existing admin cookie auth.

**Integrations**
- Stripe Connect Express — uses transfers from platform balance (already-set up via `/api/payments/connect`). Salesperson onboards once at `/settings/payout-setup`, gets a `stripe_connect_id` written to `sales_users`, and from then on the admin can pay out per-sale.
- Stripe idempotency keys — dedupe per assignment, prevent double-pays on retries.
- `cost_log` table — best-effort row written per successful transfer (existing convention).

**How to verify**
1. Run migration `2026-05-01_001_payout_columns.sql` in Supabase SQL Editor.
2. Set `ADMIN_PASSWORD` env (already on prod; locally only if you want to test against the UI).
3. Deploy. Log in to `/admin`. Open `/admin/users/<contractor-uuid>`.
4. The new "Money" section appears between "Recent leads" and "Activity":
   - With sold leads: a row per sale with state, amount, action.
   - With pending: state pill `● PENDING` and a `Pay · £X` button.
   - Click → confirm dialog → button shows "Sending…" → on success state flips to `✓ Paid` and the row shows the last 8 chars of the Stripe transfer id; the eyebrow recomputes.
   - On failure (e.g., contractor hasn't finished Stripe Connect onboarding) → state flips to `⚠ Failed` with the reason inline. Click "Retry £X" after they fix it.
5. Re-clicking Pay on an already-paid row → 409 from the API; UI doesn't show the button anyway.

**Known issues**
- No salesperson-facing UI yet. The /payouts page in the dashboard already exists for them but isn't wired to this new state — it'd be a nice next pass to show "✓ Paid · 2 days ago" against each of their sold leads.
- Iframe on `/admin/users/[id]` currently has no pagination on payouts; if a salesperson has 50+ sold assignments the section gets long. Add filter (Pending / All) when that becomes a problem.
- No bulk "Pay all pending" action — deliberate for the beta to keep eyes on each transfer.
- The /api/payments/payout endpoint is currently admin-only; an automated path (webhook-triggered immediate payout, or a scheduled job after a clearance buffer) will need a service-internal-token model. Not in scope here.
- Stripe transfers go from platform's *available* balance. For brand-new platforms, customer payments take T+2 to clear. If admin clicks Pay before clearance, Stripe returns "Insufficient funds in your Stripe account." The error surfaces in the UI; admin can retry once funds settle. (Optional fix: top-up float — covered in the conversation; not implementing until production scale demands.)
