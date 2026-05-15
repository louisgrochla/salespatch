# lead_profiles — Instagram post-recency aggregates

## What changed

- `apps/nerve/prisma/schema.prisma` — `LeadProfile` model gains three
  nullable fields:
  - `igLastPostAt` (`DateTime?`, `ig_last_post_at`)
  - `igPostsLast90d` (`Int?`, `ig_posts_last_90d`)
  - `igPostsPerMonthMedian` (`Float?`, `ig_posts_per_month_median`)
  Plus a composite index `lead_profiles_ig_recency_idx` on
  `(ig_last_post_at DESC, ig_posts_last_90d DESC)`.
- `apps/nerve/prisma/migrations/19_ig_post_recency/migration.sql` —
  `ALTER TABLE lead_profiles ADD COLUMN ig_last_post_at TIMESTAMPTZ`
  + the two count/median columns + the composite index.
- `apps/nerve/src/lib/sl-mas/leadProfileStore.ts` — three fields added
  to `LeadProfileInput`, `LeadProfileRow`, `inputToData` (with
  `new Date(...)` conversion for the ISO string), and `rowToProfile`
  (with `.toISOString()` round-trip).
- `apps/nerve/src/app/api/ingest/lead-profile/route.ts` — three new
  validators in `validatePayload`: ISO timestamp on `ig_last_post_at`,
  non-negative integer on `ig_posts_last_90d`, non-negative number on
  `ig_posts_per_month_median`.
- `~/.claude/skills/spec-site-brief/SKILL.md` (user-level) —
  Phase 1.5 IG block:
  - `resultsLimit` bumped from 25 to 50 (≈ £0.10/lead, up from £0.05)
    so active accounts get reliable 90-day post coverage
  - New step 4 computing the three aggregates from the same dataset
    items via a one-shot Python snippet, stashed at
    `.cache/ig-recency.json`
  Phase 4 schema example adds the three fields to `lead-profile.json`.

## Why

The existing `instagram_post_count` is a lifetime number — it can't
distinguish "5,776 followers, 6 posts last week" (alive, sellable) from
"5,776 followers, last post January 2024" (dormant, dead lead). Apify's
instagram-scraper already returns `timestamp` on every post; we just
weren't aggregating it.

Three concrete questions the qualifier needs answers to:
1. **Alive?** `ig_last_post_at` within trailing 30 days = active.
2. **Trending?** `ig_posts_last_90d` paired with `instagram_post_count`
   tells us if the cadence is rising or flat.
3. **Cadence?** `ig_posts_per_month_median` is the steady-state signal
   the AI layer can compare across accounts to find "this is a 4
   post/week bakery" vs "this is a 1 post/month bakery."

Concrete motivating example: Blackbird Bakery's chain test (PR #80) gave
us `instagram_post_count: 8723` — which sounds like a lot, but the
qualifier had no way to know that 6 of those posts landed in the last
24 hours. With the new fields, the same lead would also carry
`ig_last_post_at: 2026-05-15`, `ig_posts_last_90d: ~70`,
`ig_posts_per_month_median: ~24`. Strong-signal, current-cadence,
sellable account — and the qualifier can now express that.

## Stack
Next.js 14 + Prisma 5 + PostgreSQL on the NERVE side. Producer-side
Python aggregation inside the `/spec-site-brief` skill, fed by Apify
MCP `apify/instagram-scraper` dataset items.

## Integrations
- NERVE `/api/ingest/lead-profile` extended (HMAC unchanged).
- Apify `apify/instagram-scraper` actor (already authenticated, cost
  delta £0.05 → £0.10 per lead).

## How to verify

1. `cd apps/nerve && npx prisma generate && npx tsc --noEmit` — clean
   (verified locally).
2. `cd apps/nerve && npx prisma migrate deploy` — should apply
   `19_ig_post_recency` against the configured database.
3. Run `/spec-site-brief` on a fresh lead with a populated Instagram.
   Verify:
   - `.cache/ig-recency.json` exists with three numeric values
   - `outputs/lead-profile.json` carries them at the top level
   - NERVE ingest returns HTTP 200 with the new fields stored
4. Query the warehouse:
   ```sql
   SELECT lead_id, instagram_post_count, ig_last_post_at, ig_posts_last_90d, ig_posts_per_month_median
   FROM lead_profiles
   WHERE ig_last_post_at IS NOT NULL
   ORDER BY ig_last_post_at DESC
   LIMIT 5;
   ```
5. On a dormant account (last post > 90 days ago), confirm
   `ig_posts_last_90d = 0` and `ig_last_post_at` is the genuine old
   date. Don't fabricate freshness.

## Known issues

- Existing rows (Blackbird, Nevermind, The Cult of Coffee, etc.) get
  NULL on apply. The producer fills them on next `/spec-site-brief`
  run for each lead. No backfill — the SL-MAS pattern is "replay the
  skill to refresh".
- `ig_posts_last_90d` is intentionally `null` when the scraped window
  is shorter than 90 days (e.g. resultsLimit=50 only covering 30 days
  because the account posts 50+ times/month). Better honest null than
  an under-counted lower-bound that downstream queries can't
  distinguish from a real low value.
- `ig_posts_per_month_median` uses the scraped window's months as the
  bucket set. For a 50-post / 4-month scrape, that's 4 buckets, median
  is the middle two averaged. Coarse for short windows; smoothes out
  the noise of "this week had 14 posts but last month had 3".
