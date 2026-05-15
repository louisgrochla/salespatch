-- Adds Instagram post-recency aggregates to lead_profiles.
--
-- The existing `instagram_post_count` column is a lifetime number: it can't
-- distinguish "5,776 followers with 6 posts last week" (alive, sellable)
-- from "5,776 followers, last post January 2024" (dormant, dead lead).
-- The qualifier needs freshness signal.
--
-- Apify's instagram-scraper already returns `timestamp` on every post —
-- we just weren't aggregating. The /spec-site-brief Phase 1.5 producer
-- now computes three aggregates from the scraped dataset items and posts
-- them in the lead-profile.json payload:
--
--   ig_last_post_at          — most recent post timestamp
--   ig_posts_last_90d        — count of posts in the last 90 days
--   ig_posts_per_month_median— posts-per-month median across scraped window
--
-- All three are nullable. Legacy rows (Blackbird, Nevermind, the-cult-of-
-- coffee) get NULL on apply — the producer fills them on next profile.
-- No backfill: re-running /spec-site-brief on an existing lead upserts
-- and populates.
--
-- Type choice: ig_posts_per_month_median uses DOUBLE PRECISION rather
-- than the NUMERIC(6,2) the plan originally drafted. Rationale: posts/
-- month doesn't need exact arithmetic, JS-native numbers are easier on
-- producers, and DOUBLE has plenty of precision for analytics
-- grouping/comparison. Logged in DECISIONS.md.

ALTER TABLE "lead_profiles"
  ADD COLUMN "ig_last_post_at"           TIMESTAMPTZ,
  ADD COLUMN "ig_posts_last_90d"         INTEGER,
  ADD COLUMN "ig_posts_per_month_median" DOUBLE PRECISION;

-- Composite index supports the qualifier's most common future query:
-- "qualified leads where ig is alive AND recent posts > N".
CREATE INDEX "lead_profiles_ig_recency_idx"
  ON "lead_profiles" ("ig_last_post_at" DESC, "ig_posts_last_90d" DESC);
