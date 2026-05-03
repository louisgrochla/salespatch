import OpenAI from "openai";
import { prisma } from "./db";
import { chunkRecord, semanticChunk, type Chunk } from "./chunk";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;

// When OPENAI_API_KEY is unset (dev mode), embedding silently skips so
// callers don't have to special-case it. Records still save; the rows
// just don't get vectors. Run `npm run db:backfill-embeddings` once the
// key is added to backfill the missing ones.
function isEmbeddingDisabled(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return !key || key === "" || key.startsWith("sk-not-real");
}

let _openai: OpenAI | null = null;
function client(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  _openai = new OpenAI({ apiKey });
  return _openai;
}

export interface EmbedTarget {
  sourceType: string; // model name, e.g. "PitchLog"
  sourceId: string;
  phaseLabel: string;
  metadata?: Record<string, unknown>;
}

// Convert a number[] of floats into the literal pgvector accepts:
//   '[0.1,0.2,...]'
function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await client().embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

// Replace any existing embeddings for a record with the freshly chunked
// and re-embedded set. Idempotent — safe to call on every save.
export async function embedRecord(
  target: EmbedTarget,
  fields: Record<string, string | number | boolean | Date | null | undefined>,
): Promise<{ chunks: number; skipped?: true }> {
  if (isEmbeddingDisabled()) return { chunks: 0, skipped: true };
  const chunks = chunkRecord(fields);
  await replaceEmbeddings(target, chunks);
  return { chunks: chunks.length };
}

// Variant for free-form prose (markdown body, abstract, etc.) where the
// caller already has the full text and doesn't want field-style chunking.
export async function embedText(
  target: EmbedTarget,
  text: string,
): Promise<{ chunks: number; skipped?: true }> {
  if (isEmbeddingDisabled()) return { chunks: 0, skipped: true };
  const chunks = semanticChunk(text);
  await replaceEmbeddings(target, chunks);
  return { chunks: chunks.length };
}

async function replaceEmbeddings(target: EmbedTarget, chunks: Chunk[]) {
  await prisma.embedding.deleteMany({
    where: { sourceType: target.sourceType, sourceId: target.sourceId },
  });
  if (chunks.length === 0) return;

  const vectors = await embedBatch(chunks.map((c) => c.text));

  // Bulk insert via raw SQL — Prisma can't bind the vector type directly.
  // Build a parameterised statement; vectors go through as text and are
  // cast to vector by Postgres.
  const placeholders: string[] = [];
  const values: unknown[] = [];
  let p = 1;
  for (let i = 0; i < chunks.length; i++) {
    const id = cryptoRandomId();
    const vec = vectors[i];
    if (vec.length !== EMBED_DIMS) {
      throw new Error(
        `Embedding dim mismatch: expected ${EMBED_DIMS}, got ${vec.length}`,
      );
    }
    placeholders.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb, $${p++}::vector, $${p++})`,
    );
    values.push(
      id,
      target.sourceType,
      target.sourceId,
      chunks[i].text,
      chunks[i].index,
      JSON.stringify(target.metadata ?? {}),
      toVectorLiteral(vec),
      target.phaseLabel,
    );
  }

  const sql = `
    INSERT INTO "Embedding"
      ("id", "sourceType", "sourceId", "chunkText", "chunkIndex", "metadata", "embedding", "phaseLabel")
    VALUES ${placeholders.join(", ")}
  `;
  await prisma.$executeRawUnsafe(sql, ...values);
}

// Cosine-distance search across the vault. Returns the top-k chunks with
// metadata; caller resolves source records as needed.
export interface SearchHit {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkText: string;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  phaseLabel: string;
  distance: number;
}

export interface SearchFilter {
  sourceType?: string | string[];
  phaseLabel?: string | string[];
  createdAfter?: Date;
  createdBefore?: Date;
}

export async function semanticSearch(
  query: string,
  opts: { topK?: number; filter?: SearchFilter } = {},
): Promise<SearchHit[]> {
  const topK = opts.topK ?? 10;
  const [vec] = await embedBatch([query]);
  const where: string[] = [];
  const params: unknown[] = [toVectorLiteral(vec)];
  let p = 2;

  if (opts.filter?.sourceType) {
    const types = Array.isArray(opts.filter.sourceType)
      ? opts.filter.sourceType
      : [opts.filter.sourceType];
    where.push(`"sourceType" = ANY($${p++}::text[])`);
    params.push(types);
  }
  if (opts.filter?.phaseLabel) {
    const phases = Array.isArray(opts.filter.phaseLabel)
      ? opts.filter.phaseLabel
      : [opts.filter.phaseLabel];
    where.push(`"phaseLabel" = ANY($${p++}::text[])`);
    params.push(phases);
  }
  if (opts.filter?.createdAfter) {
    where.push(`"createdAt" >= $${p++}`);
    params.push(opts.filter.createdAfter);
  }
  if (opts.filter?.createdBefore) {
    where.push(`"createdAt" <= $${p++}`);
    params.push(opts.filter.createdBefore);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limitParam = `$${p++}`;
  params.push(topK);

  const sql = `
    SELECT
      "id",
      "sourceType",
      "sourceId",
      "chunkText",
      "chunkIndex",
      "metadata",
      "phaseLabel",
      ("embedding" <=> $1::vector) AS "distance"
    FROM "Embedding"
    ${whereClause}
    ORDER BY "embedding" <=> $1::vector
    LIMIT ${limitParam}
  `;

  const rows = await prisma.$queryRawUnsafe<SearchHit[]>(sql, ...params);
  return rows;
}

function cryptoRandomId(): string {
  // Match Prisma cuid shape loosely — we don't need ordering, just unique.
  return (
    "c" +
    Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 24)
  );
}
