-- Run AFTER the first `prisma migrate deploy` so the Embedding table exists.
-- Required because Prisma cannot express ivfflat / hnsw indexes natively.
--
-- ivfflat is fine up to ~100k rows. Switch to hnsw when the vault grows
-- past that — it indexes slower but searches faster at scale.
--
-- Lists = sqrt(rows) is the rough rule of thumb; 100 is a sane starting
-- point for the early dataset.

CREATE INDEX IF NOT EXISTS "Embedding_embedding_ivfflat_idx"
  ON "Embedding"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Refresh planner stats so the new index gets used.
ANALYZE "Embedding";
