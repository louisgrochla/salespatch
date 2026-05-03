# NERVE — apps/nerve

Founder-only intranet for SL-MAS. Lives at `nerve.salespatch.co.uk`.
Dual purpose: operational intelligence + dissertation evidence base.

## Stack
- Next.js 14 (App Router), TypeScript, Tailwind
- Vercel Postgres (Neon) with pgvector extension
- Prisma ORM with raw SQL for vector ops
- NextAuth credentials (single founder)
- OpenAI `text-embedding-3-small` for embeddings
- Anthropic `claude-sonnet-4-20250514` for `/ask` (web interface only — MCP server is the no-cost alternative for queries from inside Claude Code)

## Setup
```bash
cd apps/nerve
npm install
cp .env.example .env.local
# fill in DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY,
# NEXTAUTH_SECRET, FOUNDER_EMAIL/PASSWORD, SUPABASE_WEBHOOK_SECRET
npx prisma generate
npx prisma migrate deploy
psql "$DATABASE_URL" -f prisma/sql/embeddings_index.sql
npm run dev   # http://localhost:4400
```

The `prisma/sql/embeddings_index.sql` step adds the ivfflat vector index
that Prisma can't express. Run it once after the first migration.

## Webhook test (local)
Set `NERVE_WEBHOOK_ALLOW_UNSIGNED=true` in `.env.local` for dev:
```bash
curl -X POST http://localhost:4400/api/ingest/pitch \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "pitches",
    "record": {
      "id": "test-1",
      "business_name": "Test Co",
      "sector": "hospitality",
      "outcome": "closed",
      "objections": ["price", "timing"],
      "created_at": "2026-05-02T12:00:00Z"
    }
  }'
```
In production the secret is required — Supabase signs with HMAC-SHA256 of
the raw body, sent as `x-supabase-signature`.

## Architecture notes

### Why a single Embedding table
The spec called for one embeddings table per source table. We use a single
polymorphic `Embedding` (sourceType + sourceId + JSONB metadata) because:
- RAG retrieval needs to span all content types in one vector query.
- 25+ `UNION ALL` per search would cripple the planner at scale.
- Metadata filtering on JSONB preserves the spec's intent of per-source
  precision (`metadata->>'section'`, `metadata->>'contentType'`, etc).

### Phase labels
Every record has a denormalised `phaseLabel`. The label is derived from
`PhaseBoundary` rows via `phaseLabelFor(date)` at write time, not read.
Editing phase boundaries does NOT retroactively rewrite history — that's
intentional, because dissertation phase assignment is a publication-grade
fact and should be auditable.

If `PhaseBoundary` is empty the fallback is "Phase 1".

### Real-time embedding contract
Every save to an embeddable table must call `embedRecord` (structured
fields) or `embedText` (free-form). There is no batch job. There is no
queue. Latency budget is 500ms–2s per save, well within Vercel's 60s
function limit. If embedding fails, the source row should still be saved
and the failure logged — wrap embed calls in try/catch at the route level
and surface failures via the `/system` page.

### Version history pattern
For prompts, dissertation sections, working title, and research question:
the parent table holds the current value; a sibling `*Version` table is
append-only. Mutations write the new value to parent AND insert a row
into history in the same transaction.

## Sidebar count loading
`(app)/layout.tsx` runs 10 parallel `count()` queries on every navigation.
That's fine for the founder-only audience but if cold-start latency becomes
an issue, cache via `unstable_cache` with a 60s revalidate.

## What lives where
- `src/lib/db.ts`              — Prisma client singleton
- `src/lib/auth.ts`            — NextAuth config (single-founder)
- `src/lib/phase.ts`           — phase label derivation, in-process cached
- `src/lib/chunk.ts`           — semantic chunker
- `src/lib/embeddings.ts`      — OpenAI embed + pgvector insert/search
- `src/lib/cn.ts`              — class merger
- `src/components/Sidebar.tsx` — primary nav
- `src/components/DataTable.tsx` — generic sortable table
- `src/app/api/ingest/pitch`   — Supabase webhook
- `prisma/schema.prisma`       — full schema (single Embedding table)
- `prisma/sql/embeddings_index.sql` — manual ivfflat index

## Roadmap (per Stage 1 changelog)
Stages 2–6 add: per-section CRUD pages, analytics views, CSV/JSON export,
RAG `/search`, web `/ask`, MCP server. See
`CHANGELOG/2026-05/2026-05-02_001_nerve_stage1_foundation.md`.
