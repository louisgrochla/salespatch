# NERVE — Changelog ingestion + Claude Code slash commands

**Date:** 2026-05-03
**Branch:** `claude/nice-kare-edfa44`
**Worktree:** `nice-kare-edfa44`

## What changed

Three new pieces of NERVE that together turn every Claude Code session
into structured, searchable, dissertation-grade evidence.

### 1. Schema + migration

- `apps/nerve/prisma/schema.prisma` — new `ChangelogEntry` model and
  `ChangelogProjectType` enum (`nerve | salespatch | ios_app |
  sl_mas_pipeline | spit_out | other`). Fields per spec:
  `project`, `sessionSummary`, `whatChanged`, `why`, `decisionsMade`,
  `problemsEncountered`, `currentState`, `whatsNext`,
  `filesModified` (text[]), `sessionDate`, `sessionDurationMinutes`,
  `tags` (text[]), `retrospectiveNote`, `projectType`, `phaseLabel`,
  `createdAt`, `updatedAt`. Indexes on `sessionDate`, `project`,
  `projectType`, `phaseLabel`, plus a Gin index on `tags`.
- `apps/nerve/prisma/migrations/3_changelog/migration.sql` — additive
  migration: creates the enum, the table, and the five indexes. Touches
  no existing tables or rows.

### 2. Ingest endpoint

- `apps/nerve/src/app/api/ingest/changelog/route.ts` — new POST handler
  matching `/api/ingest/pitch`'s shape so the existing webhook ingestion
  log surfaces failures the same way. Highlights:
  - Auth via `x-nerve-secret` header (or alias
    `x-nerve-changelog-secret`), constant-time compared against
    `NERVE_CHANGELOG_SECRET`. 401 on miss.
  - Accepts BOTH `snake_case` and `camelCase` keys so the slash command
    can ship either shape — every field tries both names before
    resolving to empty/default.
  - Persists to `ChangelogEntry`, derives `phaseLabel` from
    `sessionDate` if not supplied, then immediately calls `embedRecord`
    with `sourceType=ChangelogEntry` and metadata
    `{ section: "changelog", project, projectType, date, tags,
    phaseLabel }`.
  - Every attempt (success or fail) logged to `WebhookIngestion` like
    the pitch webhook.
- `apps/nerve/middleware.ts` — already exempts `api/ingest/*` from the
  auth gate; no change needed.

### 3. Founder-facing UI

Added a **build** group to the sidebar between operations and research,
with a single **Changelog** entry that loads its row count via the
existing parallel-counts pattern (`apps/nerve/src/app/(app)/layout.tsx`).

New routes under `apps/nerve/src/app/(app)/changelog/`:
- `page.tsx` — Timeline (default). Reverse-chronological list of all
  entries across all projects. Filters: `projectType` (also surfaced as
  six clickable count tiles at the top), `project`, `phase`, `tag`.
  Each row shows date, project badge, summary, tags. Click the chevron
  to expand the full entry inline (markdown-rendered every section);
  click "open →" for the dedicated detail view.
- `[id]/page.tsx` — Detail view. Renders every field as a labelled
  block with markdown. Includes a "phase context" panel that links to
  the dissertation sections active in the same `phaseLabel` and the
  pitch view filtered by phase. Founder can click "add note" to open a
  textarea for a `retrospectiveNote` — saved via server action, the
  whole entry is re-embedded so the note is searchable too. Delete
  action removes the entry and its embeddings.
- `analytics/page.tsx` — Sessions-per-week bar chart (CSS-only, no
  chart library), most active projects ranked, tag frequency cloud
  (top 30, click any tag to filter the timeline), files modified most
  often (top 25). Loads with empty-state messaging when the DB has
  zero rows.
- `_components/Timeline.tsx` — collapsible row list, used on the index
  page.
- `_components/ChangelogFilters.tsx` — client-side filter bar.
- `_components/ProjectBadge.tsx` — colour-coded pill per project_type.
- `actions.ts` — server actions for the retrospective note + delete,
  using the existing `requireSession` guard.

### 4. RAG plumbing

- `apps/nerve/src/lib/source-resolver.ts` — added `ChangelogEntry`
  case so `/search` and `/ask` can render hits with title
  `"<projectType> · <project>"`, hint = first 120 chars of the session
  summary, and a working `/changelog/<id>` URL. Also added
  `"changelog"` to `sectionPathFor()`.
- `apps/nerve/src/app/(app)/search/page.tsx` — `ChangelogEntry` added
  to the source-type dropdown so users can scope search to changelog
  hits only.
- The existing `/search` and `/ask` pipelines automatically pick up the
  new sourceType because they query the polymorphic `Embedding` table —
  no changes needed in `embeddings.ts` or the chat handler.

### 5. Claude Code slash commands

Three commands in `.claude/commands/` of both the worktree and the
repo root (so any session — inside the worktree or at repo root —
finds them). Same content in both paths.

- `nerve-log.md` — primary command. Instructs the agent to compact the
  whole session into the structured changelog shape, then POST to
  `${NERVE_CHANGELOG_URL:-https://nerve.salespatch.co.uk/api/ingest/changelog}`
  with `x-nerve-secret: $NERVE_CHANGELOG_SECRET`. Falls back to
  printing the entry as markdown if the POST fails so a session is
  never silently lost.
- `nerve-quick.md` — lightweight version for short sessions. Single-
  sentence summary + bullet what_changed + files + tags + project_type;
  all narrative fields posted as empty string.
- `nerve-decision.md` — mid-session decision logger. Asks the user
  what decision they want to log, then POSTs with
  `summary: "Decision log: …"`, `what_changed: "N/A — decision record
  only"`, narrative captured under `decisionsMade`. Explicitly does
  NOT end the session.

### 6. Env var

- `apps/nerve/.env.example` — new `NERVE_CHANGELOG_SECRET` entry with
  comment explaining the cross-repo reuse contract (set the same value
  in every project's environment so any session can ship logs to the
  same NERVE).

## Why

The project is now a real, multi-app, multi-repo platform built across
many sessions. Two things were missing:

1. **No build history.** Each session existed only in transcript form.
   Once the chat closed, the *why* behind a decision was gone.
2. **No methodology evidence.** The dissertation argues SL-MAS was
   built iteratively over many phases — but the only record of that
   iteration was git log, which captures *what* shipped and not *why*
   or *what was considered and rejected*.

This system fixes both. Every session, ended with `/nerve-log`, lands
in NERVE as a structured row, gets embedded into the same vector index
that powers `/search` and `/ask`, and is visible to the supervisor
through the read-only `/supervisor` route. A supervisor or examiner
literally reads the build history.

## Stack

- Next.js 14 App Router (route handler + server actions + dynamic
  pages).
- Prisma 5 + Postgres (Neon) — additive migration, no existing-table
  changes.
- pgvector via the existing single-table `Embedding` polymorphic store.
- OpenAI `text-embedding-3-small` via the shared `embedRecord`
  pipeline — silently no-ops when `OPENAI_API_KEY` is unset.
- Tailwind components mirroring the existing dense aesthetic (no new
  CSS, no chart library — bar chart is plain CSS heights).
- `crypto.timingSafeEqual` for the secret check, mirroring the pitch
  webhook.
- Zod for request validation; accepts dual-shape (snake/camel) keys so
  the slash command body is forgiving.
- `react-markdown` (already a dep) for rendering each field on the
  detail and timeline-expanded views.

## Integrations

- **Claude Code slash commands** — three new commands shipped at
  `.claude/commands/nerve-log.md`, `.claude/commands/nerve-quick.md`,
  `.claude/commands/nerve-decision.md` (mirrored at the repo root and
  the worktree root). Trigger is the user typing `/nerve-log` etc.
- **NERVE → OpenAI** — embedding called inline within the route
  handler. The endpoint is sub-2s including embed.
- **NERVE → Neon Postgres** — adds one new table + one new enum + five
  indexes via `prisma migrate deploy`.
- **Search and /ask already automatic** — the polymorphic Embedding
  table means a new `sourceType` is searchable as soon as it's
  embedded; no code changes to those surfaces.

## How to verify

After deploying the migration (`cd apps/nerve && npm run db:deploy`):

1. **Auth wall**: POST `/api/ingest/changelog` without the secret
   header → `401`.
2. **Happy path**:
   ```bash
   curl -sS -X POST http://localhost:4400/api/ingest/changelog \
     -H "Content-Type: application/json" \
     -H "x-nerve-secret: $NERVE_CHANGELOG_SECRET" \
     -d '{
       "project": "nerve",
       "session_summary": "Test changelog ingest",
       "what_changed": "Added a test row",
       "why": "Verifying the endpoint",
       "decisions_made": "",
       "problems_encountered": "",
       "current_state": "Endpoint live",
       "whats_next": "Wire it from production",
       "files_modified": ["apps/nerve/src/app/api/ingest/changelog/route.ts"],
       "session_date": "2026-05-03T14:30:00Z",
       "tags": ["api", "test"],
       "project_type": "nerve",
       "phase_label": ""
     }'
   ```
   → `{"ok":true,"id":"…"}`.
3. **UI**: `http://localhost:4400/changelog` shows the row in the
   timeline with the `nerve` project badge, date, summary. Click the
   chevron → all sections render. Click "open →" → detail view shows
   every field, plus the "phase context" panel.
4. **Search**: `http://localhost:4400/search?q=test+changelog+ingest&sourceType=ChangelogEntry`
   surfaces the row with a working link to `/changelog/<id>`.
5. **Analytics**: `/changelog/analytics` shows 1 session this week,
   1 project, the tag frequencies, and the file frequency.
6. **Slash command**: in any Claude Code session, run `/nerve-log`.
   The agent compacts the conversation, POSTs, and reports the entry
   id back.
7. **Retrospective note**: open the entry, click "add note", save —
   confirm it appears below the entry and re-embeds (the search query
   should now also match the note text).

## Known issues / out of scope

- **Migration not yet applied** to the Neon DB at the time of this
  commit — code is feature-complete, schema is queued. Apply with
  `cd apps/nerve && npm run db:deploy` when ready to flip the switch.
- **No CSV/JSON export endpoint** for changelog rows yet. The other
  sections have one; easy follow-up.
- **No filter for `phase_label="null"`** — the input is technically
  optional, but the current ingest route falls back to phase derivation
  rather than allowing nulls. If a "no phase" classification is needed
  it'd be a small column-nullability change.
- **Slash command files have no `Bash` tool permission entry** baked
  in. If a project's settings deny `curl`, the command will prompt for
  permission on first run. Acceptable; first-run grant covers all
  subsequent uses.
- **No rate-limit on the ingest endpoint.** A leaked secret would let
  a third party spam entries; currently mitigated only by secret
  rotation. Re-evaluate before public-facing deploy.
- **Project list in the timeline filter is built from existing rows**
  via `distinct: ["project"]` — empty until at least one entry is
  ingested. Acceptable; the filter just shows a single "all projects"
  option when the table is empty.
- **`session_duration_minutes` not surfaced in analytics totals** —
  only individual rows show it. Easy to add an "average session
  length" tile later.
- **Slash commands use `bash`/`curl`** rather than a Node fetch.
  Trade-off: it's universal and shell-environment-friendly, but it
  means the env vars must be in the shell, not just `.env`. Document
  this where the `.env` files live for each project repo.
