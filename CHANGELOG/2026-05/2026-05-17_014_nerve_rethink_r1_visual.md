# NERVE rethink — R1 visual pass

**Date:** 2026-05-17
**Scope:** First of six rounds in the NERVE rethink (see `apps/nerve/RETHINK-AUDIT.md`).
**Branch:** `feat/nerve-rethink-r1-visual`

## What changed

- **New** `apps/nerve/src/components/Section.tsx` — reusable section wrapper with title, optional one-line framer copy, and optional deep-link CTA. Replaces the loose `<div className="h-section">` + grid pattern repeated across the app.
- **Modified** `apps/nerve/src/components/Sidebar.tsx` — reorganised the navigation from 6 nav groups (overview / operations / pipeline / build / research / reference) into 4 task-shaped groups (pipeline / capture / knowledge / research). Every destination preserved; nothing dropped or renamed.
- **Modified** `apps/nerve/src/app/(app)/dashboard/page.tsx` — replaced the custom `<header>` with the shared `PageHeader` (subtitled), wrapped each block in the new `Section` component with explanatory framer copy and a deep-link CTA, refreshed the quick-capture shortcut list to match the actual daily flow (`/notes/new`, `/sales/new`, `/operations/new?type=decision`, `/leads/new`, `/search`), added a framer line to the "pitch outcomes" card. Also returned `closedCount` and `pitchedCount` from `loadDashboard()` to surface the close-rate denominator in the hint.
- **Modified** `apps/nerve/src/app/(app)/product/page.tsx` — Stage 6 placeholders now carry a `planned` pill and a one-line "why this is empty" framer; subtitle promoted from "Prompt library lands first…" to a description of the section's role.
- **Modified** `apps/nerve/src/app/(app)/knowledge/page.tsx` — added an introductory paragraph explaining what the section is for so an operator landing cold can orient.
- **Modified** `apps/nerve/src/app/(app)/legal/page.tsx` — same: added an introductory paragraph above the count tiles.
- **New** `apps/nerve/RETHINK-AUDIT.md` — full audit + 6-round execution plan committed to the repo as the working document the rounds tick against.

## Why

The dashboard and most sub-pages render dense data tiles without telling the reader what each section is for or what action it supports. Audit findings written up in `apps/nerve/RETHINK-AUDIT.md` (sections 3 + 5) called this out:

- Custom header on `/dashboard` diverged from every other page's `PageHeader` pattern.
- Sidebar was 6 nav groups with overlapping intents — `overview` and `operations` were doing similar work.
- Stub pages (`/product` Stage 6, `/knowledge`, `/legal`) read as unfinished because they were count tiles with no narrative.

R1 fixes the information design without touching data queries, schema, or business logic. Foundation work for R2-R6.

## Stack

- Next.js 14 App Router (existing)
- Tailwind 3 (existing tokens reused — no token changes)
- Lucide React icons (existing)

## Integrations

None. UI-layer only.

## How to verify

Local UI verification is blocked because `DATABASE_URL` is intentionally empty in `apps/nerve/.env.local` (per project memory: production credentials never live locally).

Programmatic verification done:

```bash
cd apps/nerve && npx tsc --noEmit   # passes, exit 0
```

Visual verification on Vercel preview deploy once the PR opens:

1. Open the Vercel preview URL the PR comment surfaces.
2. Sign in with founder credentials.
3. Navigate `/dashboard` — confirm `PageHeader` renders with subtitle + phase pill, three Section blocks each carry a framer line, "quick capture" shows the new shortcut list.
4. Navigate `/product` — confirm Stage 6 section has the `planned · stage 6` heading + "Not built yet" framer + `planned` pill on every row.
5. Navigate `/knowledge` and `/legal` — confirm the intro paragraph appears above the count tiles.
6. Scan the sidebar — confirm 4 nav groups (pipeline / capture / knowledge / research), every previous destination still present.

## Known issues

- Local dev server can't run without `DATABASE_URL`. Visual verification waits for Vercel preview.
- R2-R6 (lead 360° polish, ask-the-business chat, BusinessFact model, external RAG API, visual-QA surface + stubs) are each their own PR per the audit plan.
- The "stub-or-real rule" was applied to `/product` Stage 6 only; `/knowledge` and `/legal` were given narrative framing instead because they have real count data, just no operator context.
