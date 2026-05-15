# lead_profiles — Google review recency aggregates

## What changed

- `apps/nerve/prisma/schema.prisma` — `LeadProfile` model gains three
  nullable fields:
  - `googleLastReviewAt` (`DateTime?`, `google_last_review_at`)
  - `googleReviewsLast30d` (`Int?`, `google_reviews_last_30d`)
  - `googleReviewsLast90d` (`Int?`, `google_reviews_last_90d`)
  Plus a composite index `lead_profiles_google_review_recency_idx` on
  `(google_last_review_at DESC, google_reviews_last_30d DESC)`.
- `apps/nerve/prisma/migrations/20_google_review_recency/migration.sql` —
  `ALTER TABLE lead_profiles ADD COLUMN` for all three + the composite
  index.
- `apps/nerve/src/lib/sl-mas/leadProfileStore.ts` — three fields added to
  `LeadProfileInput`, `LeadProfileRow`, `inputToData` (with `new Date(...)`
  conversion), and `rowToProfile` (with `.toISOString()` round-trip).
- `apps/nerve/src/app/api/ingest/lead-profile/route.ts` — three new
  validators: ISO timestamp on `google_last_review_at`, non-negative
  integer on `google_reviews_last_30d` and `google_reviews_last_90d`.
- `~/.claude/skills/spec-site-brief/SKILL.md` (user-level) — Phase 1
  Verify gains a "Google review recency aggregates" bullet that calls
  `compass/Google-Maps-Reviews-Scraper` (200 reviews max, sort=newest,
  personalData=false) and computes three aggregates from `publishedAtDate`
  on each review. Phase 4's `lead-profile.json` schema example now lists
  the three fields at top level.

## Why

`google_review_count` is a lifetime number. Blackbird Bakery is the
motivating case: 4.8★ from 24 reviews looks healthy, but the latest
review is dated 2025-08-29 — 8.5 months old. **`google_reviews_last_30d
= 0` and `google_reviews_last_90d = 0`**. The bakery is alive on
Instagram (5,776 followers, posting daily) but its Google presence is
dormant. The qualifier had no way to express that distinction.

Three concrete questions the qualifier needs answers to:
1. **Active Google profile?** `google_last_review_at` within 90 days =
   alive. Beyond that, the bakery is invisible to Googlers in real time.
2. **Building social proof now?** `google_reviews_last_30d` paired with
   `google_review_count` shows whether reviews are still landing or
   the customer never thinks to leave one any more.
3. **The "trending fast" relax-to-30 rule.** `/lead-hunter` already
   accepts 4.5★ with 30 reviews for under-12-month businesses if they're
   trending fast. With this field, "trending" is now expressible:
   `google_reviews_last_90d > 10` is trending.

## Stack
Next.js 14 + Prisma 5 + PostgreSQL on the NERVE side. Producer-side
Python aggregation inside `/spec-site-brief` Phase 1, fed by Apify MCP
`compass/Google-Maps-Reviews-Scraper`.

## Integrations
- NERVE `/api/ingest/lead-profile` extended (HMAC unchanged).
- Apify `compass/Google-Maps-Reviews-Scraper` ($0.00045/review,
  99.9% success, 38,907 total users — most trafficked Google reviews
  scraper on Apify).
- Cost per lead with <50 lifetime reviews ≈ £0.02. Hard-capped at 200
  reviews via `maxReviews`, so even a 500-review place tops out at
  ≈ £0.07.

## How to verify

1. `cd apps/nerve && npx prisma generate && npx tsc --noEmit` — clean
   (verified locally).
2. `cd apps/nerve && npx prisma migrate deploy` — applies migration
   `20_google_review_recency`.
3. Run `/spec-site-brief` on a fresh lead with a known Google Maps
   listing. Verify:
   - `.cache/gmaps-reviews.json` exists with the actor's items array
   - `.cache/google-review-recency.json` exists with three values
   - `outputs/lead-profile.json` carries them at the top level
   - NERVE returns HTTP 200, all three fields stored
4. On a place with a dormant Google profile (e.g. Blackbird Bakery),
   confirm `google_reviews_last_30d = 0` and `google_reviews_last_90d = 0`
   while `google_last_review_at` is the genuine old date.
5. On a place with > 200 lifetime reviews, confirm
   `google_reviews_last_30d` / `_last_90d` land as `null` (the cap was
   hit, so the trailing window may not be fully observed).
6. Query the warehouse:
   ```sql
   SELECT lead_id,
          google_rating,
          google_review_count,
          google_last_review_at,
          google_reviews_last_30d,
          google_reviews_last_90d
   FROM lead_profiles
   WHERE google_last_review_at IS NOT NULL
   ORDER BY google_last_review_at DESC LIMIT 10;
   ```

## Known issues

- Existing rows (Blackbird, Nevermind, The Cult of Coffee, etc.) get
  NULL on apply. Forward-only — producer fills them on next
  `/spec-site-brief` run for each lead.
- The honest-null contract fires in two cases: (a) the scrape window
  is shorter than the trailing window (Apify returned all reviews and
  none are older than 30/90 days — rare); (b) the `maxReviews: 200`
  cap was hit, so the trailing window's count may be a lower bound.
  Better honest null than misleading undercount.
- The actor's `personalData: false` setting strips reviewer name/ID/
  URL — we don't need them for these aggregates. If a future feature
  wants the freshest review *text* for the pitch, flip `personalData`
  back on for that call only.
- `googleLastReviewAt` is the *lifetime* latest, but the producer
  observes only the first 200 newest reviews. Since we sort newest
  first, the latest-of-200 IS the lifetime latest unless the place
  has > 200 reviews submitted in the future after this scrape — which
  can't happen retroactively. Safe.
