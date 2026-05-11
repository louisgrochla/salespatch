-- F1 of Phase F. Business identity unification — one canonical row per
-- physical business, dedup key (normalised_name, postcode).
--
-- Existing producer tables (lead_profiles, site_briefs, demo_artefacts,
-- LeadRecord, lead_assignment_events) keep their lead_id slug or id cuid
-- unchanged. This table is the soft FK target; producers call the
-- TypeScript helper `businessIdentityStore.lookupOrCreate(name, postcode)`
-- before scaffolding a new lead so slug variations
-- ("noose-and-needle" vs "noose-needle") collapse onto the same row.
--
-- Postgres treats NULL postcodes as distinct in the composite unique
-- index — handled at the application layer by the helper's fallback
-- lookup on normalised_name alone.
--
-- Backfill of existing rows runs via
-- `apps/nerve/scripts/backfill-business-identities.ts` because the
-- normalisation function lives in TypeScript.

CREATE TABLE "business_identities" (
    "id"               TEXT         NOT NULL,
    "slug"             TEXT         NOT NULL,
    "business_name"    TEXT         NOT NULL,
    "normalised_name"  TEXT         NOT NULL,
    "postcode"         TEXT,
    "vertical"         TEXT,
    "first_seen_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata"         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_identities_slug_key"               ON "business_identities" ("slug");
CREATE UNIQUE INDEX "business_identities_normalised_postcode_key" ON "business_identities" ("normalised_name", "postcode");
CREATE INDEX        "business_identities_normalised_idx"          ON "business_identities" ("normalised_name");
CREATE INDEX        "business_identities_postcode_idx"            ON "business_identities" ("postcode");
