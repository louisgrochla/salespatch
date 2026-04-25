# Public site — full design handoff wired in

## What changed
- Copied the full Claude Design handoff (`/tmp/sd-handoff → apps/sales-dashboard/public/site/`) — 25 HTML pages + `shared/brand.css` + `shared/shell.js`, served directly as static files.
- Patched `public/site/shared/shell.js` so the brand-mark "home" link points to `/` (the React landing) rather than the static `home.html`.
- Updated `apps/sales-dashboard/src/middleware.ts` — added `/site` to `PUBLIC_PATHS` so the auth middleware doesn't redirect static design pages to `/login`.
- Updated nav/footer/CTA links in `apps/sales-dashboard/src/app/page.tsx` to target `/site/*.html` so the React landing connects to the static pages.

## Why
The handoff bundle includes 25 pages (product, pricing, blog, apply, login, company, help, careers, contact, security, status, changelog, case-studies, guides, guide, blog-post, coming-soon, 404, 5× legal, contractors). User asked for the entire web view to be live. Porting each to React is overkill for marketing content; serving the prototype HTML verbatim preserves the design pixel-for-pixel and keeps the React port only where interactivity matters (landing).

## Stack
Next.js 14.2 static `public/` asset serving; unchanged brand CSS; shared shell.js for nav/footer injection.

## Integrations
None.

## How to verify
1. `cd apps/sales-dashboard && npm run dev`
2. Open http://localhost:4300/ — React landing.
3. Click any nav/footer link — lands on the matching `/site/*.html` (e.g. `/site/product.html`, `/site/pricing.html`, `/site/apply.html`).
4. Clicking the SalesFlow brand-mark on any static page returns to `/`.
5. All 23 side pages return 200 (pricing, blog, company, apply, login, contractors, help, careers, contact, 5× legal, 404, case-studies, changelog, security, status, guides, guide, blog-post, coming-soon).

## Known issues
- Static design pages are not wired to real auth — `/site/login.html` is the design mockup, not the functional `/login` route. When ready to go live, swap CTA targets.
- Old `src/components/landing/*` marketing components remain orphaned and can be deleted.
- `SalesFlow Dashboard.html` (authenticated dashboard design) not yet applied to the real dashboard — that's a separate implementation task.
