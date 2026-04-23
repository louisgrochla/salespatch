# Landing page — Claude Design handoff

## What changed
- Rewrote `apps/sales-dashboard/src/app/page.tsx` as a client component that mirrors the Claude Design `site/home.html` mock (hero with live demo carousel, metrics ribbon, four-step timeline, earnings calculator, "every side" grid, final CTA, footer).
- Added `apps/sales-dashboard/src/app/landing-brand.css` — scoped (`.sf-landing` root) port of `shared/brand.css` so landing styles don't leak into the authenticated app shell.
- Updated `apps/sales-dashboard/src/app/layout.tsx` to load Inter Tight (body) via `next/font/google` and Geist (display) via Google Fonts `<link>` (Geist isn't in `next/font/google` on Next 14.2).

## Why
User triggered a handoff from Claude Design with a SalesFlow-branded landing redesign for the public pages. The existing landing was the generic "OpenClaw infrastructure" marketing template.

## Stack
Next.js 14.2 (App Router), React 18 client component, CSS (no Tailwind in new page), Google Fonts (Geist, Inter Tight, JetBrains Mono).

## Integrations
None — pure frontend.

## How to verify
1. `cd apps/sales-dashboard && npm install && npm run dev`
2. Open http://localhost:4300/
3. Verify: live demo card cycles through 5 mock businesses; hero count ticks up every ~4s; four-step timeline auto-advances every 4.2s with hover to pin; earnings calculator updates on drag.

## Known issues
- The old `components/landing/*` marketing components are still on disk but unused by the landing page. Safe to delete in a follow-up.
- Only `home.html` was implemented; the other design files (product, pricing, blog, apply, etc.) remain unimplemented.
