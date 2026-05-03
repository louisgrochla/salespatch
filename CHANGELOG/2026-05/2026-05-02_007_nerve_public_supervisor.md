# NERVE — Public research dashboard + supervisor view

**Date:** 2026-05-02
**Branch:** `claude/nice-kare-edfa44`

## What changed

Two new audiences for NERVE alongside the existing founder layer:
- **Public** at `/research` — anonymous, aggregates-only research dashboard suitable for examiners, prospective contractors, anyone curious.
- **Supervisor** at `/supervisor` — separately-credentialed read-only view with one writable affordance (feedback per dissertation section).

### Structural rename: founder `/research/*` → `/dissertation/*`
Public `/research` is now the public dashboard. The founder's dissertation vault moved to `/dissertation/*` (more accurate name for what it actually is). Affected:
- `src/app/(app)/research` → `src/app/(app)/dissertation` (whole subtree)
- `src/app/api/research` → `src/app/api/dissertation`
- Inner `dissertation/dissertation` (meta editor) → `dissertation/meta`
- All `Link` / `redirect` / `revalidatePath` strings sed-replaced
- Sidebar, dashboard quick-entry, ResearchSubNav updated
- Cross-references in `lib/source-resolver.ts` and `lib/evidence.ts` updated

### Public dashboard — `/research`
- `src/app/research/{layout,page,_components/AutoRefresh}.tsx` — sits OUTSIDE the `(app)` group so no auth gate
- `src/lib/public-metrics.ts` — aggregates-only computations: total/per-phase pitch counts, close rates, last-pitch-ago (timestamp only, no business name), data sufficiency vs methodology threshold, dissertation section status (no content), submission countdown
- Layout is sparse and readable — no founder sidebar, more whitespace, mobile friendly
- Auto-refreshes every 30s via `router.refresh()` (preserves scroll, cheap network round-trip)
- Footer states the anonymisation guarantee, links to salespatch.co.uk
- `src/app/api/public/metrics/route.ts` — JSON endpoint serving the same aggregates with `Cache-Control: no-store` and `Access-Control-Allow-Origin: *`
- `src/lib/rate-limit.ts` — best-effort in-process token bucket (60/min/IP). Documented limitation: real protection at scale needs Upstash Redis or similar; in-memory is per-Vercel-instance.

### Supervisor view — `/supervisor`
- `src/app/supervisor/login/page.tsx` — separate login form posting to the new `supervisor` credentials provider
- `src/app/supervisor/(panel)/layout.tsx` — distinct layout with the spec-required banner: "Supervisor View · Read Only · NERVE — Robert Gordon University Dissertation Access"; sign-out link redirects back to `/supervisor/login`
- `_components/SubNav.tsx` — overview / pitches / dissertation sections / literature / methodology / evidence / meetings
- `(panel)/page.tsx` — research overview: working title, RQ, academic framing, degree + institution, full phase-boundary table, working-title and research-question version histories
- `(panel)/pitches/page.tsx` — anonymised pitch records:
  - business name removed
  - contractor IDs replaced with stable hashed token via `lib/anonymise.ts` (FNV-1a → `sp-<base36>`)
  - notes field hidden
  - all aggregates visible (close rate, phase summary, sufficiency-vs-50 bar, objection frequency)
  - filterable by phase / outcome / sector / date range
- `(panel)/sections/page.tsx` and `[id]/page.tsx` — read-only chapter view with rendered markdown + linked literature + supervisor-feedback textarea (the only writable input; saves via `setSectionFeedback` server action which writes back to `DissertationSection.supervisorFeedback` and bumps revalidatePath on both supervisor and founder routes)
- `(panel)/literature/page.tsx` — read-only literature library with theme tags, position pills, abstracts, expandable researcher notes, DOI/URL links
- `(panel)/methodology/page.tsx` — phase boundaries + full methodology document text per phase
- `(panel)/evidence/page.tsx` — evidence log entries; PitchLog source titles are stripped (shown only as anonymised hint), other source types fully visible
- `(panel)/meetings/page.tsx` — read-only supervision meeting log
- `src/app/api/supervisor/pitches-export/route.ts` — anonymised CSV export, role-checked, never includes business names / contractor IDs / notes / deal values

### Auth refactor
- `src/lib/auth.ts` — two credentials providers (`founder`, `supervisor`); JWT carries `role`; session exposes `user.role: AppRole`
- `src/types/next-auth.d.ts` — `Session` and `JWT` augmented with role
- `src/lib/auth-guard.ts` — `requireSession({ role })` redirects to the correct login on cross-role access
- `middleware.ts` — single role-aware function using explicit `getToken` from `next-auth/jwt`. Public routes excluded via matcher. Founder zone redirects unknown roles to `/login`; supervisor zone redirects everyone-except-supervisor to `/supervisor/login`.
- `(app)/layout.tsx` — defence-in-depth: checks role at the layout level too. A supervisor who somehow bypasses middleware still hits this gate.

### Bug surfaced and fixed during verification
First middleware iteration used `withAuth(...)` with `req.nextauth.token`. In testing, a supervisor session reached `/sales` with status 200. Switched to explicit `getToken({ req, secret })` plus the layout-level fallback. Verified: supervisor session → `/sales` now returns opaqueredirect (307 to `/login`).

### Env
- `SUPERVISOR_EMAIL`, `SUPERVISOR_PASSWORD` — optional; leave blank to disable `/supervisor` entirely
- `NEXT_PUBLIC_RESEARCH_URL` — used in metadata + share links

## Why

Per the spec: dissertation supervision needs verifiable access to the live primary data without granting business-strategic visibility. The public dashboard is evidence to examiners that the data set is real and continuously updated — that the methodology isn't being retrofitted around already-collected data.

## How to verify

Dev server still running on `http://localhost:4400`.

1. **Anonymous user**: `/research` returns 200 with the public dashboard, no sidebar. `/sales`, `/dissertation`, `/financial`, `/ask` all redirect to `/login`.
2. **Supervisor session**: log in at `/supervisor/login` (creds in `.env.local`). `/supervisor` shows the read-only overview. `/supervisor/sections/<id>` lets you write feedback on a chapter. Try `/sales` → opaque redirect to `/login`.
3. **Founder session**: behaves exactly as before. Try `/supervisor` → opaque redirect to `/supervisor/login`.
4. **Public API**: `curl http://localhost:4400/api/public/metrics` returns JSON aggregates with `Cache-Control: no-store`. Hit it 65 times in under a minute → 429 with `Retry-After: 60`.

## Known issues / out of scope

- Rate limiter is in-memory per process; Vercel multi-instance behaviour means effective ceiling = 60 × instances. Real protection requires Upstash Redis or `@upstash/ratelimit`. Documented in the lib comment.
- Public `/research` does NOT show contractor counts or qualitative narrative — the spec was strict about anonymisation, so even high-level "how many contractors are active" is omitted because three contractors in a small city can be re-identified by anyone who knows the founder.
- Supervisor pitch export is the only writable surface beyond section feedback — no comments on individual pitches, no questionnaire response area. Add later if requested.
- The founder's `/dashboard` "Save literature source" quick-action now points to `/dissertation/literature/new` (correct after rename).
- `/dissertation/supervisor` is the founder's view of supervisor MEETINGS log; the new `/supervisor` is the supervisor's actual login surface. Different namespaces, no collision.
- One-time data implication: rename re-points links and revalidations but doesn't migrate any data — all dissertation rows are unaffected.
