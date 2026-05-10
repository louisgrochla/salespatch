# 2026-05-08 — NERVE Pipeline section (SL-MAS visualisation)

## What changed

**New files (apps/nerve)**
- `src/lib/runtime-api.ts` — typed fetch wrappers around the runtime's `/api/episodes/pivot`, `/api/episodes/recent`, `/api/strategies`, `/api/health` endpoints. Uses `unstable_cache` with 60s revalidate so each unique query hits the Pi at most once a minute regardless of pageviews. Includes a tolerant `safe()` wrapper that converts thrown errors into `{ data, error }` so pages render even when the runtime is offline.
- `src/components/PipelinePivot.tsx` — pivot table component (Tailwind, follows existing NERVE design tokens). Traffic-light cell colour on close rate (≥50% emerald, ≥25% amber, <25% rose).
- `src/components/PipelineStatus.tsx` — `RuntimeStatusBanner` that surfaces "runtime not configured" or "runtime unreachable" without crashing the page.
- `src/app/(app)/pipeline/page.tsx` — overview page. Stat tiles (overall close rate, revenue, pending pitches, design combos), pivot table, and a small URL-driven controls form (`?vertical=` and `?group_by=`).
- `src/app/(app)/pipeline/episodes/page.tsx` — recent episodes table (lead, vertical, outcome, £, composer score, retries, tags, started_at).
- `src/app/(app)/pipeline/strategies/page.tsx` — ranker output with Wilson 95% CIs and lifecycle status badges. Includes a small "honest read" panel explaining at solo-founder volumes most rows stay testing/new.

**Modified files**
- `src/components/Sidebar.tsx` — new "pipeline" nav group with three items: Pivot, Episodes, Strategies (icons: Workflow, GitBranch, Target).

## Why

The Mission Control inline-HTML dashboard was retirement-bound, not a long-term home for SL-MAS visualisation. NERVE is the founder-facing intranet at `nerve.salespatch.co.uk` and already has the right design language, auth shell, and nav pattern. Building these pages there:
- Matches existing NERVE pages (Sales, Operations, Financial, Demos) in style and layout.
- Doesn't depend on the Pi being in the request hot path — `unstable_cache` collapses pageviews onto at most one runtime fetch per minute per unique query.
- Survives runtime downtime gracefully (status banner + safe() wrapper).
- Lets a designed dashboard ship later without throwing this work away — the data layer (`runtime-api.ts`) is reusable.

The MC inline panels stay in place as a fallback until NERVE is wired in production. Phase 5's destructive sweep of MC remains parked.

## Stack
- Next.js 14 App Router, server components by default
- `unstable_cache` (60s TTL, tags `runtime`, `runtime:episodes`, `runtime:strategies` for future revalidate-on-write hooks)
- Tailwind, NERVE's existing design tokens (`text-fg`, `bg-bg-panel`, `border-border`, `h-section`, `font-mono`)
- Lucide icons (Workflow, GitBranch, Target)

## Configuration

NERVE's Vercel project needs:

```
RUNTIME_URL=https://<pi-tailnet>.ts.net:4317   # or PI_RUNTIME_URL — both supported
MISSION_CONTROL_API_TOKEN=<bearer>             # matches the runtime's MISSION_CONTROL_API_TOKEN
```

Without these the pages render with a "Runtime not configured" banner and empty states; nothing crashes.

## How to verify
1. Local NERVE dev (requires `node_modules` populated, Postgres + NextAuth):
   ```bash
   cd apps/nerve
   RUNTIME_URL=http://127.0.0.1:4319 MISSION_CONTROL_API_TOKEN=<token> npm run dev
   # Visit http://localhost:4400/pipeline
   ```
   You should see the bulk-smoke fixture data: 7 design combos, ~63% overall close rate, etc.
2. Production: deploy NERVE; `/pipeline`, `/pipeline/episodes`, `/pipeline/strategies` appear in the sidebar under a new "pipeline" group.

## Known issues / follow-ups
- **MC fallback panels are intentionally still live.** Once NERVE/pipeline is verified working in production, the MC panels can be reverted in a follow-up (small diff in `MissionControlServer.renderHtml()`).
- **NERVE's local `npx tsc --noEmit`** shows JSX errors due to missing `@types/react` in the local node_modules — pre-existing, same as `next/server`/`zod`/`@prisma/client` errors flagged in earlier phases. Vercel build resolves these.
- **No revalidate-on-write yet.** The runtime doesn't push cache-bust signals to NERVE on outcome ingest; we just wait for the 60s TTL to expire. Acceptable at solo-founder volumes; can layer `revalidateTag` calls later if real-time freshness becomes important.
- **A bespoke designed dashboard remains a TODO** (per founder direction: "designed exactly correctly and visually appealing eventually"). This commit is the functional baseline.
