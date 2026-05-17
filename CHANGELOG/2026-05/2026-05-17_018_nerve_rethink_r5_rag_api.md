# NERVE rethink — R5 external RAG API

**Date:** 2026-05-17
**Scope:** Fifth of six rounds in the NERVE rethink (see `apps/nerve/RETHINK-AUDIT.md`).
**Branch:** `feat/nerve-rethink-r5-rag-api`
**Base branch:** `main`

## What changed

### Routes

- **New** `apps/nerve/src/app/api/search/route.ts` — `POST` ranked-chunk endpoint. Wraps the existing `semanticSearch` with HMAC auth + Zod validation. Accepts `query` (required) + optional `topK` (max 50) + optional `filter` (sourceType, sourceId, phaseLabel, createdAfter, createdBefore — same shape as R3's `SearchFilter`). Returns chunks with `id`, `source_type`, `source_id`, `chunk_text`, `chunk_index`, `metadata`, `phase_label`, `distance`.
- **New** `apps/nerve/src/app/api/ask/route.ts` — `POST` RAG → Claude answer. Wraps `semanticSearch` + `buildContextBlock` + `askClaude`. Accepts `query` + optional `topK` (max 30) + optional `leadSlug` (applies the R3 source-id scope) + optional `priorTurns` (max 20). Returns `answer`, `sources` (with title + 280-char excerpt + distance + phase), `scope.{lead_slug, chunk_count}`, `model`, `input_tokens`, `output_tokens`. One-shot — no server-side session is created.

Both routes mirror the existing `/api/read/*` HMAC pattern: `OUTCOME_INGEST_SECRET` signs the raw request body, sent as `x-read-signature` (with optional `sha256=` prefix). Dev bypass via `OUTCOME_INGEST_ALLOW_UNSIGNED=true` is permitted only when `NODE_ENV !== "production"`.

### Documentation

- **New** `knowledge/contracts/rag-api.md` — full contract doc. Covers auth, signing helper, request/response shapes for both endpoints, status codes, operational notes (cost: ~$0.005–0.02 per `/api/ask`, ~$0.0001 per `/api/search`; latency: 2–4s for ask, 300–700ms for search), scope semantics, deferred work (streaming / tool use / sessions).
- **Modified** `knowledge/contracts/api-surface.md` — appended a NERVE section enumerating read + RAG + ingest + public endpoints, with a link to `rag-api.md`. Closes a documentation gap: NERVE wasn't listed in the cross-app contract before.

## Why

The audit (section 4d, `apps/nerve/RETHINK-AUDIT.md`) called out that the RAG vault was invisible to every consumer except the founder's browser. The Embedding table, `semanticSearch`, and `askClaude` already existed; what was missing was the wire format.

R5 makes the same retrieval substrate consumable by iOS, the Pi runtime, sales-dashboard, and any future agent that wants to ground its decisions in NERVE history — without each consumer reinventing auth and shape conventions.

This closes the fourth and final business-data RAG sub-goal the audit named (alongside R2 lead 360°, R3 scoped chat, R4 business facts).

## Stack

- Next.js 14 App Router route handlers (existing)
- Zod for body validation (existing)
- pgvector + OpenAI embeddings + Anthropic Sonnet (existing — no provider additions)
- No new dependencies.

## Integrations

None new. Reuses:

- `verifySignature` from `src/lib/sl-mas/hmac.ts` — the same HMAC helper every `/api/read/*` endpoint uses.
- `semanticSearch` from `src/lib/embeddings.ts` — same retrieval primitive the web `/search` and `/ask` use.
- `askClaude` + `buildContextBlock` from `src/lib/anthropic.ts` — same Claude call the web `/ask` uses.
- `getLeadSourceIds` from `src/lib/sl-mas/leadEmbeddings.ts` — same source-id allow-list R3's scoped chat uses.

## How to verify

Programmatic:

```bash
cd apps/nerve && npx tsc --noEmit   # passes, exit 0
```

End-to-end test on the Vercel preview (requires `OUTCOME_INGEST_SECRET` accessible to the caller; in prod that means the env var on Vercel):

```bash
SECRET="$OUTCOME_INGEST_SECRET"
BODY='{"query":"what is the verdict on the tartan pig site brief?","topK":5}'
SIG="sha256=$(node -e "console.log(require('crypto').createHmac('sha256', process.env.SECRET).update(process.env.BODY).digest('hex'))" | tr -d '\n')"
SECRET="$SECRET" BODY="$BODY" curl -s -X POST https://<preview>.vercel.app/api/search \
  -H "x-read-signature: $SIG" \
  -H "Content-Type: application/json" \
  -d "$BODY" | jq .
```

Expect `{"hits":[…], "queried_at":"…"}`. Repeat with `/api/ask` and a body like:

```json
{"query":"what did we promise the customer on domains?","leadSlug":"the-tartan-pig","topK":8}
```

Expect `{"answer":"…","sources":[…],"scope":{"lead_slug":"the-tartan-pig","chunk_count":…},"model":"claude-sonnet-4-20250514","input_tokens":…,"output_tokens":…,"queried_at":"…"}`.

Negative test — strip the `x-read-signature` header. Expect `401 {"error":"invalid signature"}`.

## Known issues

- Local dev server can't run without `DATABASE_URL`, so the only way to exercise the endpoints is the Vercel preview.
- No streaming. A `/api/ask` call takes 2–4s. SSE could land later if consumer latency matters.
- No server-side session persistence on `/api/ask`. Callers manage their own conversation state. The web `/ask` still uses `ChatSession` rows because it needs the browser to render history; the API doesn't.
- No rate limiting yet. The HMAC secret is the only gate. If we start seeing consumer-side abuse, add a per-second budget at the route level. Today the only consumers are first-party and trusted.
- No tool use / function-calling support on `/api/ask`. Plain text only. Adding tools is straightforward but would change the response shape; deferred until a concrete need surfaces.
- Cost is non-trivial per call (~$0.005–0.02 for ask). Documented in the contract doc so consumers can budget.
