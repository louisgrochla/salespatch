---
tags: [api, rag, nerve, contracts]
related: [./api-surface.md, ./auth-contract.md]
---

# NERVE RAG API

External JSON endpoints in front of the NERVE semantic-search vault and
the Claude-backed answer pipeline. Built so iOS, the Pi runtime, the
sales-dashboard, and future agents can ground their own answers in the
warehouse without round-tripping through the browser at
`nerve.salespatch.co.uk`.

Two endpoints, shipped in R5 (PR #113):

- `POST /api/search` — ranked chunks for a query (no Claude call).
- `POST /api/ask` — full RAG → Claude answer with sources.

Both live on `nerve.salespatch.co.uk` and use the same HMAC pattern as
the rest of `/api/read/*`.

## Authentication

- **Secret:** `OUTCOME_INGEST_SECRET` (same env var as the rest of the
  read surface). Lives in Vercel env on prod, never in the repo.
- **Header:** `x-read-signature`.
- **Signature:** `sha256=<hex>` where the hex is `HMAC-SHA256(raw_body, secret)`.
- **Dev bypass:** when `NODE_ENV !== "production"` and
  `OUTCOME_INGEST_ALLOW_UNSIGNED=true`, signature verification is
  skipped for ergonomic curling. Never set this in production.

### Signing helper (Node, the shape `apps/nerve/src/lib/sl-mas/hmac.ts` already exports)

```ts
import { createHmac } from "node:crypto";
const sig = `sha256=${createHmac("sha256", process.env.OUTCOME_INGEST_SECRET!)
  .update(rawBody)
  .digest("hex")}`;
```

Sign the **exact bytes** sent on the wire. Stringify the JSON yourself
and pass the resulting string both as the body and as the signature input.

---

## `POST /api/search`

Returns ranked chunks. The caller resolves source records themselves.

### Request

```json
{
  "query": "what's the verdict on the tartan pig site brief?",
  "topK": 10,
  "filter": {
    "sourceType": "SiteBrief",
    "sourceId": ["cl5kqz...", "cl5kr0..."],
    "phaseLabel": "Phase 1",
    "createdAfter": "2026-04-01T00:00:00Z",
    "createdBefore": "2026-05-17T00:00:00Z"
  }
}
```

- `query` — required, 1..2000 chars.
- `topK` — optional, default 10, max 50.
- `filter.sourceType` — string or string[]. Constrains to specific source models (`PitchLog`, `SiteBrief`, `Note`, `BusinessFact`, etc.).
- `filter.sourceId` — string or string[]. Allow-list of specific source-record IDs. **Empty array short-circuits to no hits** (instead of running an unfiltered query) — same semantics as the R3 scoped chat.
- `filter.phaseLabel` — string or string[]. Constrains by phase.
- `filter.createdAfter` / `filter.createdBefore` — ISO 8601 timestamps.

### Response

```json
{
  "hits": [
    {
      "id": "<embedding row id>",
      "source_type": "SiteBrief",
      "source_id": "<brief id>",
      "chunk_text": "…",
      "chunk_index": 2,
      "metadata": { "section": "site-briefs" },
      "phase_label": "Phase 1",
      "distance": 0.182
    }
  ],
  "queried_at": "2026-05-17T22:13:04.512Z"
}
```

### Status codes

- `200` — OK.
- `400` — body failed Zod validation.
- `401` — invalid or missing signature.
- `500` — search call itself errored (e.g. OpenAI unreachable).
- `503` — `OUTCOME_INGEST_SECRET` missing on the server.

---

## `POST /api/ask`

One-shot RAG → Claude answer. No chat session is created on the server;
the caller manages its own conversation history if it needs continuity
(pass `priorTurns`).

### Request

```json
{
  "query": "what did we agree with the customer on domains?",
  "topK": 12,
  "leadSlug": "the-tartan-pig",
  "priorTurns": [
    { "role": "user", "content": "remind me who owns this business" },
    { "role": "assistant", "content": "Mark Smith, per BusinessFact owner_name." }
  ]
}
```

- `query` — required, 1..4000 chars.
- `topK` — optional, default 12, max 30.
- `leadSlug` — optional. When set, semantic search is filtered to the
  source-id allow-list returned by `getLeadSourceIds(leadSlug)` — the
  exact same scope used by the per-lead chat panel on `/leads/[id]`.
  An empty allow-list (lead has no embeddings yet) still produces an
  answer, but the context block surfaces `(no chunks tied to this lead
  yet …)` so the caller can detect the situation.
- `priorTurns` — optional, max 20 turns. For multi-turn flows where the
  caller persists its own history.

### Response

```json
{
  "answer": "Per onboarding response, the customer wants `.co.uk`, no existing domain.",
  "sources": [
    {
      "source_type": "OnboardingResponse",
      "source_id": "<id>",
      "title": "the-tartan-pig onboarding",
      "chunk_text": "domain_preferences: co.uk, com",
      "distance": 0.21,
      "phase_label": "Phase 1"
    }
  ],
  "scope": { "lead_slug": "the-tartan-pig", "chunk_count": 8 },
  "model": "claude-sonnet-4-20250514",
  "input_tokens": 4123,
  "output_tokens": 187,
  "queried_at": "2026-05-17T22:13:04.512Z"
}
```

- `sources` — every chunk that hit retrieval, truncated to 280 chars.
  Caller can re-hit `/api/search` if it needs the full chunk text or
  metadata.
- `scope.chunk_count` — how many chunks the answer was grounded in
  (after lead-scope filtering, if applied).
- `input_tokens` / `output_tokens` — for cost attribution. Null if
  Anthropic doesn't return usage.

### Status codes

- `200` — OK.
- `400` — body failed Zod validation.
- `401` — invalid or missing signature.
- `502` — Claude call failed (rate limit, model error, etc.).
- `503` — `OUTCOME_INGEST_SECRET` or `ANTHROPIC_API_KEY` missing on the server.

---

## Operational notes

- **Cost.** Every `/api/ask` call hits OpenAI (1× embed) **and** Anthropic
  (1× Claude turn). Roughly $0.005–$0.02 per call depending on context
  size and answer length. `/api/search` only hits OpenAI (1× embed),
  ~$0.0001 per call. Callers should be aware.
- **Latency.** Allow ~2–4s for `/api/ask` cold path. `/api/search` is
  ~300–700ms.
- **Idempotency.** Neither endpoint persists server-side state, so
  retries are free.
- **Scope semantics.** When `leadSlug` is passed and `getLeadSourceIds`
  returns an empty array, the answer is still generated but flagged in
  the context block. Callers that want to refuse-answer in that case
  should check `scope.chunk_count === 0` and short-circuit.
- **No streaming.** Both endpoints return a single JSON response. SSE
  streaming could land in a follow-up if call-site latency matters more
  than the implementation simplicity.
- **No tool use.** Claude only returns text. No function calls.

## Producer consumers (today)

- `apps/nerve/src/app/(app)/ask/*` — web UI, but uses the server
  actions directly rather than calling `/api/ask` over HTTP. Same
  retrieval substrate.
- (Forward-looking) iOS `apps/ios/SalesFlow/`, Pi runtime
  `src/agents/*`, sales-dashboard `apps/sales-dashboard/`.

If any of those wire up, document the consumer-side handshake in
`apps/<that-app>/CLAUDE.md` so the secret-distribution story stays
honest.
