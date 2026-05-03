# NERVE — Stage 5: RAG search + AI /ask

**Date:** 2026-05-02
**Branch:** `claude/nice-kare-edfa44`

## What changed

### Schema (migration `2_chat_sessions`)
Manually-written migration (no shadow DB this time — lesson learned).
- `ChatSession` — id, title (auto-set from first user message), phaseLabel, timestamps
- `ChatMessage` — sessionId FK (cascade), role (user/assistant), content, sources JSONB
  (array of `{ sourceType, sourceId, title, url, excerpt, distance, sectionPath, phaseLabel }`),
  model, inputTokens, outputTokens

Persisting chat history makes the `/ask` log itself dissertation evidence — "I asked the system X on date Y, here's what it answered."

### `lib/source-resolver.ts`
Generic resolver across all 14 embeddable source types (extends what `lib/evidence.ts` did for the evidence log only). Returns `{ title, hint, url, date, exists }` — used by both `/search` and `/ask` to label retrieved chunks with something a human recognises.

Also exports `sectionPathFor(sourceType)` for grouping (sales / operations / financial / research / product / other).

### `lib/anthropic.ts`
- `isAskAvailable()` — gates the UI off when no key
- `buildSystemPrompt()` — fresh per turn from current vault state. Includes:
  - SL-MAS context paragraph
  - Current phase + all phase boundaries with operational descriptions
  - Working title, research question, degree, word-count target
  - **Academic framing paragraph** (per spec: "surfaced by the AI query interface whenever the dissertation topic or framing is queried")
  - Behaviour rules: cite by source label, use academic register for research framing, today's date
- `buildContextBlock(hits)` — formats retrieved chunks as labelled `[REF n]` blocks with source type, title, date, phase, distance. Hard ceiling at ~28k chars to keep prompt size predictable.
- `askClaude(query, context, priorTurns)` — calls `claude-sonnet-4-20250514` (per spec) via the Messages API; returns text + token usage.

### `/search` — `(app)/search/page.tsx`
- Query input with auto-focus
- Filters: source type (15 options), phase, created after, created before, top-k (1–50)
- Result rows: rank, section path pill, source type, resolved title (linked to source detail page), date, phase pill, cosine distance
- Chunk excerpt rendered as monospace
- No-key state: amber warning explaining what's needed
- No-embeddings state: amber warning prompting the backfill command

### `/ask` — chat sessions list
- "+ new chat" button (disabled when `ANTHROPIC_API_KEY` unset)
- Empty state shows the 6 example queries from the spec verbatim
- Recent conversations list: title, message count, phase pill, relative time
- Two warning panels when keys missing (Anthropic for /ask, OpenAI for retrieval)

### `/ask/[sessionId]` — chat detail
- Full conversation view with user/assistant messages
- Each assistant message renders via the `Markdown` component
- Right sidebar (sticky on lg+) shows the source chunks retrieved for THAT turn — with links back to source rows, distances, excerpts
- Composer: textarea, Cmd+Enter to send, "Claude is responding…" while pending
- Server action `sendMessage(sessionId, formData)`:
  1. Persists user message immediately (so a Claude failure still records the question)
  2. Embeds the query and runs `semanticSearch` (top-k 12)
  3. Builds context block + prior turns (up to 20)
  4. Calls Claude
  5. Persists assistant message with full sources snapshot
  6. Auto-titles the session from the first user message
- Delete chat, back to list actions

## Why

The spec frames RAG and /ask as the central reasoning surface — operational data and academic content reasoned over together. Both surfaces share the same retrieval (`semanticSearch` from Stage 1) and the same source-resolution layer (`source-resolver.ts`). Persisting chat history meets the "conversation history maintained" requirement and converts every interesting prompt into citable evidence.

`buildSystemPrompt` injects the academic framing paragraph the user explicitly flagged in the topic update — so when they ask "how do I describe SL-MAS to my supervisor in writing," Claude already has the right register.

## Stack

- Added `@anthropic-ai/sdk@^0.32.1`
- No other deps — react-markdown, prisma, openai already present

## How to verify

Dev server still on `http://localhost:4400`. Sign in.

1. **/search**: amber "embeddings disabled" warning visible, full filter UI. Submitting does nothing because there's no embedding to compare against.
2. **/ask**: two amber warnings, "+ new chat" disabled, the 6 spec example queries rendered as suggestions.
3. **Once you set `OPENAI_API_KEY`**:
   - run `npm run db:backfill-embeddings`
   - both warnings clear; /search works against real embeddings
4. **Once you also set `ANTHROPIC_API_KEY`**:
   - "+ new chat" enables; click it → empty session opens
   - type one of the example queries → Cmd+Enter → user message persists immediately, assistant message lands seconds later with sources sidebar
   - delete chat / back to list both work

## Known issues / out of scope

- No streaming of assistant responses (yet) — the Messages API call is awaited in full before persisting and revalidating. Adds a few seconds of perceived wait for long answers. Streaming would need a route handler + EventSource on the client, deferable.
- No retry logic on transient Anthropic errors — failures surface as `[Error calling Claude]\n…` in the assistant message body. Visible, recoverable, doesn't lose the user question.
- Conversation history capped at 20 prior turns when building the prompt — long sessions truncate the oldest turns silently.
- Source titles in the persisted JSONB are a snapshot at the time of the answer; if a source row is later renamed, the chat still shows the old title (this is correct for evidence purposes).
- Cost not tracked beyond input/output tokens — multiply by your contract rate to compute spend.
- Retrieval still hits all 14 source types in one polymorphic query; metadata pre-filtering not exposed to Claude (search filters apply on `/search` page only).
