-- R4 (business facts): structured key/value facts about a business that
-- don't fit the rigid LeadProfile / SiteBrief / Note schemas. Examples:
-- owner_name = "Mark", best_contact_time = "Tue mornings",
-- had_fire_2023 = "true · rebuild reopening Q1 2024".
--
-- Append-only by default — multiple facts with the same key are allowed
-- so history (eg owner_name changing) is preserved. Producers de-dupe
-- exact (leadSlug, key, value, source) re-asserts via the ingest
-- endpoint's upsert path; the table itself does not enforce uniqueness.

CREATE TABLE "BusinessFact" (
  "id"          TEXT PRIMARY KEY,
  "leadSlug"    TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "value"       TEXT NOT NULL,
  "source"      TEXT NOT NULL,
  "confidence"  DOUBLE PRECISION,
  "createdBy"   TEXT,
  "phaseLabel"  TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);

CREATE INDEX "BusinessFact_leadSlug_idx"     ON "BusinessFact" ("leadSlug");
CREATE INDEX "BusinessFact_leadSlug_key_idx" ON "BusinessFact" ("leadSlug", "key");
CREATE INDEX "BusinessFact_key_idx"          ON "BusinessFact" ("key");
