# NERVE Rethink — Audit & Execution Plan

> **Audit date:** 2026-05-17
> **Scope:** Visual rethink of `apps/nerve/` + RAG/business-data expansion.
> **Status:** Audit phase complete. Each round below ships as its own PR for manual review.

---

## Context

NERVE today is a Next.js 14 + Prisma + Neon Postgres + pgvector intranet that aggregates session changelogs, decisions, leads, notes, briefs, demos, brand analyses, pitches, payments, and onboarding into one warehouse. It's the third leg of the AI Salesperson Platform alongside the orchestration runtime and the sales-dashboard.

It works. The data layer is dense and mostly complete through Phase F2 (identity unification + admin queue + public demo serving). The problem is the surface on top of it: a sidebar of 6 nav groups, 12+ pages of stat tiles and lists, no per-section framing, and the founder describes it as "a dashboard with messy data points… no context on what it's actually used for."

This audit covers two parallel rethinks:

1. **Visual rethink** — same colours/style/links, but production-software feel with framing and useful insights per section.
2. **RAG / business-data expansion** — turn NERVE into a real intranet that "knows everything about every data point a business has to offer, plus new ones when needed." Four sub-goals confirmed in scope: lead 360° aggregation, custom facts per business, ask-the-business RAG, external RAG API.

**Audience:** founder + future operators (a new hire should land cold and understand what each page is for).
**Dissertation surface:** keep and improve, not strip.
**Sequencing:** each round below is a self-contained PR. User reviews manually before next round.

---

## 1. What exists today

### Visual surface (12 pages, 6 sidebar groups)

Sidebar groups: **Overview** (Dashboard, Search, Ask) · **Operations** (Sales, Operations Log, Financial, Product & System, Demo Library, Lead Intelligence, Customer Builds) · **Pipeline** (Pivot, Episodes, Strategies) · **Build** (Changelog, Notes) · **Research** (Dissertation, Literature, Methodology) · **Reference** (Knowledge, Legal, System Status).

Top-level pages worth naming:

- `/dashboard` — 5 operational stat tiles + 4+4 dissertation stat tiles + 20-row live activity list + quick-entry sidebar. No per-section copy.
- `/ask` — RAG chat, multi-turn, backed by `ChatSession`/`ChatMessage` and Anthropic `claude-sonnet-4-20250514`.
- `/search` — semantic search form across 16 source types; renders ranked chunks with source links.
- `/sales` — pitch intelligence, filters, outcome distribution.
- `/leads` (81 lines) — lead list with status/source filters. Dedups manual records against SL-MAS profiles.
- `/leads/[id]` (917 lines) — polymorphic lead viewer; pulls brief + brand + demo iframe + QA + lead profile + assignment timeline + onboarding + pitches + composer iterations + spend + pitch brief.
- `/financial` — revenue/cost ledger, sustainability verdict, sparkline, phase table.
- `/dissertation` — research question, sections table, deadlines, supervisor actions.
- `/pipeline` — pivot table over close rate × design combos.
- `/notes` — scope-filtered notes list (shipped 2026-05-17).
- `/changelog` — filtered session changelog timeline.

### Data layer

63 Prisma models. 18 ingest endpoints. 11 read endpoints. All ingest is HMAC-signed (`OUTCOME_INGEST_SECRET` or `NERVE_CHANGELOG_SECRET`).

Core entity stack: `BusinessIdentity` → `LeadProfile` / `LeadRecord` → `SiteBrief` → `BrandAnalysis` → `DemoArtefact` → `PitchBrief` → `QaResult` / `QaVisualResult` → `LeadAssignmentEvent` → `PitchLog` → `StripeEvent` → `OnboardingResponse`.

Producers wired: tools/workbench, outreach pipeline (spendReporter), spec-site-brief skill, build-demo skill, lead-json skill, sales-dashboard (status, payments, signup, admin, onboarding), Supabase webhooks, Stripe webhooks, `/nerve-log`, `/nerve-note`, `/nerve-quick`, `/nerve-decision`.

### RAG layer

- `Embedding` table — single polymorphic row (sourceType + sourceId + chunkText + chunkIndex + metadata JSONB + vector(1536)). ivfflat cosine index in `prisma/sql/embeddings_index.sql`.
- `src/lib/embeddings.ts` exposes `embedRecord()`, `embedText()`, `semanticSearch(query, {topK, filter})`. Filters today: sourceType, phaseLabel, date range.
- Every site-brief / brand-analysis / demo-artefact / qa-result / qa-visual-result / composer-iteration / changelog / note write auto-embeds in the same request.
- `/ask` and `/search` are web UI only — **no external HTTP API**.

### Shared design system

- Tokens (`tailwind.config.ts:26–57`): `bg.*`, `border.*`, `fg.*`, `accent.*`, `status.*`, `phase.*`; Inter + JetBrains Mono; custom `2xs` size.
- Utilities (`globals.css`): `.h-section`, `.pill`, `.nv-table`.
- Components (`src/components/`): `DataTable`, `Form`, `Markdown`, `PageHeader`, `PhasePill`, `PipelinePivot`, `SessionProvider`, `Sidebar`, `StatTile`.

---

## 2. What's incomplete / stubby

| Surface | State | Notes |
|---|---|---|
| `/product` Stage 6 | Stub | 5 static `<div>` items (Architecture, System changelog, Infrastructure, Pipelines, Models). No data wiring, no routes, no links. |
| `/knowledge` | Thin (28 lines) | 4 count tiles. Sub-pages (Brand, Processes, Glossary, Resources) are bare CRUD shells with no narrative or operator help. |
| `/legal` | Thin (30 lines) | 5 count tiles. No narrative. |
| `/pipeline/strategies` | Referenced but absent | Sidebar/PageHeader link to it; page file empty/missing for audit scope. |
| `/leads/[resource]/new` pages | Minimal | 14-line form wrappers, no inline help, no context. |
| F1 backfill in prod | Not yet run | Pre-F1 producer rows (notably JP Nail `lead_profile`) lack canonical identity rows. Script ready at `apps/nerve/scripts/backfill-business-identities.ts`. |
| Embedding backfill | Referenced, unverified | Schema note says "run `npm run db:backfill-embeddings`"; script existence not confirmed in repo. |
| Tartan-pig demo | A2 hardcoded-live phrases remain | Flagged in last handoff (2026-05-17). Not visually re-tested. |
| Visual-QA operator surface | Missing | The 10-PR A–J visual-QA stack exists only as CLI scripts and a markdown report (`apps/nerve/scripts/qa-visual-VERIFICATION.md`). No `/qa` page. |

---

## 3. Visual rethink — direction (no code yet)

The current style (mono labels, bordered cards, dark, terminal-feel) is fine and worth keeping. The problem is information design, not aesthetics. Concrete changes:

1. **Per-page intro component.** Every page above `/dashboard` deserves a one-line "what this is for, what action it supports" subtitle. `PageHeader.tsx` already accepts a subtitle prop — most pages just don't fill it.
2. **Dashboard restructure.** Drop the dual stat-tile rows. Replace with role-shaped sections, each with a one-line framer and a deep-link CTA:
   - *Today's ops* — pitches today, conversions today, pending visits.
   - *Latest leads in pipeline* — top 5 with brief→pitch→outcome status.
   - *Recent agent activity* — what skills/sessions ran, what they wrote.
   - *Quick capture* — note / decision / lead / search shortcuts (replace generic 5-link list).
   - *Dissertation pulse* — collapsed-by-default panel (preserved per user direction, demoted visually).
3. **Sidebar trim.** 6 groups feels research-y. Suggested 4 task-shaped groups:
   - **Pipeline** (Dashboard, Leads, Sales, Pipeline, Demo Library)
   - **Capture** (Notes, Changelog, Operations Log, Quick capture)
   - **Knowledge** (Ask, Search, Knowledge base, Legal, Reference)
   - **Personal** (Dissertation, Literature, Methodology, Research)
4. **Section framing inside cards.** Standardise: card has a header bar with `.h-section` label + one-line description right (small, dim). Today this varies between pages.
5. **Stub-or-real rule.** A page with 4 count tiles and no narrative reads as unfinished. Either give it real content, or mark it "Planned — Q3 2026" so it doesn't look broken.
6. **Visual consistency fixes** (small, batchable):
   - StatTile grid gap: standardise on `gap-px` border-style throughout (some pages use `gap-3`).
   - Table styling: every table uses `.nv-table` (today inconsistent).
   - Card header pattern: pick one (`<div class="h-section">` outside vs `<header class="px-4 py-2 border-b">` inside) and unify.
7. **Insight tiles, not stat tiles.** Replace some counts with directional signals: "close rate this week vs last week", "leads stuck at visited > 7 days", "demos failing QA on contrast". Today everything is a raw number.

---

## 4. Missing for the "business-data RAG" vision

All four sub-goals in scope. Mapping each to the existing stack:

### 4a. Lead 360° aggregation

**Status:** ~80% built. `/leads/[id]/page.tsx` is 917 lines and pulls almost everything. Gaps to audit (not redesign):

- Does it surface **notes** scoped to this lead? (`Note.relatedSlug` exists; needs a panel on the page.)
- Does it surface **embeddings count + last embedded** per lead, so you know what the RAG knows?
- Does it surface **SalespersonEvent** and **PitchLog** rows for this lead in a unified timeline?
- Does it surface **StripeEvent** rows linked to the lead's assignment?
- Does it surface **spend** (SpendLedger) attributable to this lead?

Action: read the existing `/leads/[id]/page.tsx` carefully; produce a gap list against the full 63-model schema; add missing panels.

### 4b. Custom facts per business — NEW

Need a `BusinessFact` model that allows arbitrary structured facts beyond the rigid schema. Suggested shape:

```
BusinessFact {
  id              cuid
  businessIdentityId  String  (FK)
  leadSlug        String?  (denormalised for fast filter)
  key             String   ("owner_name", "best_contact_time", "had_fire_2023")
  value           String   (free text)
  source          String   ("manual", "scraped", "conversation", "agent")
  confidence      Float?   (0..1, optional)
  createdBy       String?
  createdAt       DateTime
}
@@index([businessIdentityId, key])
```

Plus:

- `POST /api/ingest/business-fact` (HMAC, idempotent on `(businessIdentityId, key, createdAt)`).
- Auto-embed on write (so `/ask` and `/search` cover them).
- Inline "Add fact" UI on `/leads/[id]`.

### 4c. Ask-the-business RAG

`semanticSearch()` today filters by sourceType / phaseLabel / date range. Add **metadata JSONB filtering** — specifically `metadata.lead_id` or `metadata.business_identity_id` — so a chat scoped to a single business returns only that business's chunks.

Then drop a per-lead chat panel on `/leads/[id]` that reuses `/ask` machinery with the filter pre-bound. Same `ChatSession`/`ChatMessage` schema, just a `scopeLeadSlug` column on `ChatSession`.

### 4d. External RAG API

`/api/ask/route.ts` + `/api/search/route.ts` — formalise the existing `/ask` and `/search` pages as HMAC-signed JSON endpoints under the same `OUTCOME_INGEST_SECRET` pattern used by other reads. Document in `knowledge/contracts/`. Unblocks iOS / Pi agents / sales-dashboard consumers.

---

## 5. Things noticed while digging (observations)

- **Three parallel lead models** — `LeadRecord` (founder CRUD) + `LeadProfile` (scraped/enriched) + `BusinessIdentity` (canonical F1 dedup). The model is sound but creates UI confusion. The `/leads` list dedups silently. Worth labelling source explicitly in the UI ("from skill", "manual entry", "canonical identity").
- **Visual-QA is a hidden second app inside NERVE.** 10 PRs of layered vision-QA shipped in May, all of it CLI scripts + a markdown report. No `/qa` page surfaces pass/fail per lead. High-value promotion candidate.
- **`/ask` and `/search` are 90% the same machinery.** Different top-K, different UI (chat vs list). Could be one page with a toggle, freeing nav space.
- **Quick-entry sidebar on `/dashboard` is generic.** 5 hardcoded action links that don't reflect the actual daily flow. Replace with real action shortcuts: `/nerve-note`, `/nerve-decision`, "new lead from skill", "search vault."
- **No embedding orphan tracking.** Delete a `DemoArtefact` and its embeddings persist. Low priority but a sweep script would close the loop.
- **Embedding ingest happens inline** (~500ms-2s per save, within Vercel's 60s budget today). At higher volume this becomes a Vercel timeout risk. Watch for the breakpoint.
- **No external API for `/ask` / `/search`.** Already in scope (4d) but worth restating: the RAG vault is invisible to every consumer except the founder web UI.
- **Dissertation surface preserved (per user direction).** Visually demote rather than strip: move "Research" nav group to bottom of sidebar, collapse `/dashboard` dissertation tiles into one panel.
- **Notes feature just shipped.** Currently no link from `/leads/[id]` to notes scoped to that lead, even though `Note.relatedSlug` is indexed for exactly this. Quick win.
- **No `BusinessFact`-like extensibility today.** If you want to record "owner's name is Mark" you have to put it in a note. Works, but unstructured.
- **`/leads/[id]` is 917 lines** — already approaching the size where it needs breaking into sub-components. If 4a's missing panels + 4b's facts + 4c's chat are added, that page becomes 1500+ lines. Plan for componentisation before adding to it.

---

## 6. Execution rounds (each = one PR)

Each round below is a self-contained PR. User reviews manually before next round starts.

| Round | Scope | Risk | Day-1 leverage | PR |
|---|---|---|---|---|
| **R1** | Visual rethink — per-section framing, dashboard restructure, sidebar trim, stub-or-real rule, consistency fixes. Cosmetic. No schema. | Low | High | _pending_ |
| **R2** | Lead 360° polish — add missing panels (notes-for-this-lead, unified timeline, spend, Stripe events). Split `/leads/[id]/page.tsx` into sub-components. No schema. | Low | High | _pending_ |
| **R3** | Ask-the-business chat — extend `semanticSearch` with metadata filter; per-lead chat panel on `/leads/[id]`. Tiny schema (add `scopeLeadSlug` to `ChatSession`). | Medium | High | _pending_ |
| **R4** | `BusinessFact` model + ingest + add-fact UI + auto-embed. Schema migration. | Medium | Medium | _pending_ |
| **R5** | External RAG API (`/api/ask`, `/api/search`, HMAC). | Low | Medium | _pending_ |
| **R6** | Visual-QA operator surface (`/qa` page) + finish stub pages (`/product`, `/knowledge`, `/legal`). | Low | Medium | _pending_ |

**Suggested order:** R1 → R2 → R3 → R4 → R5 → R6. R1 is foundational because everything later sits on the design system it tightens.

Mark a round complete by filling in the PR column and ticking the box below.

- [ ] R1 — Visual rethink _(in review on `feat/nerve-rethink-r1-visual`)_
- [ ] R2 — Lead 360° polish _(in review on `feat/nerve-rethink-r2-leads`)_
- [ ] R3 — Ask-the-business chat _(in review on `feat/nerve-rethink-r3-ask-business`)_
- [ ] R4 — BusinessFact model + UI _(in review on `feat/nerve-rethink-r4-business-facts`)_
- [ ] R5 — External RAG API _(in review on `feat/nerve-rethink-r5-rag-api`)_
- [ ] R6 — Visual-QA surface + finish stubs _(in review on `feat/nerve-rethink-r6-qa-surface`)_

---

## 7. Critical files per round

**R1 — Visual rethink:**
- `apps/nerve/src/app/(app)/page.tsx` — dashboard
- `apps/nerve/src/app/globals.css` — utilities
- `apps/nerve/src/components/PageHeader.tsx` — page intro
- `apps/nerve/src/components/Sidebar.tsx` — nav restructure
- `apps/nerve/src/components/StatTile.tsx` — possible variant for "insight tile"
- `apps/nerve/tailwind.config.ts` — tokens (reference only)

**R2 — Lead 360°:**
- `apps/nerve/src/app/(app)/leads/[id]/page.tsx` (917 lines — split before extending)
- `apps/nerve/src/lib/sl-mas/*` — store helpers for missing panels

**R3 — Ask-the-business:**
- `apps/nerve/src/lib/embeddings.ts` — extend `semanticSearch` filter shape
- `apps/nerve/src/app/(app)/ask/` — reuse for scoped chat
- `apps/nerve/src/app/(app)/leads/[id]/page.tsx` — drop in scoped panel
- `apps/nerve/prisma/schema.prisma` — add `scopeLeadSlug` to `ChatSession`

**R4 — BusinessFact:**
- `apps/nerve/prisma/schema.prisma` — new model + migration
- `apps/nerve/src/app/api/ingest/business-fact/route.ts` — new ingest
- `apps/nerve/src/app/(app)/leads/[id]/page.tsx` — add-fact UI
- `apps/nerve/src/lib/embeddings.ts` — register source type

**R5 — External RAG API:**
- `apps/nerve/src/app/api/ask/route.ts` — new
- `apps/nerve/src/app/api/search/route.ts` — new
- `apps/nerve/src/lib/auth/hmac.ts` (or equivalent existing HMAC helper) — reuse
- `knowledge/contracts/` — new contract doc

**R6 — Visual-QA surface + stubs:**
- `apps/nerve/scripts/qa-visual-*.ts` — connect to a new `/qa` page
- `apps/nerve/src/app/(app)/qa/page.tsx` — new
- `apps/nerve/src/app/(app)/product/page.tsx`, `/knowledge/page.tsx`, `/legal/page.tsx` — finish or label

---

## 8. Working notes (update as rounds ship)

_Append per round: branch name, PR number, what changed, what's deferred._

### R1 — Visual rethink

- **Branch:** `feat/nerve-rethink-r1-visual`
- **CHANGELOG:** `CHANGELOG/2026-05/2026-05-17_014_nerve_rethink_r1_visual.md`
- **Shipped:**
  - New `Section` component (title + framer + optional CTA) — reusable.
  - Sidebar: 6 groups → 4 task-shaped groups (pipeline / capture / knowledge / research).
  - `/dashboard` switched to `PageHeader`, wrapped in `Section` blocks with framer copy, quick-capture shortcuts replaced with daily-flow set.
  - `/product` Stage 6 — `planned` pills + "not built yet" framer.
  - `/knowledge` + `/legal` — intro paragraph above count tiles.
- **Deferred:** Insight-tile delta variant (needs comparison queries → revisit in R2). Stub-page CRUD shells under `/knowledge/*` and `/legal/*` (not flagged urgent in audit). `/pipeline/strategies` empty-file check still open.
- **Verification:** `npx tsc --noEmit` clean. Local visual verification blocked by empty local `DATABASE_URL` — Vercel preview deploy is the verification path.

### R2 — Lead 360° polish

- **Branch:** `feat/nerve-rethink-r2-leads`
- **CHANGELOG:** `CHANGELOG/2026-05/2026-05-17_015_nerve_rethink_r2_leads.md`
- **Shipped:**
  - Extracted shared primitives (`Section`, `Panel`, `Row`, `Swatch`, `formatIso`, `safeHost`, `outcomeColor`) out of `page.tsx` into `_components/primitives.tsx` so new panels can import them without duplicating.
  - Added `NotesPanel` — surfaces notes scoped to this lead via `Note.relatedSlug = id`. Renders title (links to `/notes/[id]`), scope chip, tags, markdown body excerpt.
  - Added `EmbeddingsPanel` — RAG coverage per lead. Aggregates embeddings whose `sourceId` matches the `LeadRecord.id` or any `Note.id` for this lead. Shows total chunks + by-sourceType breakdown + last-embedded timestamp. Forward-compatible: future sl-mas embedding writes will appear here automatically.
  - Added `QaVisualPanel` — six-layer vision QA review rows for this lead via `qaVisualResultStore.listForLead(id)`. Shows bug count, critical flag, brand/voice/section-mean grades, failed layers.
  - Added `StripeEventsPanel` — payment events across every assignment ever tied to this lead. Uses new `stripeEventStore.listForAssignments(ids)` helper. Shows type, status colour-coded, amount, session/sub ids.
  - Extended `stripeEventStore` with `listForAssignments(assignmentIds, limit)` — batched lookup across multiple assignment ids with empty-array short-circuit so Prisma doesn't generate `IN ()`.
  - Updated `hasSlMasData` check to include the new sources so SL-MAS-only leads with only notes (or only QA-visual data) still render rather than 404.
- **Deferred:** Splitting the existing creative/QA/commerce/spend panels into their own files (only primitives + the 4 new panels extracted). Unified chronological timeline merging pitches + assignments + Stripe + composer + QA into one stream (decision: per-event tables are fine for today's volume; revisit when a lead has > 20 events).
- **Verification:** `npx tsc --noEmit` clean. Local visual verification blocked by empty local `DATABASE_URL` — Vercel preview deploy is the verification path.

### R3 — Ask-the-business chat

- **Branch:** `feat/nerve-rethink-r3-ask-business`
- **CHANGELOG:** `CHANGELOG/2026-05/2026-05-17_016_nerve_rethink_r3_ask_business.md`
- **Schema migration:** `24_chat_session_scope` — adds nullable `scopeLeadSlug` column + index to `ChatSession`.
- **Shipped:**
  - `ChatSession.scopeLeadSlug` — when set, `sendMessage` narrows `semanticSearch` to embeddings tied to that lead.
  - `SearchFilter.sourceId` — explicit allow-list of source record IDs. Empty array short-circuits to `[]` rather than running an unfiltered query.
  - `getLeadSourceIds(leadIdOrSlug)` helper in `src/lib/sl-mas/leadEmbeddings.ts` — single source of truth for "what embeddings belong to this lead". `/leads/[id]/page.tsx` and `ask/actions.ts` now both call it.
  - `newLeadChat(leadSlug)` server action — creates a session pre-scoped to the lead.
  - `sendMessage` checks `session.scopeLeadSlug` and applies the source-id filter on every turn. Empty-scope sessions fall through to a "no chunks tied to this lead yet" context block instead of degrading to vault-wide.
  - `LeadChatPanel` on `/leads/[id]` — lists scoped chats + start-new button. Shows ANTHROPIC-disabled and no-embeddings hints.
  - `/ask` list page + `/ask/[sessionId]` page — show a "scoped · slug" badge for any session with `scopeLeadSlug` set, with a deep-link back to the lead from the session view.
- **Deferred:** Inline composer + last-N-messages preview on the lead page itself (decision: link out to `/ask/[sessionId]` for the full chat experience; keeps the lead page from becoming a chat client). External RAG API exposure (R5). Embedding metadata filter (`metadata.relatedSlug`) — sourceId allow-list is enough for today's data shapes and avoids JSONB index requirements.
- **Verification:** `npx tsc --noEmit` clean. Local DB unavailable — Vercel preview deploy runs the migration on the Neon prod branch via `prisma migrate deploy` in the build script. Visual + behavioural verification happens on the preview.

### R4 — BusinessFact model + UI

- **Branch:** `feat/nerve-rethink-r4-business-facts`
- **CHANGELOG:** `CHANGELOG/2026-05/2026-05-17_017_nerve_rethink_r4_business_facts.md`
- **Schema migration:** `25_business_facts` — new `BusinessFact` table (leadSlug, key, value, source, confidence?, createdBy?, phaseLabel, timestamps). Indexed on `leadSlug`, `(leadSlug, key)`, `key`. Append-only by design — multiple rows with the same `(leadSlug, key)` are allowed so history is preserved.
- **Shipped:**
  - `BusinessFact` model with the structured key/value shape the audit spec called out (4b).
  - `businessFactStore` in `src/lib/sl-mas/` with `ingest` (upsert on exact-match tuple), `listForLead`, `deleteById`.
  - `POST /api/ingest/business-fact` — HMAC via `NERVE_CHANGELOG_SECRET` (same header as `/api/ingest/notes`). Auto-embeds on write so chunks reach `/ask`, `/search`, and the R3 scoped chat.
  - `addFact` / `deleteFact` server actions colocated at `/leads/[id]/factActions.ts` for the inline operator UI.
  - `BusinessFactsPanel` — inline form (key/value/source/confidence) + facts-grouped-by-key list + per-row delete.
  - `getLeadSourceIds` extended to include `BusinessFact.id`s so the per-lead scoped chat retrieves fact chunks too.
- **Deferred:** Bulk import / CSV upload of facts. Producer-side wire-ups (the `/spec-site-brief`, `/build-demo`, `/lead-json` skills could start writing facts they discover — that's a skill-side change, not a NERVE change). Schema-suggestion UI (key autocomplete from existing keys in the vault). Per-fact edit (today the flow is delete-then-re-add).
- **Verification:** `npx prisma generate && npx tsc --noEmit` clean. Vercel applies migration 25 via the build script's `prisma migrate deploy`. Local DB unavailable — visual verification on the preview.

### R5 — External RAG API

- **Branch:** `feat/nerve-rethink-r5-rag-api`
- **CHANGELOG:** `CHANGELOG/2026-05/2026-05-17_018_nerve_rethink_r5_rag_api.md`
- **Shipped:**
  - `POST /api/search` — HMAC-signed (`OUTCOME_INGEST_SECRET` via `x-read-signature`), accepts `query` + optional `topK` + optional `filter` (sourceType / sourceId / phaseLabel / createdAfter / createdBefore). Returns ranked chunks.
  - `POST /api/ask` — HMAC-signed, one-shot RAG → Claude answer. Optional `leadSlug` narrows retrieval to the same source-id allow-list `LeadChatPanel` uses (R3); optional `priorTurns` lets the caller pass its own short conversation history. Response includes `answer`, `sources`, `scope`, `model`, token usage. No server-side session persistence.
  - Both routes reuse the existing `verifySignature` helper (same hex-encoded HMAC-SHA256 of the raw body, `sha256=` prefix tolerated). Dev bypass via `OUTCOME_INGEST_ALLOW_UNSIGNED=true` for non-prod ergonomics.
  - `knowledge/contracts/rag-api.md` — contract doc covering auth, request/response shapes, status codes, operational notes (cost, latency, scope semantics).
  - `knowledge/contracts/api-surface.md` — NERVE section added covering read + RAG + ingest + public endpoints, plus a pointer to the rag-api contract.
- **Deferred:** Streaming responses (SSE) for `/api/ask`. Tool use. Server-side session persistence via `/api/ask` (today only the web UI creates `ChatSession` rows; the API is one-shot). Consumer-side wire-ups in iOS / Pi runtime / sales-dashboard — those happen app-side, not NERVE-side.
- **Verification:** `npx tsc --noEmit` clean. Test via signed curl once on Vercel preview. Cost & latency notes in the contract doc so any future consumer scopes its call rate appropriately.

### R6 — Visual-QA surface + finish stubs

- **Branch:** `feat/nerve-rethink-r6-qa-surface`
- **CHANGELOG:** `CHANGELOG/2026-05/2026-05-17_019_nerve_rethink_r6_qa_surface.md`
- **Shipped:**
  - New `/qa` operator page promoting the visual-QA stack from CLI-only / markdown-report into a first-class NERVE surface. Sections: state of play (total reviews + critical rate over last 50 + reviews-this-week + latest-run), cohort baselines (medians + cohort rates via `qaVisualResultStore.computeBaselines`, hidden below n=10), latest critical bugs (top three findings per row), recent reviews table with filter form (critical-only / lead / vertical).
  - Added "Visual QA" entry under the `pipeline` sidebar group with a live count. `loadCounts` in `(app)/layout.tsx` extended to query `prisma.qaVisualResult.count()`.
- **Stub-page handling (re: audit's "finish stubs"):** R1 already labelled `/product` Stage 6 placeholders with `planned` pills + framer copy and gave `/knowledge` / `/legal` narrative intros. R6 leaves them as-is — the "stub-or-real rule" was applied with the "clearly label" branch, which is the honest call until those pages have real demand.
- **Deferred:** Per-layer drill-down (today the page shows the top three critical bugs; drilling into brand-fidelity / customer-reaction / section-grades JSON is one click away via `/leads/[id]` which already has the per-lead `QaVisualPanel` from R2). Vertical autocomplete on the filter form. Trend chart (critical-rate over time). All low-day-1-leverage; revisit if the QA cohort grows past a few hundred reviews.
- **Verification:** `npx tsc --noEmit` clean. Local DB unavailable — Vercel preview is the verification path.

---

### R9 — Visit event ingest (post-audit follow-up, in review)

- **Branch:** `feat/nerve-r9-visit-event-ingest`
- **CHANGELOG:** `CHANGELOG/2026-05/2026-05-17_022_nerve_r9_visit_event_ingest.md`
- **Plan:** `apps/nerve/LEADS-OPS-PLAN.md` § R9
- **Why it landed:** R8 shipped /leads ops view but its visit-time + (future) feedback cells lived on a Supabase live-pull. R9 mirrors the data into NERVE Postgres so the column survives any Supabase outage and so SP feedback text flows into the RAG vault (`/ask`, `/search`, R3 scoped chat) for free.
- **Shipped:**
  - `apps/nerve/prisma/migrations/26_visit_events/migration.sql` + `VisitEvent` model in `schema.prisma` (next to `LeadAssignmentEvent`, same Phase B family).
  - `apps/nerve/src/lib/sl-mas/visitEventStore.ts` — `ingest` / `listForLead` / `listForAssignment` / `aggregateForLead` / `aggregateAcrossLeads`. Append-only, idempotent on `event_id`. Pattern mirrors `leadAssignmentEventStore`.
  - `apps/nerve/src/app/api/ingest/visit-event/route.ts` — HMAC-signed POST handler sharing `OUTCOME_INGEST_SECRET` with the other Phase B endpoints. Auto-embeds the `feedback` field with `sourceType = "VisitEvent"` so the chunks reach `/ask` and the per-lead scoped chat. Embedding failure is swallowed (the row stays queryable).
  - `apps/nerve/src/lib/sl-mas/leadEmbeddings.ts` — `getLeadSourceIds()` now picks up `VisitEvent.id`s with non-null `feedback` so R2/R3 surfaces feedback text alongside notes + business facts.
  - `apps/nerve/src/lib/sl-mas/leadOpsQuery.ts` — visit-time + feedback-count cells switched to NERVE-first via `aggregateAcrossLeads()`. Supabase `fetchVisits()` stays as a fallback for leads with no NERVE rows yet, so R9 is safe to ship before mobile-api wire-up propagates for every lead.
- **Deferred (out of scope for R9):**
  - Producer wire-up in mobile-api (`POST /visits` + `PATCH /visits/:id` fan-out to NERVE). Sketched in the changelog with the exact curl.
  - Backfill of historical Supabase `visits` rows into NERVE — one-off script under `apps/nerve/scripts/backfill-visit-events.ts` if wanted.
  - Removing the Supabase `fetchVisits` fallback from `leadOpsQuery` entirely. Revisit once mobile-api has propagated to every lead.
- **Verification:** `npx prisma generate && npx tsc --noEmit` clean. Local DB unavailable — Vercel preview is the verification path. Signed-curl recipe + golden-path walkthrough in the changelog.

### R8 — Leads operations view (post-audit follow-up, in review)

- **Branch:** `feat/nerve-r8-leads-ops-view`
- **CHANGELOG:** `CHANGELOG/2026-05/2026-05-17_021_nerve_r8_leads_ops_view.md`
- **Plan:** `apps/nerve/LEADS-OPS-PLAN.md` (R8 section live; R9 follow-up still pending)
- **Why it landed:** Founder asked "where do all of the assigned leads go? we should be able to see them all in one view." The pre-R8 `/leads` was two inventory lists with no cross-lead assignment / stage / feedback signal. R8 replaces the page with a dense ops table — one row per canonical business with the 11 columns assignment, stage, demo+QA, pitches, build, revenue, last-activity, visit-time, feedback, flags.
- **Shipped:**
  - `apps/nerve/src/lib/sl-mas/leadOpsQuery.ts` — `loadLeadsOps(searchParams)` fans out ~10 parallel Prisma + Supabase queries, zips per canonical business (dedup via `normaliseName`), applies URL-driven filters server-side. Exports `LeadOpsRow`, `LeadOpsFilterOptions`, `LeadOpsSummary`, `STAGE_ORDER`.
  - `apps/nerve/src/app/(app)/leads/_components/LeadsOpsFilters.tsx` + `LeadsOpsTable.tsx` — both server components, no client JS. Filters submit as GET; the URL is the only state.
  - `apps/nerve/src/app/(app)/leads/page.tsx` — old 372-line implementation reduced to a thin orchestrator (PageHeader + state-of-play `StatTile` grid + Section wrapping filters + table).
  - `apps/nerve/src/lib/supabase-builds.ts` extended with `fetchSalesUsers()` and `fetchVisits(assignmentIds)` for the live-pull SP / visit columns. Both degrade to empty when service-role is missing.
- **Deferred:** R9 — `VisitEvent` ingest moves visit data + structured per-visit feedback off live Supabase reads and into NERVE Postgres. Schema + endpoint sketched in `apps/nerve/LEADS-OPS-PLAN.md` § R9; its own PR.
- **Verification:** `npx tsc --noEmit` clean. Local DB unavailable — Vercel preview is the visual verification path (filter URLs spec'd in the changelog).

### R7 — Demo-library plumbing fix (post-audit follow-up)

- **Branch:** `feat/nerve-r7-demos-fix`
- **CHANGELOG:** `CHANGELOG/2026-05/2026-05-17_020_nerve_r7_demos_fix.md`
- **Why it landed:** During post-merge verification the user reported "skill demos don't show in NERVE" and "a lot of sections have old tests / no info". Root cause: `/demos` (list + detail + dashboard tile + sidebar count) read the legacy `DemoRecord` table while `/build-demo` skill writes to `DemoArtefact` via `/api/ingest/demo-artefact`. The two tables had no link; skill output surfaced on `/leads/[id]` (R2) but never in the Demo Library.
- **Shipped:**
  - `/demos/page.tsx` rewritten — reads `prisma.demoArtefact.findMany`, columns: generated_at · business · lead (deep-link) · vertical · aesthetic positioning · photo count · html size · palette swatch · source.
  - "by vertical" rollup section: artefact count + avg photos + avg html size per vertical.
  - `/demos/[id]/page.tsx` reduced to a redirect — looks up by `id` or `artefact_id`, sends to `/leads/<leadId>` where the iframe preview + brief + brand + QA already live (R2). Unknown ids redirect to `/demos`.
  - `/demos/new/page.tsx` retired — manual entry was for the pre-skill era. Now shows a one-paragraph framer pointing at `/build-demo`.
  - Deleted dead code: `/demos/actions.ts` (createDemo/updateDemo/deleteDemo) and `/demos/_form.tsx`.
  - `/dashboard` "active demos" tile renamed to "demos built" and reads `prisma.demoArtefact.count()`. Recent activity feed swapped `demoRecord` source for `demoArtefact` (ordered on `generatedAt`).
  - `(app)/layout.tsx` sidebar count swapped to `prisma.demoArtefact.count()`.
  - Legacy `DemoRecord` table untouched in schema — preserves any old rows for future inspection; `src/lib/evidence.ts` still resolves the legacy sourceType for any old embeddings.
- **Deferred:** Outcome column on the Demo Library row (would need a join through `LeadAssignmentEvent` — defer until volume justifies). Removing `DemoRecord` model entirely (data preservation; revisit after a few weeks of confirmed disuse).
- **Verification:** `npx tsc --noEmit` clean. Vercel preview is the visual path.

---

## Wrap

The six rounds from the original audit are done. R7 + R8 + R9 above are post-audit follow-ups — R7 fixed table-rename drift in the demo library, R8 introduces the cross-lead ops surface the audit never planned for, R9 mirrors SP visit data into NERVE so the ops view doesn't depend on Supabase being reachable from Vercel and feedback text flows into the RAG vault. Future surface work of that shape (own plan doc, own PR, own changelog) is encouraged; future bugs of R7's shape belong in `NERVE-ROADMAP.md` as their own tasks rather than reopening this doc.
