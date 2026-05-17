-- R3 (lead-scoped chat): allow a ChatSession to be pinned to one business.
-- When scopeLeadSlug is set, ask/actions.ts narrows semanticSearch to the
-- embeddings whose sourceId belongs to that lead (LeadRecord.id +
-- Notes whose relatedSlug = the slug). Null = unscoped, vault-wide query.
-- Nullable so existing rows are unaffected.

ALTER TABLE "ChatSession" ADD COLUMN "scopeLeadSlug" TEXT;

CREATE INDEX "ChatSession_scopeLeadSlug_idx" ON "ChatSession" ("scopeLeadSlug");
