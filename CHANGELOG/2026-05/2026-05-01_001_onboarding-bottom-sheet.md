# Onboarding form moved into a bottom sheet, more interactive controls

**What changed**
- `apps/sales-dashboard/src/app/onboarding/[leadId]/page.tsx` — refactored from a `'use client'` page to a server component shell. Loads the lead_assignment, parses business_name + demo_site_domain (same Supabase Storage URL resolution as `/preview`), redirects to `/paid/<id>` if already sold, then renders `<OnboardingClient>` with the data.
- `apps/sales-dashboard/src/app/onboarding/[leadId]/OnboardingClient.tsx` — new file. Holds all the existing form logic + the new bottom-sheet UI:
  - Demo iframe pinned full-screen behind, `pointer-events: none` so taps fall through.
  - Top "Business · Setting up" pill (matches the `/preview` chip style).
  - Bottom sheet: `min(72dvh, 640px)`, rounded top corners, drag handle, sticky header (progress bar + step counter + save indicator), scrollable content, sticky action row.
  - **Phone (Q1)**: `🇬🇧 UK` prefix chip + `inputMode="numeric"` + on-the-fly UK formatting (`07712 345678`).
  - **Changes (Q2)**: 8-chip picker (`Bigger photos`, `Different colours`, `Add menu`, `Update hours`, `Different fonts`, `Add booking`, `Show prices`, `Mention awards`) + free-text textarea. Selected chips serialise as `— <chip>` lines so the existing `top_changes` text column stores the result and can re-split on hydrate.
  - **Photos (Q3)**: prettier upload tile (camera emoji + format hint) + grid of square thumbnail previews (CSS `aspect-ratio: 1/1`, `object-fit: cover`).
  - **Domain (Q4)**: auto-suggests `<slug>.co.uk`, `<slug>.com`, `the<slug>.co.uk` from the business name as tap-to-add chips, in addition to the existing 3 free inputs.
  - Animated horizontal progress bar in `SIGNAL` (gold) at the top of the sheet.

**Why**
1. Customer can still see the demo while filling out the form — keeps the "this is for *my* site" context, increases perceived value before payment.
2. Fewer text boxes — chip pickers drive the median customer through faster, while still allowing custom answers.

**Stack**
Next.js 14 (server component shell + `'use client'` form). Supabase Storage proxy for the iframe (same `/api/demo-site/<slug>` route as `/preview`). React `useMemo` for derived chip state.

**Integrations**
- `/api/onboarding/[leadId]` — unchanged (POST/GET); the `top_changes` column now stores chip + free-text concatenation.
- `/api/payments/customer-checkout-url` — unchanged; pre-warmed on mount as before.
- `/api/demo-site/[slug]` — same proxy used by `/preview` so the iframe behind the sheet renders as text/html, not raw text.

**How to verify**
1. Open `/preview/<assignment-uuid>` → tap "Go live now". Lands on `/onboarding/<id>`.
2. The Fable demo (or whatever lead) is visible behind the sheet. Top pill shows business name + green "Setting up" dot.
3. Step 1: phone field shows `🇬🇧 UK` prefix; type digits → auto-formats `07712 345678`.
4. Step 2: 8 chips. Tap to toggle (✓ ↔ +). Free-text below for custom asks.
5. Step 3: tap upload tile → choose images → see thumbnail grid populate.
6. Step 4: tap "No, please buy one" → 3 suggested domains derived from business name appear as chips. Tapping a chip adds it to the top-3 list.
7. Step 5: textarea unchanged. Final button reads "Continue to payment →".
8. On the way out, `mark_completed` posts and `window.location` → Stripe.
9. Re-visit `/onboarding/<id>` after webhook flips status to sold → server redirects to `/paid/<id>`.

**Known issues**
- Sheet doesn't have a drag-to-resize gesture yet (handle is decorative). Native iOS Safari pull-down dismisses won't fire either. Accept for first cut.
- Photo upload still relies on `customer-uploads` Supabase bucket being public-read (existing assumption from the original onboarding ship).
- Auto-suggest slug strips apostrophes and special chars; for businesses with names like `Mary Mac’s` we'd suggest `marymacs.co.uk` (apostrophe-stripped). Reasonable default; customer can override in the manual fields.
- `splitChanges` matches stored chips by exact string equality with `COMMON_CHANGES` — if we ever rename a chip, old saved records won't re-tick that chip on hydrate (will show the chip text in the free-text box instead). Acceptable; chip list is locked for beta.
- The iframe inside the sheet's "peek" area shows the *top* of the demo (same scroll position as a fresh load). Long-form demos with their hero off-screen would feel cropped — fine for the demo style we ship today.
