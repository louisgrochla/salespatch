# F2 — Port queue + import-from-NERVE to sales-dashboard (the deployed admin)

## What changed
- `apps/sales-dashboard/src/lib/nerve-read.ts` — new HMAC GET helper
  (same canonical-query-string signing as `nerve-ingest.ts` and
  `~/.claude/scripts/nerve/get-ingest.sh`). Reuses
  `OUTCOME_INGEST_SECRET` which is already set in the sales-dashboard
  Vercel project for the B1 producer.
- `apps/sales-dashboard/src/app/api/admin/queue/route.ts` — proxy
  endpoint. Auth via the existing `admin_token` cookie /
  `validateAdminToken`. Re-signs and forwards to NERVE's
  `/api/read/pending-assignments`.
- `apps/sales-dashboard/src/app/api/admin/import-from-nerve/route.ts`
  — POST `{ slug, user_id }`. Dual-mode (Supabase prod / SQLite dev)
  matching the existing `/api/admin/leads` POST handler. Validates
  the salesperson exists + is active, rejects duplicates on slug,
  fetches the bundle from NERVE via `nerveGet`, maps to `notes` JSON
  in the same shape as the manual `/api/admin/leads` POST handler so
  iOS + sales-dashboard render the lead identically regardless of
  source. Uses the canonical slug as `lead_id` so existing B1
  producer status events trace back to the demo on the same key.
  `demo_site_domain` points at NERVE's public demo route
  (`/api/public/demo/<slug>` — already deployed in PR #74).
- `apps/sales-dashboard/src/app/admin/queue/page.tsx` — brand-themed
  queue page. Uses the existing CREAM/INK/SIGNAL palette + Card /
  PageHero / Chip / EmptyState / PrimaryButton primitives from
  `src/lib/brand.tsx`. SP picker dropdown on every card (active
  contractors only). Click Assign → POST → success Card with "Open
  demo →" link → queue + team refresh. Per-card error inline.
- `apps/sales-dashboard/src/app/admin/layout.tsx` — adds "Queue" to
  the admin NAV (between "Overview" and "Users").

## Why
F2(b) shipped under `apps/admin-panel/src/app/leads/queue/page.tsx`
in PR #73 and F2(c)+(d) added the import handler + SP picker there
in PR #74. Both PRs went into the WRONG Next.js app — `apps/admin-panel`
is not deployed in prod. The actual deployed admin surface is
`apps/sales-dashboard/src/app/admin/*` at `salespatch.co.uk/admin/`
(password auth via `/api/admin/auth`, Supabase mode in prod, cream-on-ink
brand theme, NAV: Overview / Users / Leads / Demo uploads).

This PR ports the queue page + import handler into sales-dashboard so
the operator pipeline (`/build-demo` in Claude Code → click Assign in
admin → SP sees the lead) is actually reachable. The NERVE side
(`/api/read/lead-bundle`, `/api/public/demo/<slug>`) shipped via
PR #74 and is unchanged — verified live against prod:
- `https://nerve.salespatch.co.uk/api/public/demo/jp-nail` returns
  2.87 MB of demo HTML
- HMAC GET `/api/read/lead-bundle?slug=jp-nail` returns the full
  bundle (site_brief + demo_artefact + brand_analysis + lead_profile
  + qa_result; pitch_brief + business_identity null today)

## Stack
- Next.js 14 App Router routes + pages in sales-dashboard.
- Dual-mode DB layer (`isSupabaseMode()` from `@/lib/auth-db`) so the
  same route handler works on Vercel (Supabase) and local dev (SQLite).
- Existing admin auth (`validateAdminToken` cookie pattern).
- Brand primitives from `@/lib/brand` (CREAM, INK, SIGNAL, AMBER,
  Card, PageHero, Chip, EmptyState, PrimaryButton, GhostButton).
- No new external dependencies.

## Integrations
- NERVE `/api/read/pending-assignments` + `/api/read/lead-bundle` —
  HMAC GET via `OUTCOME_INGEST_SECRET` already set in the
  sales-dashboard Vercel project for B1.
- Supabase `lead_assignments` table in prod, local SQLite
  `mission-control.db` in dev. Same `notes` JSON shape, `contact_name`
  and `contact_role` columns mirrored from `pitch_brief` if present.
- NERVE `/api/public/demo/<slug>` — referenced from the imported
  notes' `demo_site_domain` field; sales-dashboard + iOS treat it
  like any external demo URL.

## How to verify
1. `cd apps/sales-dashboard && npx tsc --noEmit` — clean (one
   pre-existing `resend` module not-found in `src/lib/email.ts`,
   unrelated; install via `npm install` to fix locally — Vercel
   prod always installs fresh).
2. `cd apps/sales-dashboard && npx next build` — clean ✓. New
   routes show in build output:
   - `○ /admin/queue` (4.7 KB)
   - `ƒ /api/admin/queue`
   - `ƒ /api/admin/import-from-nerve`
3. After Vercel deploy:
   - Open `https://salespatch.co.uk/admin/queue` (after logging in
     with the admin password).
   - Expected: JP Nail card with brand swatch, QA 100 badge, pitch
     angle text, demo metadata footer, SP dropdown (all active
     contractors), Assign button.
   - Pick a contractor, click Assign. Expected: success Card with
     "Open demo →" link pointing at
     `https://nerve.salespatch.co.uk/api/public/demo/jp-nail`, JP Nail
     disappears from queue, lead appears in `/admin/leads` for that
     contractor.
   - Hit the same card a second time → 409 "Lead already assigned".

## Known issues
- The `apps/admin-panel` files (queue page + import handler from
  PR #73/#74) remain in the repo. They're harmless — `admin-panel`
  is a separate Next.js app that's not currently deployed, so the
  files only execute when the operator runs `npm run dev` from
  that app on port 4400 for local development. They could be deleted
  if `admin-panel` is genuinely abandoned, but that's a separate
  decision.
- Pre-existing `src/lib/email.ts` import failure for `resend` only
  surfaces during local `next build` if `node_modules` is stale.
  `npm install` fixes; not related to F2.
