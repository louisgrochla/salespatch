# 2026-05-17 — NERVE: notes ingest endpoint + `/nerve-note` skill

## What changed
- **New endpoint** `apps/nerve/src/app/api/ingest/notes/route.ts` —
  POST handler that accepts `{title, scope, body, relatedSlug?, tags?}`,
  authenticates via the existing `x-nerve-secret` header
  (`NERVE_CHANGELOG_SECRET` env var — already present in
  `apps/nerve/.env.local`), upserts on `(relatedSlug, title)`, embeds on
  save, logs via `webhookIngestion` like the changelog endpoint.
- **New slash command** `.claude/commands/nerve-note.md` — mirrors
  `nerve-log` / `nerve-quick` shape so any agent can post a note with
  the same auth-discovery boilerplate.

## Why
The notes feature shipped in #106 had a read-write asymmetry: agents
could GET `/api/read/notes` but had no way to POST. The only create
path was the UI, which requires a browser session. Today's seed of the
the-tartan-pig follow-up hit that gap exactly — local Prisma can't
connect (DATABASE_URL empty in .env.local by design) and the seed
script approach needed prod creds I shouldn't have ambient access to.

Mirroring `/api/ingest/changelog` lets the slash command pattern that
already powers `/nerve-log`, `/nerve-quick`, `/nerve-decision` extend
cleanly to notes — same secret, same flavour of POST, same upsert
re-runnability.

## Stack
- Next.js 14 App Router (existing)
- Prisma 5.22 (existing)
- Zod (existing convention)
- Constant-time secret comparison via `crypto.timingSafeEqual`
  (matches existing `verifySecret` in the changelog handler)

## Integrations
- Reuses `NERVE_CHANGELOG_SECRET` — no new env vars
- Reuses `embedRecord` + `phaseLabelFor` + `webhookIngestion`
  conventions exactly

## How to verify
1. Typecheck: `cd apps/nerve && npx tsc --noEmit` → exit 0
2. After deploy, post a test note:
   ```bash
   curl -sS -X POST https://nerve.salespatch.co.uk/api/ingest/notes \
     -H "Content-Type: application/json" \
     -H "x-nerve-secret: $NERVE_CHANGELOG_SECRET" \
     -d '{
       "title": "ingest-endpoint smoke test",
       "scope": "system",
       "body": "Confirms POST /api/ingest/notes is wired and the secret matches.",
       "tags": ["smoke-test"]
     }'
   # → {"ok":true,"id":"...","action":"inserted"}
   ```
3. Re-run the same curl → response should be
   `{"ok":true,"id":"<same id>","action":"updated"}` (upsert semantics).
4. Slash command: `/nerve-note` in any Claude Code session — should
   pick up the secret from `.env.local` automatically.

## Known issues
- Upsert dedup is `(relatedSlug, title)`. Two notes with identical
  titles but different bodies will collide. This is fine for the
  current scratch-pad use case; if it becomes painful, add a
  `client_dedup_key` field on a future migration.
- No DELETE endpoint — deletion stays in the UI by design.
