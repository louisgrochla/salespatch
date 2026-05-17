-- Creates `notes` — free-form markdown context the operator and the
-- agents both read. Differs from DECISIONS.md (committed, team-facing)
-- and CHANGELOG/ (per-change): notes are mutable scratch + lead-specific
-- context. /api/read/notes joins on (scope, related_slug) so /build-demo
-- can pull just the relevant notes for one lead.

CREATE TYPE "NoteScope" AS ENUM ('lead', 'system', 'pitch', 'research', 'other');

CREATE TABLE "Note" (
  "id"          TEXT PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "scope"       "NoteScope" NOT NULL,
  "relatedSlug" TEXT,
  "tags"        TEXT[] NOT NULL DEFAULT '{}',
  "phaseLabel"  TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);

CREATE INDEX "Note_scope_idx"        ON "Note" ("scope");
CREATE INDEX "Note_relatedSlug_idx"  ON "Note" ("relatedSlug");
CREATE INDEX "Note_phaseLabel_idx"   ON "Note" ("phaseLabel");
CREATE INDEX "Note_createdAt_idx"    ON "Note" ("createdAt" DESC);
