# Admin commission editor

**What changed**
- `apps/sales-dashboard/src/app/api/admin/salespeople/[id]/route.ts` — GET now selects `commission_amount_pence`. PATCH accepts `commission_amount_pence` (validated 0..100000 pence = £0..£1000).
- `apps/sales-dashboard/src/app/admin/users/[id]/page.tsx` — added editable Commission card on the right column. Removed the previous read-only Commission row that showed a hardcoded "£50 per close". Input is in pounds (decimal), submitted as pence; shows the current value and a transient "✓ Saved" confirmation.

**Why**
Step 5.5 of the customer payment flow handover. Per the user's correction: commission_rate is per-contractor and editable. The webhook reads `sales_users.commission_amount_pence` to compute payout — without admin UI, the field is invisible and unsettable. Must land before payments ship so the admin can dial commission per contractor.

**Stack**
Next.js 14 (App Router), Supabase Postgres, brand primitives (`Card`, `Eyebrow`, `PrimaryButton`).

**Integrations**
None new — uses existing admin-auth cookie + supabase service role.

**How to verify**
1. Run migration `2026-04-25_003_payment_columns.sql` (commission_amount_pence column).
2. Sign in as admin, visit `/admin/users/<contractor-id>`.
3. Right column shows a Commission card with current value (£150 default if null).
4. Change to e.g. 200 → click "Update commission" → "✓ Saved" appears, value persists on reload.
5. Submit invalid (e.g. 9999.99 or negative) → 400 error returned by the API.
6. Check Supabase → `sales_users.commission_amount_pence` reflects the new value in pence (20000).

**Known issues**
- Live browser verification skipped — admin page requires an admin session + real Supabase data the preview env doesn't have. Typecheck clean; integration is mechanical (DB read → input → DB write).
- The bench list page (`/admin/users`) still shows commission_rate columns; could be updated to show the flat amount, but out of scope for this change.
