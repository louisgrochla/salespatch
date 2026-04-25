# /onboarding/[leadId] — 5-step post-payment form with auto-save

**What changed**
- `supabase/migrations/2026-04-25_004_lead_onboarding_responses.sql` — new table keyed on `lead_assignment_id` (PK + FK CASCADE). Columns: `contact_phone`, `top_changes`, `photos jsonb`, `has_existing_domain`, `existing_domain`, `domain_preferences jsonb`, `anything_else`, `completed_at`, plus `created_at`/`updated_at`. RLS + service-role policy.
- `apps/sales-dashboard/src/app/api/onboarding/[leadId]/route.ts` — POST upserts any subset of answer fields plus `append_photo` and `mark_completed`. GET hydrates the form on refresh. Whitelisted fields, trim/validate. No auth.
- `apps/sales-dashboard/src/app/api/onboarding/[leadId]/upload-url/route.ts` — POST creates a Supabase signed upload URL for `customer-uploads/{leadId}/{ts}_{safeFilename}`. Returns `upload_url`, `file_path`, `public_url`.
- `apps/sales-dashboard/src/app/onboarding/[leadId]/page.tsx` — client-side 5-step form: contact → changes → photos → domain → else → done. Each field auto-saves with 500ms debounce; save indicator visible in header. Hydrate-on-mount means refresh / return-later works. Direct file upload to Supabase via signed URL.

**Why**
Step 7 of the customer payment flow handover. Auto-save means a customer who bails mid-form leaves us what they typed. No "Submit at end" button by design. Question count locked at 5; copy and order locked 2026-04-25.

**Stack**
Next.js 14 (client component for form + API routes for upserts), Supabase Postgres + Storage, native `<input type="file">` for photos.

**Integrations**
- Supabase Storage bucket `customer-uploads` — must exist before photos can upload. **Set up once via Supabase Dashboard:** create bucket, set public read access (or implement signed download URLs everywhere photos are read). Bucket name hardcoded in `upload-url/route.ts`.
- Stripe → onboarding redirect via `success_url` from create-checkout (already wired).

**How to verify**
1. Run migration `2026-04-25_004_lead_onboarding_responses.sql`.
2. Create the `customer-uploads` bucket in Supabase Dashboard (Storage → New bucket → public).
3. Visit `https://salespatch.co.uk/onboarding/<assignment-id>` (no auth) on a phone.
4. Step 1: type a number → save indicator flashes "Saving…" then "✓ Saved". Refresh → number is still there.
5. Step 2: type freeform → same auto-save behaviour.
6. Step 3: upload an image → it appears in the list with ✓; check Supabase Storage `customer-uploads/<leadId>/`.
7. Step 4: toggle "Yes" → input for existing domain. Toggle "No" → 3 preference inputs.
8. Step 5: optional textarea.
9. "Finish" → done state, `completed_at` set in DB.
10. Bail mid-form (close tab) and return → form re-hydrates with all answers intact.

**Known issues**
- Live browser verification skipped — requires production env (Supabase + bucket). Smoke-tested in step 11 (end-to-end).
- `customer-uploads` bucket assumed public-readable. If kept private, add signed-download logic anywhere photos are displayed (admin UI, ops view).
- No size limit / type filtering enforced server-side. Browser-side `accept="image/*"` is a hint, not enforcement. Should add a content-type whitelist + size cap before launch — fine for closed beta with friends.
- "Mark completed" runs on Finish click but the form remains accessible afterwards. By design — customer can come back and add more.
- SMS reminder at +24h ("finish setting up") not implemented yet — add when Twilio/SMS pipeline lands.
