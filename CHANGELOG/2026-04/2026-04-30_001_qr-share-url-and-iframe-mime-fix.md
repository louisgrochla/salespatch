# iOS share/QR + preview iframe MIME fix

**What changed**
- `apps/ios/SalesFlow/SalesFlow/ClientPresentationView.swift` — share URL is now derived deterministically as `https://salespatch.co.uk/preview/<leadAssignmentId>`. Removed the `previewURL` state and the `createCheckout` blocking call from the share button. `createCheckout` is still fired as a detached background task so Stripe session pre-warm/eager attribution continues, but the share path no longer depends on it succeeding. Removed the now-unused `normalisedDomainURL` fallback. Public host is hard-coded to `salespatch.co.uk` regardless of build target — customers scan from their own phone, never localhost.
- `apps/sales-dashboard/src/app/preview/[leadId]/page.tsx` — `resolveDemoUrl` now detects Supabase Storage URLs (`https://<proj>.supabase.co/storage/v1/object/public/demo-sites/<slug>.html`) and rewrites them to route through the existing `/api/demo-site/<slug>` proxy. Without this, the iframe loaded the file directly from Supabase, which serves `.html` with `content-type: text/plain`, causing the browser to render the page source as raw text instead of HTML.

**Why**
The user scanned the QR on a real phone and saw two issues:
1. The QR encoded the raw Supabase Storage URL, not our preview page — so customers bypassed the payment CTA. Root cause: the simulator-side `createCheckout` call was failing silently (`try?`), and the fallback was the raw demo domain.
2. After the QR was fixed to point at salespatch.co.uk, the customer-facing demo iframe rendered as raw text — Supabase serves `text/plain` for HTML files in this bucket.

**Stack**
Swift / SwiftUI (iOS share path). Next.js 14 App Router server component (preview page). Supabase Storage (source-of-truth for demo HTML). Cloudflare in front of Supabase (returns the `text/plain` content-type that triggered the bug).

**Integrations**
- `/api/demo-site/[slug]/route.ts` — already existed; rewrites content-type to `text/html`. No changes; just routed more URLs through it.
- iOS `APIClient.createCheckout` — still called for eager Stripe session warming, but no longer on the share critical path.

**How to verify**
1. **iOS share URL** — Build SalesFlow → demo a lead → tap Show in Client Mode → tap Share. The QR text under the code should read `https://salespatch.co.uk/preview/<assignment-uuid>`.
2. **Iframe rendering** — Once deployed, scan the QR on a real phone (or just open the URL). Demo should render as a styled webpage with a sticky bottom bar reading "Go live now · £350 setup, then £25/mo →", not raw HTML markup.
3. **Local preview** — `npm --prefix apps/sales-dashboard run dev` (port 4300), open `http://localhost:4300/preview/<assignment-uuid>` on mobile viewport. iframe `src` should be `/api/demo-site/<slug>`, not the raw Supabase URL.

**Known issues**
- `vercel` deploy needed before the QR works for real customers — this branch only fixes the source.
- The proxy regex matches Supabase Storage URLs by host pattern (`*.supabase.co`). If a future demo is hosted elsewhere (e.g. salespatch's own Vercel-served HTML), the URL will be used as-is — which is fine as long as that origin serves `text/html`.
- The fire-and-forget `createCheckout` will still fail silently in the simulator (because `dashboardBaseURL` resolves to localhost which the user's lead row doesn't exist in). On device with the production dashboard, it succeeds. Either way, share works because the URL is deterministic.
- Onboarding form has a separate `’` JSX-text bug (literal `’` rendering instead of curly apostrophe) — not addressed here.
