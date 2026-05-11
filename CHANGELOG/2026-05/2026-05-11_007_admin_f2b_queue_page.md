# F2(b) — Admin queue page (read-only view)

## What changed
- `apps/admin-panel/src/lib/nerve-read.ts` — new HMAC GET helper.
  Mirrors `~/.claude/scripts/nerve/get-ingest.sh` canonical-query
  signing in TypeScript. Returns a normalised `{ ok, status, data,
  error }` envelope so callers don't have to disambiguate between
  thrown errors and non-2xx responses.
- `apps/admin-panel/src/app/api/leads/queue/route.ts` — new GET route.
  Server-side proxy that calls NERVE's
  `/api/read/pending-assignments` (the F2(a) endpoint shipped earlier
  today) using the HMAC secret from admin-panel env, returns the
  payload to the browser unmodified. Auth: existing admin session
  cookie via `resolveAdminFromRequest`.
- `apps/admin-panel/src/app/leads/queue/page.tsx` — new
  `/leads/queue` page. Client component, fetches from the local API
  proxy, renders the pending-assignments list as cards (brand swatch,
  business name, vertical, postcode, IG + Google rating, QA score
  badge, pitch angle, demo size + photo count + aesthetic positioning
  footer). Vertical filter tabs auto-derived from the response.
  Refresh button. "Assign" action is a disabled placeholder labelled
  "F2(c) next".
- `apps/admin-panel/src/components/Sidebar.tsx` — adds a "Queue" nav
  entry above "Leads". Active-state matcher rewritten to pick the
  longest matching href so `/leads/queue` doesn't double-highlight
  with `/leads`.
- `apps/admin-panel/.env.example` — new file (didn't exist). Documents
  `NERVE_BASE_URL` + `OUTCOME_INGEST_SECRET` for the F2(b) wire-up
  plus the pre-existing `ADMIN_SECRET` + `DATABASE_PATH`.

## Why
Second piece of F2. (a) shipped earlier today as the NERVE read
endpoint; (b) now consumes it from the admin operator's surface. The
operator can see what's pending without typing curl commands. The
assign action itself (F2(c)/(d)) is the next PR — this one validates
the read path end-to-end against prod data so the next step has a
working visible queue to attach an action to.

Day-1 leverage today: the admin operator can browse the queue,
inspect the QA score + pitch angle for each pending lead, and
visually confirm which leads need attention. The "Assign" placeholder
makes the F2(c) ask concrete (it has a button, the button needs a
backend). Without this PR, F2(c) would ship a backend that nobody
could trigger.

## Stack
- Next.js 14 (admin-panel app, port 4400)
- Tailwind with the admin-panel's existing density tokens (text-[11px]
  to text-[15px], slate-50→slate-950 colour ramp)
- `lucide-react` icons (Inbox, Star, Camera, ImageIcon,
  AlertCircle, RefreshCw) — already in deps
- No new external dependencies. HMAC helper uses `node:crypto`.
- Auth re-uses existing admin session cookie pattern.

## Integrations
- New env vars in admin-panel: `NERVE_BASE_URL` (defaults to
  `https://nerve.salespatch.co.uk` if unset) and
  `OUTCOME_INGEST_SECRET` (same secret value as NERVE's HMAC).
  In production Vercel, the existing nerve project's
  `OUTCOME_INGEST_SECRET` env var needs to be copied to the
  admin-panel project. Documented in `.env.example`.
- Calls NERVE's `/api/read/pending-assignments` endpoint shipped in
  PR #72.

## How to verify
1. `cd apps/admin-panel && npx tsc --noEmit` clean (verified locally
   ✅ — admin-panel doesn't ship a typecheck script today; ran tsc
   directly).
2. After Vercel deploys the admin-panel preview, log in and visit
   `/leads/queue`. Expected today: 3 cards (JP Nail with QA 100,
   pitch angle, brand swatch `#0E0E0E`; two Verify Test Cafe stubs
   from May 10 simulate-ingest.sh runs).
3. Vertical filter tabs auto-populate (`grooming`, `hospitality`).
   Clicking each filters the list client-side via a refetch.
4. Refresh button re-queries the proxy and updates the "queried Xm
   ago" stamp in the header subtitle.
5. The disabled "Assign" button is present on every card; clicking
   does nothing (cursor-not-allowed). Title attr explains it's an
   F2(c) hook.

## Known issues
- The disabled Assign placeholder is intentional. F2(c) lands the
  import handler and the SP-picker dropdown that actually wires the
  button. Until then the queue is read-only — operator can SEE
  what's pending, can't act on it yet.
- The two Verify Test Cafe stubs (from May 10 simulate-ingest.sh)
  surface in the queue today because they have demo_artefacts but
  no lead_assignment_events. They'll keep surfacing until either
  (a) the F1 backfill runs in prod (which would dedup them onto a
  single canonical BusinessIdentity row), (b) the demo_artefact rows
  are explicitly cleaned up, or (c) F2(c) lets you reject them in
  bulk. Acceptable for now — flagged in the card UI with an "slug
  only" amber badge so the operator can tell them apart from the
  real JP Nail lead.
- The `NERVE_BASE_URL` + `OUTCOME_INGEST_SECRET` env vars need to be
  set in Vercel's admin-panel project before the queue will work in
  prod. The deploy will succeed without them but `/leads/queue` will
  show the 503 error banner ("OUTCOME_INGEST_SECRET not configured").
