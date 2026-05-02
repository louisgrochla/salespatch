# NERVE — Stage 6: Demos, Leads, Product/System rest, Knowledge Base, Legal & Compliance

**Date:** 2026-05-02
**Branch:** `claude/nice-kare-edfa44`

## What changed

The remaining 16 sub-sections of the founder layer. Every spec section now has working CRUD + embedding.

### Demo Library — `/demos`
- Full CRUD: list, new, detail/edit, delete
- Template performance breakdown: aggregates per `templateVersion` showing built / closed / close-rate so the founder can see which template version is converting best
- Outcome colour-coded (closed / rejected / follow_up)

### Lead Intelligence — `/leads`
- Full CRUD with do-not-contact flag
- Source-method performance: per-`sourceMethod` totals + close rate of pitched, so "walk-by vs referral vs cold-call" comparisons land instantly
- Status colours per row

### Product & System — 5 new sub-sections
All 5 placeholders from Stage 4's product sub-nav are now wired. Each has full CRUD + embedding.
- `/product/architecture` — versioned design docs in markdown (rendered via Markdown component)
- `/product/changelog` — system changelog: date / version / what changed / why
- `/product/infrastructure` — service / purpose / config notes / date
- `/product/pipelines` — pipeline name / description / version / performance notes
- `/product/models` — model name / purpose / training details / cost per cycle (decimal)

The 5 grayed-out tabs in `ProductSubNav` are now active links.

### Knowledge Base — `/knowledge` (section root + 4 sub-sections)
- Sub-nav: overview / brand / processes / glossary / resources
- `/knowledge/brand` — markdown brand documents (positioning, messaging, tone of voice)
- `/knowledge/processes` — repeatable process guides with auto-stamped `lastUpdated`
- `/knowledge/glossary` — alphabetical term + definition + context
- `/knowledge/resources` — external tools with name / URL / purpose / notes

### Legal & Compliance — `/legal` (section root + 5 sub-sections)
- Sub-nav: overview / documents / gdpr / contractor agreements / companies house / ip
- `/legal/documents` — typed legal documents with markdown content OR file reference
- `/legal/gdpr` — processing records (data type / collection method / retention / legal basis)
- `/legal/contractor-agreements` — versioned full-text agreements with markdown render
- `/legal/companies-house` — filing type / description / date / reference
- `/legal/ip` — typed IP records (trademark / patent / copyright / trade secret / other) with reference + description

### Patterns
Every section follows the same shape established in Stages 2–5:
- `actions.ts` — create/update/delete server actions, zod-validated, embed on save, polymorphic `Embedding.deleteMany` on delete
- `_form.tsx` — minimal form using shared `Field` / `TextInput` / `TextArea` / `Select` / `SubmitButton`
- `page.tsx` — list with section sub-nav (where applicable) + `+ new` action
- `new/page.tsx` — create form
- `[id]/page.tsx` — detail view + `?edit=1` swap to edit form + delete button

## Why

The data model was complete since Stage 1. What was missing was operator surfaces. Stage 6 makes every spec section reachable, writable, and indexed for RAG. Once the founder + supervisor + public surfaces are all live, the only remaining work is operational (deploy, wire Supabase, set keys).

## Stack

No new deps. Same shared components.

## Verification

- `tsc --noEmit` clean
- Visited `/legal` and `/knowledge` in the dev preview — both render with their respective sub-navs and all sub-section tiles showing 0 (data not yet seeded)
- Sidebar already had `/knowledge` and `/legal` entries from Stage 1; they now resolve correctly
- Product sub-nav's 5 previously-grayed tabs are now active links

## Known issues / out of scope

- **Exports**: only sales / operations / sections / literature / evidence / financial / prompts have CSV+JSON endpoints. Demos, leads, knowledge, and legal sub-sections don't have export routes — easy to add later if the user needs them.
- **Brand documents**: no positioning/messaging/tone split — single body field. Add structured fields if the spec evolves.
- **Process guides**: `lastUpdated` auto-stamps on every save; no manual override.
- **Companies House** / **IP**: no integration with actual Companies House API — pure record-keeping. The reference field is a free-text place to paste the filing number.
- **Contractor agreements**: stored as markdown `content`, not PDF. If the user wants a binary file ref, add a `fileReference` column (mirrors `LegalDocument`).
- **Forms intentionally minimal**: most are 3–6 fields. If any section needs richer affordances (e.g. checkbox lists, select-from-existing), it's a small follow-up.
- All new entries embed via the same OpenAI pipeline; until `OPENAI_API_KEY` is set, embedding silently no-ops.
