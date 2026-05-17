# NERVE rethink — R3 ask-the-business chat

**Date:** 2026-05-17
**Scope:** Third of six rounds in the NERVE rethink (see `apps/nerve/RETHINK-AUDIT.md`).
**Branch:** `feat/nerve-rethink-r3-ask-business`
**Base branch:** `main`

## What changed

### Schema

- **New migration** `apps/nerve/prisma/migrations/24_chat_session_scope/migration.sql` — adds nullable `scopeLeadSlug` column to `ChatSession` and indexes it. Existing rows are unaffected (null = vault-wide chat, the previous behaviour).
- **Modified** `apps/nerve/prisma/schema.prisma` — corresponding `scopeLeadSlug String?` field on `ChatSession` with documentation comment.

### Library

- **Modified** `apps/nerve/src/lib/embeddings.ts`:
  - Added `sourceId?: string | string[]` to `SearchFilter`.
  - `semanticSearch` short-circuits to `[]` when `filter.sourceId` is an empty array — avoids both the unnecessary OpenAI embedding call and Postgres's `IN ()` syntax error.
  - Adds the `sourceId = ANY(...)` clause to the generated SQL when populated.
- **New** `apps/nerve/src/lib/sl-mas/leadEmbeddings.ts` — `getLeadSourceIds(leadIdOrSlug)` helper. Returns every `Embedding.sourceId` known to belong to a lead (today: `LeadRecord.id` if it exists + every `Note.id` whose `relatedSlug` matches). Single source of truth so the lead-page RAG-coverage panel and the scoped-chat retrieval agree byte-for-byte.

### Actions

- **Modified** `apps/nerve/src/app/(app)/ask/actions.ts`:
  - New `newLeadChat(leadSlug)` server action — creates a `ChatSession` with `scopeLeadSlug` set, revalidates `/ask` and `/leads/[slug]`, redirects into the chat.
  - `sendMessage` now looks up `session.scopeLeadSlug` before retrieval. When scoped, it calls `getLeadSourceIds` and passes the result as `semanticSearch`'s `sourceId` filter. Empty-list scope falls through to a scoped-specific "no chunks tied to this lead yet" context block instead of silently falling back to vault-wide.

### UI

- **New** `apps/nerve/src/app/(app)/leads/[id]/_components/LeadChatPanel.tsx` — lists scoped chats for this lead (most recent 5) and surfaces a "+ start chat" / "+ new chat" button. Surfaces an ANTHROPIC-disabled hint and a no-embeddings-yet hint where relevant.
- **Modified** `apps/nerve/src/app/(app)/leads/[id]/page.tsx`:
  - Imports `getLeadSourceIds` and uses it in place of the local R2-era source-id collection — `/leads/[id]` and `/ask` are now provably in sync.
  - Fetches up to 5 scoped chat sessions for the lead and renders the new `LeadChatPanel` between the stat tiles and `NotesPanel`.
- **Modified** `apps/nerve/src/app/(app)/ask/page.tsx` — every session in the list shows a "scoped · slug" badge when `scopeLeadSlug` is set.
- **Modified** `apps/nerve/src/app/(app)/ask/[sessionId]/page.tsx` — the chat header shows the same badge plus a deep-link back to the lead.

## Why

The audit (section 4c, `apps/nerve/RETHINK-AUDIT.md`) called for a per-lead chat scope so the operator can ask `"what did we promise them?"` or `"when did we last contact?"` and get answers grounded only in chunks tied to that one business — not bleed-through from every other lead in the vault.

The retrieval substrate already existed (pgvector + `semanticSearch`). What was missing was a way to **steer** retrieval. R3 adds two things:

1. A way to persist scope across turns — `ChatSession.scopeLeadSlug`.
2. A filter primitive on `semanticSearch` — `sourceId` allow-list — and a helper that materialises that list per-lead.

The `LeadChatPanel` is the operator surface that ties them together: the lead page is now the single place to start, see, and continue a per-business conversation.

## Stack

- Prisma ORM (existing) + Neon Postgres (existing) + pgvector (existing)
- Next.js 14 App Router + server actions (existing)
- OpenAI `text-embedding-3-small` + Anthropic `claude-sonnet-4-20250514` (existing — no new providers)

## Integrations

None new. Reuses the existing `/ask` machinery (`askClaude`, `buildContextBlock`, `semanticSearch`).

## How to verify

Programmatic:

```bash
cd apps/nerve && npx prisma generate && npx tsc --noEmit   # passes, exit 0
```

Migration applies automatically on Vercel via the `build` script (`prisma generate && prisma migrate deploy && next build`). No manual `prisma migrate` step required on prod.

On the Vercel preview:

1. Open the preview URL and sign in as founder.
2. Navigate to a lead with embeddings — e.g. `/leads/jp-nail` or `/leads/the-tartan-pig`. Confirm `LeadChatPanel` renders between the stat tiles and `NotesPanel`, showing "No scoped chats yet."
3. Click "+ start chat". Should redirect to `/ask/[sessionId]` with a "scoped · jp-nail" badge in the header and an "open lead →" link.
4. Ask a question that should hit this lead's data (e.g. "what's the verdict from the site brief?"). Confirm the Sources panel only cites chunks whose `sourceId` belongs to this lead — no chunks from other leads.
5. Return to `/leads/jp-nail`. Confirm the scoped chat now appears in `LeadChatPanel`.
6. Navigate to `/ask`. Confirm the scoped session has a "scoped · jp-nail" badge in the list.
7. Edge case — open a lead with no embeddings yet (e.g. a manually-added `LeadRecord` with no notes/profile yet) and start a chat. Ask a question. The assistant should answer with a "(no chunks tied to this lead yet …)" context block but still return a reasonable answer from general knowledge.

## Known issues

- Local dev server can't run without `DATABASE_URL`. All UI verification waits for Vercel preview.
- The scoped chat doesn't currently surface inline messages on `/leads/[id]`; the user clicks through to `/ask/[sessionId]` for the full conversation. Could be added if the lead page needs an inline preview later.
- No external API endpoint for `/ask` yet — that's R5. R3's `sendMessage` is still a server action only.
- Only `LeadRecord` and `Note` embeddings are counted today. If sl-mas stores (site brief / brand / demo / pitch brief / qa / composer) start writing embeddings, the `getLeadSourceIds` helper will need to be extended to include their natural keys. Audit doc carries this as a forward-looking note.
