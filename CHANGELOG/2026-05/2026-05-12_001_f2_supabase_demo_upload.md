# F2 fix — import handler uploads demo HTML to Supabase Storage

## What changed
- `apps/sales-dashboard/src/app/api/admin/import-from-nerve/route.ts` —
  before the `lead_assignments` insert, the import handler now uploads
  `bundle.demo_artefact.html_inline` to Supabase Storage at
  `demo-sites/<slug>.html` via the service-role client. The same bucket
  and path convention that `/api/admin/demo-upload` already uses for
  manual uploads. `notes.demo_site_domain` is then set to the **bare
  slug** — identical to what the manual flow stores.
- `DemoArtefact` interface now includes the `html_inline: string` field
  that the NERVE bundle endpoint has been returning all along (was
  missing from the type but used at runtime nowhere — fixing for the
  upload).
- Dropped the `NERVE_PUBLIC_BASE_URL` constant and the `buildDemoUrl()`
  helper. Both existed only to construct the (wrong) NERVE-public-route
  URL that PR #74 + #75 wrote into `notes.demo_site_domain`. No callers
  remain.
- `~/.claude/commands/lead-json.md` skill (user-level) — `demo_site_domain`
  rule rewritten to specify the bare slug as the correct value, with
  explicit warning against fabricated subdomains and the NERVE public
  URL.

## Why
The F2 path shipped in PR #74 / #75 invented its own demo-hosting story
(NERVE public route at `nerve.salespatch.co.uk/api/public/demo/<slug>`)
without going through the existing convention. That broke the
`/preview/<leadId>` customer-facing wrapper at
`apps/sales-dashboard/src/app/preview/[leadId]/page.tsx`: that page
expects `notes.demo_site_domain` to be a slug or a Supabase Storage URL
which it resolves through `resolveDemoUrl()` → `/api/demo-site/<slug>`
proxy → Supabase Storage. The NERVE URL bypassed all of that.

The visible symptom: when The Cult of Coffee was assigned to the SP
last night and they opened the lead in the iOS app, the WebView loaded
the (separately fabricated) `the-cult-of-coffee.salespatch.co.uk`
placeholder — Vercel's password-protection screen for an unknown
subdomain. PR #77's precedence flip would have shown the NERVE URL
instead, which also iframes wrong from a cross-origin perspective and
loses the payment overlay built into `/preview/<leadId>`.

The correct design (now implemented):

1. F2 import handler fetches the bundle from NERVE.
2. Uploads `html_inline` to Supabase Storage at `demo-sites/<slug>.html`.
3. Writes the bare slug into `notes.demo_site_domain`.
4. `/preview/<lead_assignment_id>` reads the slug → proxies through
   `/api/demo-site/<slug>` → serves from Supabase Storage in an iframe
   with the Stripe Checkout CTA overlay. Same code path as manually
   uploaded demos.
5. iOS WebView reads the same slug (expanded by `expandDemoUrl` to the
   proxy URL) and loads it. Same code path as manually uploaded demos.

PR #77 was closed unmerged once this design became clear — it was
solving the wrong problem.

## Stack
- Next.js 14 server action.
- `@supabase/supabase-js` storage client (`createBucket`, `upload`) via
  the service-role key. Same client `/api/admin/demo-upload` uses.
- No new dependencies. No schema change. The bucket creation is
  idempotent (`createBucket` returns an error if the bucket exists,
  caught silently — matching the existing demo-upload pattern).

## Integrations
- Supabase Storage `demo-sites/` bucket — already in use for
  manually-uploaded demos.
- `/api/demo-site/<slug>` proxy — already serves demos from this
  bucket with the content-type rewrite.
- `/preview/<leadAssignmentId>` page — already resolves
  `notes.demo_site_domain` slugs through the proxy.
- iOS `ClientPresentationView` — already calls `expandDemoUrl` server-
  side which resolves slugs through the same proxy.

## How to verify
1. `cd apps/sales-dashboard && npx tsc --noEmit` — clean (one
   pre-existing `resend` not-found in `src/lib/email.ts`, unrelated).
2. `npx next build` — clean ✓ (route shows as `/api/admin/import-from-nerve`
   in the build output).
3. After Vercel deploy:
   - Run a fresh lead through `/lead-hunter` → `/new-lead` →
     `/spec-site-brief` → `/build-demo` → `/lead-json` (the updated
     skill now writes the bare slug into pitch_brief).
   - Open `salespatch.co.uk/admin/queue`, pick an SP, click Assign.
   - The import handler uploads the HTML to Supabase Storage and stamps
     `notes.demo_site_domain = "<slug>"`.
   - Open the lead on the SP's phone → demo renders in client-
     presentation mode with no auth wall.
   - Generate the QR / share URL → customer page at
     `salespatch.co.uk/preview/<assignment_id>` shows the demo iframe
     plus the Stripe Checkout CTA bar.

## Known issues
- The Cult of Coffee assignment that already exists in Supabase has
  `demo_site_domain = "the-cult-of-coffee.salespatch.co.uk"` (bad
  placeholder). The cleanup is a one-off:
  1. Upload its existing `outputs/demo.html` to Supabase Storage at
     `demo-sites/the-cult-of-coffee.html` (e.g. via the admin UI's
     manual demo-upload flow, drag-and-drop).
  2. Run this SQL in the Supabase dashboard:
     ```sql
     UPDATE lead_assignments
     SET notes = jsonb_set(notes::jsonb, '{demo_site_domain}',
       '"the-cult-of-coffee"')::text
     WHERE lead_id = 'the-cult-of-coffee';
     ```
  3. Force-quit and reopen the SP app — demo renders.
- The Supabase upload happens BEFORE the assignment insert. If the
  upload succeeds and the insert fails, the next import attempt
  succeeds because `upsert: true` overwrites and the assignment dedup
  check rejects on the second pass. Acceptable failure mode.
