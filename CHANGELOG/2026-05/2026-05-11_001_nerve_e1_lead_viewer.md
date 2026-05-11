# 2026-05-11 · NERVE E1 — Lead viewer page

## What changed
- Extended `apps/nerve/src/app/(app)/leads/[id]/page.tsx` to a full SL-MAS
  lead-detail surface. Existing CRUD (LeadRecord edit/delete) preserved.
- New sections (each rendered only when its data source has rows):
  - Stat tile strip — Google rating, IG followers, website quality, pitch
    count + £ closed, demos generated, API spend total
  - Site brief (latest) — verdict, pitch angle, diagnosis, test of success,
    blueprint sections, full markdown in a collapsible disclosure
  - Brand analysis — palette swatches, typography, voice adjectives,
    positioning rationale, logo description
  - Demo artefact (latest) — meta + sandboxed `<iframe srcDoc=…>` preview
    of `html_inline`
  - QA results — per-run table (score / passed / contrast / a11y / errors)
  - Lead profile — full A4 snapshot (contact, hours, services, top reviews,
    qualification reasons)
  - Assignment timeline — B1 events, transition strings, SP, commission
  - Customer onboarding — B4 latest row for the most-recent assignment
  - Pitch history — `pitchLog` joined on business name
  - Composer iterations — A1 saves
  - API spend — A6 per-call ledger in a `<details>` disclosure
- Page renders if EITHER `LeadRecord` (cuid) OR any SL-MAS row keyed on the
  same string (slug) exists. 404 only when both spaces miss. Header title
  falls back across `LeadRecord.name` → `LeadProfile.business_name` →
  `SiteBrief.business_name` → `DemoArtefact.business_name` → raw id.

## Why
NERVE-ROADMAP.md E1 — first user-visible payoff for the Phase A/B warehouse.
Single-tab operator surface that shows every artefact + signal NERVE has
seen for a lead. Starts the Mission Control retirement track (Phase E).

## Stack
Next.js 14 App Router, server component (`force-dynamic`), Prisma (existing
client), `Promise.all` over 10 SL-MAS store calls + pitch/onboarding
lookups. No new dependencies. Reuses `PageHeader`, `StatTile`, `Markdown`
primitives + existing Tailwind tokens (`text-fg`, `bg-bg-panel`, `.h-section`,
etc).

## Integrations
- `leadProfileStore.getByLeadId`
- `siteBriefStore.listForLead`
- `brandAnalysisStore.latestForLead`
- `demoArtefactStore.listForLead` / `latestForLead`
- `qaResultStore.listForLead`
- `leadAssignmentEventStore.listForLead`
- `onboardingResponseStore.getByLeadAssignmentId`
- `composerIterationStore.listByLead`
- `spendLedgerStore.listRecent` (with `{ lead_id }` filter)
- `prisma.leadRecord.findUnique` + `prisma.pitchLog.findMany`

## How to verify
1. `cd apps/nerve && npm run dev` (port 4400)
2. Open `http://localhost:4400/leads/<slug>` for an SL-MAS slug (e.g. the
   slug used in any backfilled spec-site-brief run) — should render
   without a LeadRecord
3. Open `http://localhost:4400/leads/<cuid>` for an existing LeadRecord —
   should render with the original CRUD panel preserved, plus any SL-MAS
   sections if data happens to be keyed on the cuid
4. Open `http://localhost:4400/leads/<random-garbage>` — should 404

Typecheck (`npx tsc --noEmit` from `apps/nerve`) + production build
(`next build`) pass clean. Pre-existing prerender failures on `/login` and
`/supervisor/login` are unchanged on main and unrelated to this PR.

## Known issues
- **ID space split.** `LeadRecord.id` is a cuid (NERVE manual entry).
  Producer-side SL-MAS rows use a slug. The page is polymorphic on `[id]`
  but the two surfaces don't cross-link today — listing leads in NERVE
  (`/leads`) only shows LeadRecord rows, so SL-MAS-only leads aren't yet
  reachable from the leads index. A follow-up could add a "SL-MAS leads"
  list view or a `LeadRecord.slug` column to unify.
- **Pitch history join is business-name-based.** Legacy `pitchLog` schema
  doesn't store `lead_id`. Best-effort match on `displayName` — same-name
  collisions across businesses would cross-pollute.
- **Onboarding shown for the most-recent assignment only.** If a lead has
  multiple closed assignments over time, only the latest gets surfaced.
  Acceptable for now (rare in practice).
- **No edit affordance for SL-MAS data.** All read-only — write path is
  the upstream producers (skills, Pi runtime, Stripe webhooks).
