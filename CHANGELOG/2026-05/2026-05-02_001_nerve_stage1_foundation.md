# NERVE — Stage 1: Foundation

**Date:** 2026-05-02
**Branch:** `claude/nice-kare-edfa44`
**Worktree:** `nice-kare-edfa44`

## What changed

New app at `apps/nerve/`. First stage of a multi-stage build per spec.

Created:
- `apps/nerve/package.json` — Next 14, Prisma, NextAuth, OpenAI SDK, Tailwind
- `apps/nerve/tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`,
  `postcss.config.mjs`, `.env.example`, `.gitignore`
- `apps/nerve/prisma/schema.prisma` — full schema for all 10 sections
  including `PitchLog`, `OperationsLog`, `RevenueEntry`, `CostEntry`,
  prompt library + version history, demo records, lead records,
  dissertation meta + sections + literature + evidence log + supervisor
  meetings + academic calendar, methodology docs, knowledge base,
  legal/compliance, plus a single polymorphic `Embedding` table with
  `vector(1536)` and webhook ingestion log
- `apps/nerve/prisma/sql/embeddings_index.sql` — ivfflat index
- `apps/nerve/src/lib/db.ts` — Prisma client singleton
- `apps/nerve/src/lib/auth.ts` — NextAuth credentials, single founder,
  24h JWT session, env-based password with constant-time compare
- `apps/nerve/src/lib/phase.ts` — phase label derivation from
  `PhaseBoundary` with 5-min in-process cache
- `apps/nerve/src/lib/chunk.ts` — semantic chunker (paragraph → sentence
  fallback, ~1k char target, merges tiny fragments)
- `apps/nerve/src/lib/embeddings.ts` — `embedRecord` / `embedText` /
  `semanticSearch` against pgvector via raw SQL
- `apps/nerve/src/lib/cn.ts` — class merger
- `apps/nerve/src/types/next-auth.d.ts` — typed session
- `apps/nerve/src/app/layout.tsx` — root layout, Inter + JetBrains Mono
- `apps/nerve/src/app/globals.css` — dark theme, dense table styles,
  phase + status pill components
- `apps/nerve/src/app/page.tsx` — redirect to dashboard
- `apps/nerve/src/app/login/page.tsx` — minimal login form
- `apps/nerve/src/app/(app)/layout.tsx` — protected layout, sidebar +
  parallel count loading
- `apps/nerve/src/app/(app)/dashboard/page.tsx` — operational stats,
  dissertation widget (days to deadline, word count progress, literature
  count, data sufficiency vs methodology threshold of 50 pitches/phase),
  live activity feed (top 20 across sections), quick-entry buttons
- `apps/nerve/src/components/Sidebar.tsx` — grouped nav (overview,
  operations, research, reference) with entry counts
- `apps/nerve/src/components/DataTable.tsx` — generic sortable table
- `apps/nerve/src/components/PhasePill.tsx` — phase + status pills
- `apps/nerve/src/components/StatTile.tsx` — dense stat tile
- `apps/nerve/src/components/SessionProvider.tsx` — NextAuth wrapper
- `apps/nerve/src/app/api/auth/[...nextauth]/route.ts` — auth handlers
- `apps/nerve/src/app/api/ingest/pitch/route.ts` — Supabase pitch webhook:
  HMAC-SHA256 signature verification, idempotent upsert by Supabase id,
  objection tag attachment, immediate inline embedding, every attempt
  logged to `WebhookIngestion`
- `apps/nerve/middleware.ts` — protects everything except `/login`,
  `/api/auth/*`, and `/api/ingest/*`
- `apps/nerve/CLAUDE.md` — per-app architecture notes

## Why

Initial scaffold for the founder intranet specified by user request. This
stage delivers the minimum that's verifiably operational:
- The webhook is live next week per spec; it had to land first.
- Auth gates everything else.
- The dashboard proves the schema and embedding pipeline work end-to-end.

Subsequent stages add per-section CRUD UIs, analytics, export, RAG
search, web `/ask`, and the MCP server.

## Stack

- Next.js 14 App Router + TypeScript
- Prisma 5 + Vercel Postgres (Neon) + pgvector
- NextAuth 4 (credentials)
- OpenAI SDK (`text-embedding-3-small`, 1536 dim)
- Tailwind 3 (dark, custom colour palette, Inter + JetBrains Mono)
- zod (request validation)

## Integrations

- **Supabase webhook → `/api/ingest/pitch`** — fires on `pitches` table
  INSERT, signed with `SUPABASE_WEBHOOK_SECRET`
- **OpenAI Embeddings API** — called inline within the webhook function;
  every save replaces existing embeddings for that source
- **Vercel deployment** — separate project bound to
  `nerve.salespatch.co.uk`

## How to verify

After deploy and DB provisioning:

1. **Auth wall**: `https://nerve.salespatch.co.uk/dashboard` redirects to
   `/login`. Submitting `FOUNDER_EMAIL` + `FOUNDER_PASSWORD` lands on the
   dashboard.
2. **Dashboard**: with an empty DB it should render with zeros and no
   crashes; the activity feed shows "No activity yet."
3. **Webhook (signed)**:
   ```bash
   BODY='{"type":"INSERT","table":"pitches","record":{"id":"sig-test","business_name":"Test","outcome":"closed"}}'
   SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SUPABASE_WEBHOOK_SECRET" -hex | cut -d' ' -f2)
   curl -X POST https://nerve.salespatch.co.uk/api/ingest/pitch \
     -H "Content-Type: application/json" \
     -H "x-supabase-signature: $SIG" \
     -d "$BODY"
   ```
   Returns `{"ok":true,"pitchId":"..."}`. The dashboard stat "total pitches"
   ticks up. The activity feed shows the Test entry. Embedding rows appear
   in `Embedding` for `sourceType = 'PitchLog'`.
4. **Webhook (bad signature)**: same call without the header → `401`.
5. **Embedding round-trip**: `psql "$DATABASE_URL"` then
   `SELECT count(*) FROM "Embedding" WHERE "sourceType" = 'PitchLog';` —
   should be ≥ 1 after a successful webhook.

## Known issues / out of scope this stage

- No CRUD UIs for any section yet — only the dashboard renders. Quick-entry
  buttons link to routes that 404 until Stage 2.
- `/search` and `/ask` are nav placeholders only.
- MCP server not yet built.
- Per-spec deviation: single polymorphic `Embedding` table instead of
  one-per-source. Documented in `apps/nerve/CLAUDE.md`.
- Spec mentions deploying to the Pi via `mc-push-pi.sh`. NERVE deploys to
  Vercel, not the Pi — the Pi deploy steps in the root `CLAUDE.md` apply
  to mission-control and the runtime, not to apps/nerve.
- Sidebar `count()` queries run on every nav (10 parallel). Acceptable
  for a single-user app; revisit with `unstable_cache` if cold starts
  feel sluggish.
