# Dynamic setup fee + monthly pricing via env vars

**What changed**
- `apps/sales-dashboard/src/lib/payments.ts` — added `getSetupFeePence()`, `getMonthlyPence()`, `formatPenceAsPounds()`. Both getters read env vars (`SETUP_FEE_PENCE`, `MONTHLY_PENCE`) with sane defaults (35000 / 2500) and bounds-check ([100, 1_000_000] / [100, 100_000]). Invalid values log a warning and fall back to defaults.
- `createCheckoutSessionForAssignment` — now resolves prices once per session-create. Stripe line item, product description, and metadata all use the dynamic values. `lead_payment_sessions.amount_setup_pence` / `amount_monthly_pence` snapshot the resolved values so historical pricing is recoverable.
- `apps/sales-dashboard/src/app/preview/[leadId]/page.tsx` — the sticky CTA text is now built from the env-driven values: `Go live now · £X setup, then £Y/mo →`.
- Legacy `SETUP_FEE_PENCE` / `MONTHLY_PENCE` constants kept as default-aliases so the webhook's import compile-checks; new code should use the getters.

**Why**
User wants to A/B test setup pricing during the beta prelaunch. Previously the setup fee was hardcoded at £350; flipping it required a code change + deploy. Now it's a Vercel env var change + redeploy (~30s).

**Stack**
Next.js 14 server-side env reads, no DB schema change.

**Integrations**
None new. Stripe Checkout sees the resolved prices at session-create time.

**Important caveats**
- **`SETUP_FEE_PENCE` is fully dynamic** — change the env var, redeploy, next checkout uses the new price. No Stripe Dashboard work needed.
- **`MONTHLY_PENCE` is DISPLAY-ONLY.** The actual recurring charge is governed by the immutable Stripe Price referenced by `STRIPE_HOSTING_PRICE_ID`. To change the real recurring amount, create a new Price in Stripe Dashboard and swap `STRIPE_HOSTING_PRICE_ID` (then update `MONTHLY_PENCE` to keep the UI in sync).

**How to verify**
1. Set `SETUP_FEE_PENCE=29900` in Vercel → redeploy → tap Take Payment → Stripe Checkout shows £299. Preview page CTA reads "£299 setup, then £25/mo".
2. Unset → defaults to £350.
3. Set bogus value `SETUP_FEE_PENCE=foo` → server logs warning, falls back to £350.

**Known issues**
- The CTA on the preview page is server-rendered with `force-dynamic`; price changes are visible on next request, no cache.
- iOS `PaidCelebrationView` still shows "+ £X in your wallet" using `commission_amount_pence` (per-contractor), unchanged. Setup fee changes don't affect the celebration display.
