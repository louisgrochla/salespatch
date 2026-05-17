# NERVE rethink — R4 BusinessFact model + UI

**Date:** 2026-05-17
**Scope:** Fourth of six rounds in the NERVE rethink (see `apps/nerve/RETHINK-AUDIT.md`).
**Branch:** `feat/nerve-rethink-r4-business-facts`
**Base branch:** `main`

## What changed

### Schema

- **New migration** `apps/nerve/prisma/migrations/25_business_facts/migration.sql` — creates `BusinessFact` table. Columns: `id`, `leadSlug`, `key`, `value`, `source`, `confidence?`, `createdBy?`, `phaseLabel`, `createdAt`, `updatedAt`. Indexes: `leadSlug`, `(leadSlug, key)`, `key`.
- **Modified** `apps/nerve/prisma/schema.prisma` — corresponding `model BusinessFact` next to `Note`, with documentation explaining the append-only convention.

### Library

- **New** `apps/nerve/src/lib/sl-mas/businessFactStore.ts` — wire-format types (`BusinessFactInput`, `BusinessFactRow`) and three methods:
  - `ingest(input)` — upserts on the exact tuple `(leadSlug, key, value, source)`; returns `{ id, inserted, row }` so callers know whether they created a new row.
  - `listForLead(leadSlug, limit?)` — returns wire shape, ordered by `key asc, createdAt desc` so the grouped-by-key UI renders deterministically.
  - `deleteById(id)` — used by the operator UI's delete button.
- **Modified** `apps/nerve/src/lib/sl-mas/leadEmbeddings.ts` — `getLeadSourceIds` now also includes every `BusinessFact.id` for the lead, so the R3 scoped chat retrieves fact chunks alongside `LeadRecord` and `Note` chunks. Docstring updated.

### Ingest

- **New** `apps/nerve/src/app/api/ingest/business-fact/route.ts` — `POST` ingest endpoint mirroring the `/api/ingest/notes` pattern:
  - HMAC via `NERVE_CHANGELOG_SECRET` (header `x-nerve-secret` or `x-nerve-changelog-secret`).
  - Zod-validated body: `lead_slug`, `key`, `value`, `source`, optional `confidence` (0..1), optional `created_by`, optional `phase_label` (defaults to current).
  - Calls `businessFactStore.ingest` then `embedRecord` with `sourceType = "BusinessFact"` and metadata `{ section, leadSlug, key, source }`.
  - Logs to `webhookIngestion` for audit.

### Server actions (operator UI)

- **New** `apps/nerve/src/app/(app)/leads/[id]/factActions.ts`:
  - `addFact(leadSlug, formData)` — reads `key`, `value`, `source`, optional `confidence` from the form; normalises the key (lowercase, snake_case enforced via regex); calls `businessFactStore.ingest` + `embedRecord` + revalidates the lead page.
  - `deleteFact(leadSlug, factId)` — first deletes the matching `Embedding` rows (so the RAG vault stops citing it), then deletes the fact row, then revalidates.
  - Both wrapped in `requireSession()` — founder-only.

### UI

- **New** `apps/nerve/src/app/(app)/leads/[id]/_components/BusinessFactsPanel.tsx`:
  - Inline add-fact form (key/value/source/confidence + submit) above the list.
  - Facts grouped by key (e.g. `owner_name` with 2 historical values stacks beneath one heading).
  - Per-row delete button with red border styling.
  - Empty-state placeholder when no facts exist yet.
- **Modified** `apps/nerve/src/app/(app)/leads/[id]/page.tsx`:
  - Fetches `businessFactStore.listForLead(id, 200)` in the main `Promise.all`.
  - `hasSlMasData` updated so a lead with only facts (no profile / brief / note / etc.) still renders.
  - `BusinessFactsPanel` rendered between `LeadChatPanel` and `NotesPanel` so facts sit at the top of the per-lead context block.

## Why

The audit (section 4b, `apps/nerve/RETHINK-AUDIT.md`) called out that NERVE today has no way to record arbitrary structured facts about a business beyond the rigid schemas (`LeadProfile`, `SiteBrief`, etc.). "Owner's name is Mark" or "they had a fire in 2023" had to go in a free-form Note — captured, but unstructured and impossible to query as a key/value tuple.

R4 adds the structured shape (`BusinessFact`) plus three ingress points:

1. **Producer-side ingest** — `/api/ingest/business-fact` for the skills and future agents.
2. **Operator-side UI** — the inline `BusinessFactsPanel` for manual entry while reading a lead page.
3. **RAG vault** — every fact auto-embeds, so `/ask`, `/search`, and the R3 scoped chat all pick it up on the next query without further wiring.

This closes one of the four sub-goals the user named for the business-data RAG vision (alongside R2's lead 360°, R3's ask-the-business, and R5's external API).

## Stack

- Prisma ORM (existing) + Neon Postgres (existing) + pgvector (existing)
- Next.js 14 App Router + server actions (existing)
- Zod for runtime validation (existing)
- No new dependencies.

## Integrations

None new. Reuses the existing `embedRecord` pipeline, the existing `NERVE_CHANGELOG_SECRET` shared-secret auth, and the existing `webhookIngestion` audit log.

## How to verify

Programmatic:

```bash
cd apps/nerve && npx prisma generate && npx tsc --noEmit   # passes, exit 0
```

Migration applies automatically on Vercel via the `build` script (`prisma generate && prisma migrate deploy && next build`).

On the Vercel preview:

1. Open a lead — e.g. `/leads/jp-nail`. Confirm `BusinessFactsPanel` renders between `LeadChatPanel` and `NotesPanel`, with an inline add form and an empty-state message.
2. Add a fact: key `owner_name`, value `Mark Smith`, source `manual`, confidence `0.9`. Submit. Confirm the row appears under an `owner_name` heading with the values rendered.
3. Add a second value under the same key: `Mark`, source `agent`, no confidence. Confirm both values appear under the same `owner_name` heading, ordered newest-first.
4. Delete the older value. Confirm the row disappears and the count updates.
5. Navigate to `/leads/jp-nail` `LeadChatPanel` → start scoped chat. Ask "what's the owner's name?" — the chat should cite the `BusinessFact` chunk in the Sources panel (after R3 + R4 are both in prod and embeddings have settled).
6. Sanity check the ingest endpoint:
   ```bash
   curl -X POST https://nerve.salespatch.co.uk/api/ingest/business-fact \
     -H "x-nerve-secret: $NERVE_CHANGELOG_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"lead_slug":"jp-nail","key":"best_contact_time","value":"Tue mornings","source":"manual"}'
   ```
   Expect `{"ok":true,"id":"…","action":"inserted"}`. Re-running returns `"action":"updated"` (or `"inserted":false` from the store, surfaced as `"updated"` by the route).

## Known issues

- Local dev server can't run without `DATABASE_URL`. UI verification waits for Vercel preview.
- No per-fact edit — today the operator deletes and re-adds. Adequate for low-volume manual entry; revisit if facts grow into the hundreds per lead.
- No producer-side wiring yet — the `/spec-site-brief` / `/build-demo` / `/lead-json` skills don't write facts. They could surface things like `owner_name`, `phone_alt`, `recent_change` once R4 lands, but that's a skill-side PR.
- No bulk CSV import. Single-fact-at-a-time only. Same trade: revisit if volume justifies it.
- `key` autocomplete from the existing fact vocabulary is not implemented. Today the operator types it manually; the snake-case regex prevents typos within a single entry but doesn't prevent "owner_name" vs "ownerName" inconsistency across leads.
