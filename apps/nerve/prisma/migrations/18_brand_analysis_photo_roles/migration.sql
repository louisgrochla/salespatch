-- Adds a queryable photo_roles map to brand_analyses.
--
-- Phase 2 of the spec-site-brief skill assigns each photo a placement role
-- (logo, storefront, interior, product_close, product_assortment, menu,
-- press, lifestyle, unused). Until now that classification only happened
-- at /build-demo time and got recorded in demo_artefacts.metadata after
-- the fact — so the brief's commitment and the build's execution were
-- never separable in the warehouse.
--
-- Lifting photo_roles to a real column lets the AI layer query the brief
-- side directly (eg "for vertical=barber, what fraction of brief.product_close
-- assignments survive to demo.product_close") and learn from drift between
-- brief and build, which lands in demo_artefacts.metadata.photo_classifications
-- as { filename: { role, brief_role, drift } }.
--
-- Safe on existing rows: NOT NULL DEFAULT '{}'::jsonb populates every legacy
-- row without backfill. Existing brand_analyses are pre-photo_roles leads;
-- /build-demo's fallback path treats an empty map as "no brief commitment,
-- classify from scratch".

ALTER TABLE "brand_analyses"
  ADD COLUMN "photo_roles" JSONB NOT NULL DEFAULT '{}'::jsonb;
