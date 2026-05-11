# F1 — Business identity unification

## What changed
- `apps/nerve/prisma/schema.prisma` — added `BusinessIdentity` model
  (`business_identities` table) with unique index on
  `(normalised_name, postcode)`, separate `slug` unique index.
- `apps/nerve/prisma/migrations/16_business_identities/migration.sql` —
  migration for the new table.
- `apps/nerve/src/lib/sl-mas/businessIdentityStore.ts` — new store with
  `normaliseName`, `normalisePostcode`, `slugify`, `lookupOrCreate`,
  `lookup` (read-only), `findBySlug`, `findById`, `findByAnyId`,
  `listAll`. Includes the dedup fallback ladder
  (exact → name-only match → backfill postcode → create).
- `apps/nerve/src/app/api/read/business-identity/lookup/route.ts` —
  HMAC-signed GET endpoint for skill consultation (returns
  `{ found: true, identity }` or `{ found: false }`).
- `apps/nerve/src/app/api/ingest/lead-profile/route.ts` — every
  successful lead-profile upsert now calls
  `businessIdentityStore.lookupOrCreate` so future producers
  auto-populate the canonical row (caught in a try/catch — fire-and-
  forget for the canonical row, lead-profile write is still the
  source of truth).
- `apps/nerve/src/app/(app)/leads/page.tsx` — manual `LeadRecord` rows
  whose normalised name matches an SL-MAS profile are hidden from the
  manual table (with a count line showing how many were collapsed).
- `apps/nerve/src/app/(app)/leads/[id]/page.tsx` — accepts canonical
  `BusinessIdentity.id` (cuid) or `.slug` (kebab-case) as the route
  param in addition to the existing `LeadRecord.id` cuid and
  SL-MAS `lead_id` slug. Resolves canonical → slug then runs the
  existing SL-MAS fan-out.
- `apps/nerve/scripts/backfill-business-identities.ts` — idempotent
  backfill script that walks `lead_profiles`, `site_briefs`,
  `demo_artefacts`, `lead_records` and reconciles each into one
  canonical row via `lookupOrCreate`. Supports `--dry-run`.
- `~/.claude/commands/lead-hunter.md` (user-level skill, not committed
  with this PR) — exclusion scan extended to consult the new lookup
  endpoint via `~/.claude/scripts/nerve/get-ingest.sh`.
- `~/.claude/commands/new-lead.md` (user-level skill, not committed
  with this PR) — pre-scaffold check via the same endpoint; refuses
  to re-scaffold an existing canonical identity without confirmation.
- `NERVE-ROADMAP.md` — F1 claimed for the session.

## Why
F1 of Phase F (unified business lifecycle). Today four id-spaces
exist for the same physical business:
- local folder slug (`~/Desktop/salespatch-demos/<slug>/`)
- `LeadRecord.id` (cuid, manual entries)
- `lead_profiles.lead_id` (slug, skill-emitted)
- Supabase `lead_assignments.lead_id`

None of these reliably dedup the same business — "Noose & Needle"
vs "noose-and-needle" land in different folders, no shared row
exists to anchor the timeline against. F1 introduces
`BusinessIdentity` as the soft FK target keyed on
`(normalised_name, postcode)`; existing tables keep their columns
unchanged. Unblocks F2 (admin queue dedup) and F3 (engagement notes
hanging off the canonical row).

## Stack
- Next.js 14 app-router route handler (HMAC)
- Prisma 5.22 / Postgres unique composite index with nullable
  postcode (NULL-as-distinct handled in the helper's fallback ladder)
- TypeScript normaliseName/slugify primitives (NFD diacritic strip,
  ampersand→and, drop the/and, apostrophe collapse)

## Integrations
- No external services touched.
- The HMAC read endpoint uses the existing `OUTCOME_INGEST_SECRET` +
  `verifySignature` pattern shared by `/api/read/strategies` and
  `/api/read/lead-profiles/winning-features`.
- `~/.claude/scripts/nerve/get-ingest.sh` already handles the
  canonical-query-string signing — no script changes needed.

## How to verify
1. **Prisma client compiles:** `cd apps/nerve && npx prisma generate` → OK
2. **Typecheck:** `cd apps/nerve && npm run typecheck` → no errors
3. **Normalisation primitives (no DB needed):**
   ```bash
   cd apps/nerve && npx tsx -e "
   import { normaliseName, slugify, normalisePostcode } from './src/lib/sl-mas/businessIdentityStore';
   const cases = [
     ['Noose & Needle', 'Noose-and-Needle', 'noose-needle'],
     ['The Bandit Bakery', 'Bandit Bakery'],
     ['Mario\\'s Deli & Café', 'Marios Deli and Cafe'],
   ];
   for (const variants of cases) {
     const n = variants.map(normaliseName);
     console.log(new Set(n).size === 1 ? 'OK' : 'FAIL', n);
   }
   "
   ```
4. **End-to-end (requires DB):**
   - `cd apps/nerve && npm run db:deploy` (applies the migration)
   - `npx tsx scripts/backfill-business-identities.ts --dry-run` shows
     candidate counts + cross-producer overlaps
   - `npx tsx scripts/backfill-business-identities.ts` applies the
     backfill
   - `curl https://nerve.salespatch.co.uk/leads/<slug>` resolves both
     `lead_profiles.lead_id` and `BusinessIdentity.slug`
   - `~/.claude/scripts/nerve/get-ingest.sh /api/read/business-identity/lookup "name=Bandit%20Bakery"` returns the canonical row
   - Re-run `/lead-hunter` and confirm any previously-pitched business
     appears in the EXCLUDED section against its canonical slug.

## Known issues
- The `lead-hunter` and `new-lead` skill markdowns live in
  `~/.claude/commands/` (user-level, not in this repo). The
  changes there are listed above for traceability but the
  workflow change is "the founder updates their own user-level
  skills"; CI cannot test them.
- The backfill is idempotent but synchronous. If
  `lead_profiles` grows past ~10k rows the script will be slow —
  not a concern today (handful of rows in prod).
- The `/leads/[id]` dedup uses `findByAnyId` (slug-or-cuid lookup
  on BusinessIdentity) as a third dispatch path. It does NOT collapse
  the SL-MAS section in the index when two different `lead_id`
  slugs resolve to the same canonical identity — same-business
  drift inside `lead_profiles` is rare today but would need a
  follow-up if `lookupOrCreate` ever rewrites preferred_slug.
