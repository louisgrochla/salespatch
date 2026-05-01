# Live domain-availability check on the onboarding domain step

**What changed**
- `apps/sales-dashboard/src/app/api/domain-availability/route.ts` — new public GET endpoint. Query string `?domain=example.co.uk` returns `{ domain, available: boolean | null, checked: boolean, reason? }`. Backed by free RDAP via the `rdap.org` public bootstrap gateway, which routes to the right registry per TLD (Nominet for `.uk`, Verisign for `.com`/`.net`, PIR for `.org`, etc.). 5-minute in-memory cache keyed by domain so a typing burst stays warm. 4.5s timeout. Status semantics: HTTP 200 → registered → not available; HTTP 404 → unregistered → available; anything else → `checked: false` (we never lie about availability).
- `apps/sales-dashboard/src/middleware.ts` — added `/api/domain-availability` to PUBLIC_PATHS.
- `apps/sales-dashboard/src/app/onboarding/[leadId]/OnboardingClient.tsx` — added the `useDomainAvailability` hook and an `AvailabilityBadge` component. Wired into `DomainPicker`:
  - Each of the three auto-suggestions now shows a live badge (`● Available` green pill / `● Taken` red pill / pulsing dot while checking). Taken suggestions are disabled (line-through, faded, no add button).
  - Each manual input fires a debounced (600ms) check once the value parses as a domain. Status pill renders inline at the right of the input. Input switches to monospace once it looks like a domain so the customer reads it as a URL.

**Why**
The customer would otherwise pick a name we couldn't actually buy them. Catching that *before* they commit avoids us going dark for 24 hours and coming back with "sorry, taken — try this instead."

**Stack**
Next.js 14 route handler with `force-dynamic` + a Map-based memory cache. Public RDAP via `rdap.org`. Client hook + small badge component. No new deps.

**Integrations**
- `rdap.org` — free public RDAP bootstrap gateway. Auto-routes to the registry RDAP server. No API key.
- Falls back gracefully (`checked: false`) if the registry is slow / unreachable, so the customer can still proceed with whatever they typed.

**How to verify**
1. `npm --prefix apps/sales-dashboard run dev`
2. `GET http://localhost:4300/api/domain-availability?domain=google.com` → `{ available: false, checked: true }`
3. Same with a fake `xyz12345abc.co.uk` → `{ available: true, checked: true }`
4. Visit `/onboarding/<id>` → step 4 → tap "Buy one for me". Three suggestions resolve to `● Available` (or `● Taken` for already-registered ones).
5. Type `google.com` into a manual input → after ~600ms debounce, badge shows `● Taken` and the value renders in monospace.
6. Type a fake/random `.co.uk` → badge shows `● Available`.

**Known issues**
- In-memory cache means each Vercel serverless instance has its own cache; cold starts pay the RDAP round-trip again.
- No client-side cache yet — typing the same domain across two of the three manual inputs triggers two requests (server-side cache absorbs it). Acceptable.
- Some less-common TLDs may not be in `rdap.org`'s bootstrap; we'll return `checked: false` and the customer just sees no badge. Beta scope is `.co.uk` and `.com`, both well-supported.
- We don't enforce that the customer only picks Available domains — they can still type a Taken one and proceed (badge is informational). The fulfilment ops step will catch anything we genuinely can't buy. Worth re-evaluating before scale.
- Rate limiting is via the registry, not us. If we ever start checking many domains per session we should add an upstream limiter.
