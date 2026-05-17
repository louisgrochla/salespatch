# NERVE rethink — R6 visual-QA operator surface

**Date:** 2026-05-17
**Scope:** Final (sixth) round in the NERVE rethink (see `apps/nerve/RETHINK-AUDIT.md`).
**Branch:** `feat/nerve-rethink-r6-qa-surface`
**Base branch:** `main`

## What changed

### Routes

- **New** `apps/nerve/src/app/(app)/qa/page.tsx` — operator surface for the visual-QA stack. Promotes the 10-PR vision-review system from CLI scripts + markdown report into a first-class page. Sections:
  - **State of play** — total reviews, critical rate over the last 50 runs, reviews this week, latest run timestamp.
  - **Cohort baselines** — medians (brand fidelity, voice consistency, section-grades mean) + cohort rates (critical / would-buy / would-act / trust-high / test-passes) via `qaVisualResultStore.computeBaselines`. Hidden below n=10 with an explicit "sample noise dominates" message — same threshold the store enforces.
  - **Critical bugs** — latest reviews with `hasCritical = true`. For each: lead link + ran-at + model + top three `BugFinding` items (severity + location + finding).
  - **Recent reviews** — table across all leads, newest first, with a filter form (critical-only checkbox + lead id + vertical for baselines). Lead column links into `/leads/[id]` where the R2 `QaVisualPanel` shows the per-lead view.

### Sidebar

- **Modified** `apps/nerve/src/components/Sidebar.tsx` — added `qaVisual?: number` to `SidebarCounts` and a "Visual QA" item under the `pipeline` nav group (icon: `CheckCircle2`) with a live count badge.
- **Modified** `apps/nerve/src/app/(app)/layout.tsx` — `loadCounts` now runs `prisma.qaVisualResult.count()` alongside the other 13 parallel counts.

## Why

The audit flagged visual-QA as "a hidden second app inside NERVE": 10 PRs of layered vision-review logic landed in May, but the only ways to inspect results were CLI scripts (`apps/nerve/scripts/qa-visual-*.ts`) and a markdown verification report. A founder or operator reviewing demo quality had no in-app surface — they had to either know the scripts existed or hunt through `/leads/[id]` one row at a time.

R6 promotes the same data into a cross-lead overview, with the cohort baselines that already existed in the store (`computeBaselines` shipped per PR-G) but had nowhere to render.

## Stack

- Next.js 14 App Router (existing)
- Prisma (existing) + the `qaVisualResultStore` from `apps/nerve/src/lib/sl-mas/`
- date-fns (existing)
- No new dependencies.

## Integrations

None. Read-only against the existing `QaVisualResult` table.

## How to verify

Programmatic:

```bash
cd apps/nerve && npx tsc --noEmit   # passes, exit 0
```

On the Vercel preview:

1. Click "Visual QA" in the sidebar (under **pipeline**). Confirm the count badge matches `SELECT COUNT(*) FROM qa_visual_results`.
2. State-of-play tiles should populate (total reviews, critical rate %, reviews this week, "X ago" latest-run).
3. Cohort baselines section:
   - With no filter: shows medians + cohort rates if the total run count is ≥ 10. Otherwise renders the "n=… < 10 — medians not statistically meaningful yet" message.
   - With `?vertical=cafe` (or whatever vertical you have artefacts for): narrows the cohort.
4. Critical bugs section: if any recent review has `has_critical = true`, that row's top three critical findings render with severity / location / finding.
5. Recent reviews table: lead column links into `/leads/[id]` and the per-lead `QaVisualPanel` from R2 shows the full detail there.
6. Filter form: `?critical=1` and `?lead=<slug>` should both reload the table with the applied filter.

## Known issues

- Local dev server can't run without `DATABASE_URL`. Visual verification on the preview only.
- No trend chart for critical rate over time. The headline tile uses last-50 as denominator; sufficient for a quality-control glance but not for week-on-week trend tracking. Add later if the QA cohort grows past a few hundred reviews.
- Vertical filter on the form is a free-text input — no autocomplete from the actual vertical vocabulary. Same trade as R4's `key` field: keep it simple; revisit if typos turn out to be a problem.
- R6 leaves the stub pages (`/product` Stage 6, `/knowledge`, `/legal`) in the labelled state R1 shipped them in. The audit's "stub-or-real" rule was applied via the "clearly label" branch — fine until those pages have real demand.

## Audit status

This was the last of the six rounds the audit at `apps/nerve/RETHINK-AUDIT.md` defined. All six PRs:

- R1 — visual rethink (PR #109, merged)
- R2 — lead 360° (PR #110, merged)
- R3 — ask-the-business chat (PR #111, merged)
- R4 — business facts (PR #112, merged)
- R5 — external RAG API (PR #113, merged)
- R6 — visual-QA surface (this PR, in review)

After this merges, the audit doc is the historical record. Future NERVE work should land in `NERVE-ROADMAP.md` (or a new audit doc if a similar wholesale rethink is needed) rather than reopening this one.
