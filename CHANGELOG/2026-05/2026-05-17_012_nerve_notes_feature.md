# 2026-05-17 — NERVE: notes feature

## What changed
- **New Prisma model `Note`** + `NoteScope` enum + migration
  `apps/nerve/prisma/migrations/23_notes/migration.sql` (table `Note`,
  4 indexes: scope, relatedSlug, phaseLabel, createdAt DESC).
- **New CRUD section** at `apps/nerve/src/app/(app)/notes/`:
  - `page.tsx` — list with scope/relatedSlug/phase/tag filters,
    scope-count tiles, 500-row cap with truncation notice.
  - `new/page.tsx` — create form with `?scope=&relatedSlug=` URL
    prefill so external links can open a pre-scoped form.
  - `[id]/page.tsx` — detail/edit with the existing `<Markdown>`
    component used by the rest of NERVE.
  - `actions.ts` — server actions (create/update/delete) wired to
    `embedRecord` per the real-time embedding contract.
  - `_components/{NoteForm,NotesFilters,NotesList}.tsx`.
- **New API read endpoint** `apps/nerve/src/app/api/read/notes/route.ts`
  — HMAC-signed GET with `scope`, `relatedSlug`, `tag`, `q`, `limit`
  filters. Mirrors the auth pattern of `/api/read/strategies`,
  `/api/read/lead-bundle`, etc.
- **Sidebar wiring** — new "Notes" entry under the "build" group with
  `NotebookPen` lucide icon; sidebar count in `(app)/layout.tsx`
  (eleventh parallel `Promise.all` count).

## Why
The user observed: agents (and the founder between sessions) need a
canonical place to drop free-form context — per-lead follow-ups,
gotchas, "remember this for next session" content. Three of these
already exist as ad-hoc files:
- `DECISIONS.md` — committed, team-facing, one-line decisions
- `CHANGELOG/` — per-change record, also committed
- `~/Desktop/klaude-vault/journal/` — personal long-form, not committed

What was missing: a **mutable, scoped, agent-readable** store that lives
in the app the founder already opens daily, and feeds back into Claude
Code via the existing `/api/read/*` pattern. The trigger was the
qa-visual verification surfacing the-tartan-pig as a bonus catch and
needing somewhere to land that as a follow-up.

## Stack
- Next.js 14 App Router (existing)
- Prisma 5.22 + PostgreSQL (existing)
- Zod for form input parsing (existing convention)
- `embedRecord` polymorphic Embedding (existing convention)
- lucide-react `NotebookPen` icon (already in dep tree)

## Integrations
- Notes flow into `/search` (semantic) and `/ask` (RAG) via the existing
  Embedding table — no separate index, no separate retrieval path.
- `GET /api/read/notes` is the literal-fetch path for Claude Code
  skills. Auth = `X-Read-Signature` HMAC over canonical query string
  using `OUTCOME_INGEST_SECRET` (same as `/api/read/strategies` etc).

## How to verify
1. **Locally with full env** (DIRECT_URL set):
   ```bash
   cd apps/nerve && npx prisma migrate deploy && npm run dev
   # visit http://localhost:4400/notes
   ```
2. **On deploy (Vercel)** the migration auto-applies; visit
   `nerve.salespatch.co.uk/notes`.
3. **Typecheck:** `cd apps/nerve && npx tsc --noEmit` returns exit 0.
4. **API read** (from any Claude Code session, after deploy):
   ```bash
   # Without HMAC (dev only, requires OUTCOME_INGEST_ALLOW_UNSIGNED=true):
   curl 'http://localhost:4400/api/read/notes?relatedSlug=the-tartan-pig'

   # With HMAC (prod):
   SIG=$(printf 'limit=50&relatedSlug=the-tartan-pig' \
     | openssl dgst -sha256 -hmac "$OUTCOME_INGEST_SECRET" -binary \
     | xxd -p -c 256)
   curl -H "X-Read-Signature: sha256=$SIG" \
     'https://nerve.salespatch.co.uk/api/read/notes?limit=50&relatedSlug=the-tartan-pig'
   ```

## Known issues
- Migration was NOT applied locally as part of this change — DIRECT_URL
  is empty in `.env.local` (production-only credential). The migration
  SQL is committed and will apply on the next Vercel deploy.
- No POST endpoint by design — UI is the canonical create path. If a
  scripted ingest is wanted later, add a sibling
  `/api/ingest/notes/route.ts` mirroring the HMAC pattern of
  `/api/ingest/pitch/`.
- No version history (`NoteVersion` sibling table) — notes are mutable
  scratch by design. If a note needs publication-grade audit, it
  belongs in `DECISIONS.md` or a dissertation section, not here.
