-- Adds bio_cta_type to lead_profiles.
--
-- The Instagram (and Google Business Profile) bio's call-to-action is the
-- single most predictive signal for diagnosis assignment. Blackbird Bakery's
-- bio says "No DMs (Call us/ pop into the Bakery)" — that ONE phrase tells
-- the qualifier:
--   - phone-led service model, not DM-led
--   - any pitch that proposes replacing the phone will fail
--   - diagnosis leans "discovery failure" not "booking friction"
--
-- We currently extract this in prose. Capturing it as a structured field
-- lets the AI layer learn "for vertical=bakery, leads with bio_cta=call
-- have a higher close rate than leads with bio_cta=dm", and lets future
-- agents short-circuit diagnosis based on the field.
--
-- TEXT not enum: keeps the migration footprint small. Forward-compat is
-- one route-validator update (add a value to the allow-list, ship a PR,
-- no migration needed). Hard-validated at the route — typos and unknown
-- values are rejected with 400 to keep the warehouse clean. This is the
-- "enum-by-convention with hard validation" pattern.
--
-- Known values (kept in sync with the route validator):
--   call          — "Call us", phone-led, "no DMs"
--   dm            — "DM to book", message-driven
--   link_in_bio   — Linktree, beacons, link aggregators
--   fresha        — Fresha booking link primary
--   booksy        — Booksy booking link primary
--   treatwell     — Treatwell booking link primary
--   website       — Working website URL in bio
--   none          — No CTA at all
--
-- Index supports per-vertical analytics ("for vertical=bakery, distribution
-- of bio_cta_type"). Composite with vertical because all the questions of
-- interest are scoped that way.

ALTER TABLE "lead_profiles"
  ADD COLUMN "bio_cta_type" TEXT;

CREATE INDEX "lead_profiles_bio_cta_idx"
  ON "lead_profiles" ("vertical", "bio_cta_type");
