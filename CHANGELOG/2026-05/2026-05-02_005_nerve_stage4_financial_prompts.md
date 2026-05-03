# NERVE — Stage 4: Financial Tracker + Prompt Library

**Date:** 2026-05-02
**Branch:** `claude/nice-kare-edfa44`

## What changed

### Financial Tracker — `/financial`
- `_components/SubNav.tsx` — overview / revenue / costs / analytics tabs
- `lib/finance.ts` — `financeByPhase`, `monthlyTrend`, `sustainability` (recent vs prior 3-month average net classifier: sustainable / trending / unsustainable / insufficient)
- `revenue/{actions,_form,page,new/page,[id]/page}.tsx` — full CRUD, embeds on save
- `costs/{actions,_form,page,new/page,[id]/page}.tsx` — full CRUD with category dropdown (infrastructure / compute / tools / misc) and per-category total tiles that double as filters
- `page.tsx` — overview dashboard: revenue/cost/net/CAC/sustainability tiles, phase breakdown table with per-phase ROI, 12-month trend (paired revenue + cost bars per month), recent activity timeline merging both kinds
- `analytics/page.tsx` — sustainability verdict with rationale, ROI per phase with revenue/cost trajectory bar, cumulative net contribution chart
- `api/financial/{revenue,costs}/export/route.ts` — CSV + JSON exports

### Product & System — `/product`
- `_components/SubNav.tsx` — overview / prompt library / architecture / changelog / infrastructure / pipelines / models. The last 5 are greyed out as "Stage 6" so the visual scaffold is in place but only the working sections are clickable.
- `page.tsx` — section overview with stat tiles + a "stage 6 preview" list

### Prompt Library — `/product/prompts`
- `actions.ts` — create/update/delete server actions
  - **Update only bumps `versionNumber` and inserts a `PromptVersion` when the prompt body OR model changes.** Performance notes are mutable on the current version without a version bump (they describe live behaviour of THIS version).
  - Delete cascades `PromptVersion` rows (FK) and clears polymorphic embeddings.
- `_form.tsx` — name (disabled on edit, since rename would invalidate references), model, tags, full text, performance notes
- `page.tsx` — list with name, model, current version, total history count, tags, updated
- `new/page.tsx` — initial save creates v1
- `[id]/page.tsx` — detail page with prompt body, performance notes, tags, and a right-side **version history** sidebar. Click any prior version (`?v=N`) to view its body and notes; "return to current" link surfaces when viewing history.
- `api/product/prompts/export/route.ts` — JSON nests versions under each prompt; CSV emits one row per version with `isCurrent` flag

## Why

Per the staged plan: financial tracking is needed before the dissertation can credibly evaluate "sustainable distributed income" — the spec explicitly calls out CAC, ROI, sustainability indicators. The prompt library is the auditable backbone for the SL-MAS pipeline — every iteration becomes evidence in the methodology + findings chapters about how prompt design influenced conversion.

## Stack

No new dependencies. Server actions for mutations (consistent with Stages 2 + 3). `lib/finance.ts` keeps the calculations server-side and reusable across dashboard + analytics pages.

## How to verify

Dev server still running on `http://localhost:4400`. Sign in.

1. **Financial dashboard** at `/financial`: 3 sample revenue + 7 sample costs seeded; Phase 1 row shows £1,050 / £98.39 / £951.61 net / 967% margin. Sustainability "insufficient data" (only 1 month).
2. **Revenue list** at `/financial/revenue`: 3 entries; click one → detail page → edit → save returns to detail with new value.
3. **Costs list** at `/financial/costs`: per-category tiles (infrastructure / compute / tools / misc) double as filters — clicking "tools" narrows the list.
4. **Cost detail edit + delete**: same pattern as revenue.
5. **Analytics** at `/financial/analytics`: sustainability verdict card, ROI table, cumulative-net bar chart over 12 months.
6. **Exports**: `/api/financial/revenue/export?format=csv` and `/api/financial/costs/export?format=json` both download.
7. **Product overview** at `/product`: shows 3 prompts / 3 versions stat, "Stage 6" placeholders.
8. **Prompt library** at `/product/prompts`: 3 prompts seeded; `demo-website-hero-copy` has v3 with 3 versions in history.
9. **Prompt detail** at `/product/prompts/<id>`: prompt body, performance notes, tags, version sidebar.
10. **Version time-travel**: click v1 in the sidebar → body and notes change; "return to current" appears.
11. **Edit prompt body** → versionNumber bumps to next; new history row appears. Edit performance notes only → notes update on the CURRENT version, no new history row.

## Known issues / out of scope

- Prompt names are disabled on the edit form. If you need to rename, do it via direct DB or schema update — adding a rename UI is a Stage 5+ concern.
- The 12-month trend chart is a CSS bar viz — fine at this density, would benefit from a real chart lib if data gets richer.
- Sustainability verdict needs ≥6 months of activity to be useful. With one month seeded, it correctly returns "insufficient data."
- CAC overall shows "—" because the prior data-loss event wiped the closed pitches; once you've logged real pitches via `/sales/new` (or the iOS webhook), the calculation lights up.
- No diff-between-versions UI on prompts — just side-by-side viewing. Diff'ing is mechanically possible but the founder usually wants "what does v3 look like vs v1," which is one click each. Add diff if it becomes painful.
