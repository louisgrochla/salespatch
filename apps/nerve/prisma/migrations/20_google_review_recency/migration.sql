-- Adds Google-review-recency aggregates to lead_profiles.
--
-- Companion to migration 19 (IG post recency). The existing
-- google_review_count column is a lifetime number: it can't distinguish
-- "4.8 from 24 lifetime, 8 in the last 30 days" (trending, sellable)
-- from "4.8 from 24 lifetime, 0 in the last 9 months" (dormant Google
-- presence, even though the bakery itself is alive on Instagram).
--
-- Blackbird Bakery is the motivating example: its Google profile shows
-- 4.8★ from 24 reviews — sounds healthy — but the latest review is
-- 2025-08-29, eight months stale. The qualifier needs the freshness
-- signal explicitly.
--
-- Apify compass/Google-Maps-Reviews-Scraper returns publishedAtDate on
-- every review at $0.00045 each. For a typical lead with <50 lifetime
-- reviews, the full scrape costs ~£0.02; the /spec-site-brief Phase 1
-- producer computes three aggregates from those items and posts them
-- in the lead-profile.json payload:
--
--   google_last_review_at      — most recent review timestamp (lifetime)
--   google_reviews_last_30d    — count in trailing 30 days
--   google_reviews_last_90d    — count in trailing 90 days
--
-- All three nullable. Legacy rows get NULL on apply; producer fills on
-- next /spec-site-brief run for each lead (no backfill — SL-MAS pattern
-- is replay-to-refresh).
--
-- Same honest-null contract as IG (migration 19): if the scrape window
-- is shorter than the trailing-N-day window (because maxReviews capped),
-- write null rather than an undercount. For Google specifically this
-- rarely fires — almost no UK independent gets > 200 reviews/90d — but
-- the contract stays consistent.

ALTER TABLE "lead_profiles"
  ADD COLUMN "google_last_review_at"   TIMESTAMPTZ,
  ADD COLUMN "google_reviews_last_30d" INTEGER,
  ADD COLUMN "google_reviews_last_90d" INTEGER;

-- Composite index supports the qualifier's "live Google presence ranked
-- by recent activity" query — the same shape as the IG-recency index.
CREATE INDEX "lead_profiles_google_review_recency_idx"
  ON "lead_profiles" ("google_last_review_at" DESC, "google_reviews_last_30d" DESC);
