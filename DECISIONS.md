# DECISIONS.md — Project Decision Log

Append-only log of non-obvious decisions, things tried and dropped, and gotchas
that future sessions need to know about. Sorted newest-first.

This file replaces "I remember we tried that in an old conversation thread."
If something was *tried and failed*, or if a design choice was made between
two reasonable alternatives, it belongs here.

---

## Format

Use this template for every entry:

```
## YYYY-MM-DD — <short-title>

**Context:** What was the task or problem.

**Tried:** What approach was attempted.

**Result:** Worked / failed / partially worked. Be specific about *how* it
failed — error message, behaviour, performance number.

**Decision:** What we're going with now and why.

**Watch out for:** Anything that future-you needs to know — the gotcha that
caused this, the constraint that made the obvious approach wrong, the place
where the symptom will reappear if violated.

**Related:** PR / commit SHA / file paths / changelog entry.
```

Keep entries terse. One screen each is plenty.

---

## 2026-05-10 — JSON-API validators must check both `undefined` AND `null`

**Context:** Wiring the spec-site-brief skill to POST briefs into NERVE for the first time (A2 producer side). Noose & Needle backfill had a genuine research gap on `google_rating`, sent it as `null`.

**Tried:** Validator pattern `if (p.field !== undefined && (typeof p.field !== "number" || ...))` for optional numeric fields, copied across A2 (site-brief, brand-analysis) and pre-existing in A4 (lead-profile).

**Result:** HTTP 400 `"google_rating must be number in [0,5]"` for any payload sending explicit JSON null. `null !== undefined` is true, then `typeof null === "object"` trips the type guard. Bug ships silently when you only ever test with concrete values, which is what the simulate-ingest.sh probes did before this surfaced.

**Decision:** Added small `isPresent<T>(v): v is T` helper to each route (`v !== undefined && v !== null`). Threaded through every optional-field check. Stores already use `?? null` so nothing else needed touching. Added an explicit-null lead-profile probe to scripts/nerve/simulate-ingest.sh as a regression guard.

**Watch out for:** Any new validator on optional fields. The TypeScript type `T | undefined` doesn't model the on-the-wire JSON, which can also be `null`. Use `isPresent<T>` or check both. Will reappear on every future Phase B/C ingest endpoint if not codified — consider lifting the helper into `src/lib/sl-mas/validation.ts` when there are more than ~3 callers.

**Related:** PR #44 (fix). Surfaced during the spec-site-brief NERVE wiring follow-up to PR #43. Files: `apps/nerve/src/app/api/ingest/{lead-profile,site-brief,brand-analysis}/route.ts`.

---

## 2026-05-10 — `vercel env pull` returns empty for "Sensitive" env vars

**Context:** Trying to programmatically run a cleanup `DELETE FROM ... WHERE lead_id LIKE 'verify-%'` against the prod NERVE Postgres after a series of simulate-ingest.sh sweeps left ~10 test rows.

**Tried:**
1. `psql "$DATABASE_URL" -f ...` from local — DATABASE_URL was empty in `apps/nerve/.env.local` (placeholder `""`).
2. `vercel env pull /tmp/.env.prod --environment=production --yes` to refresh — pulled the file, but `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET` etc all came back as empty `""`. Other vars (`OUTCOME_INGEST_SECRET`) came down with real values.
3. `vercel env ls production` — showed all vars as `Encrypted`, no distinction visible in the list output between Sensitive and regular Encrypted.

**Result:** Vercel marks DB credentials as "Sensitive" by convention (especially when added via the Postgres / Neon integration). Sensitive vars are runtime-only — never downloadable via CLI. There's no flag to override; this is intentional.

**Decision:** Use the Neon dashboard SQL editor for any prod DB operation that needs to happen from a local shell. Or build an HMAC-signed admin endpoint inside the NERVE app itself for repeat cases (not worth it for one-off cleanups).

**Watch out for:**
- `vercel env pull` *succeeds* when fetching Sensitive vars; it just writes empty strings. No error, no warning. You only notice when the downstream tool fails to connect.
- Any future "run a quick prod query" instinct will hit this. Build a Neon-shortcut bookmark instead of fighting the CLI.
- Vercel preview deployments also have Deployment Protection enabled; `vercel curl --deployment <url> /path` works for read-only probes and auto-generates a bypass token, but it doesn't passthrough curl flags like `-X POST`. For signed POSTs against a preview, easier to just merge to main and verify against prod (which has no protection).

**Related:** Noticed during the verify-row cleanup pass after closing out PRs #43, #44 today. The cleanup SQL bundle ended up at `/tmp/cleanup-verify-rows.sql` for manual paste into Neon.

---

## 2026-05-07 — Migrating workflow from Claude Desktop to terminal Claude Code

**Context:** The repo was in unknown shape after months of Claude Desktop sessions.
30 branches, 11 worktrees, 17 untracked files at root, 2 stashes. Pain points:
re-explaining context, threads "getting stuck," conflicts between parallel sessions,
hoarding old conversations as the only memory of past attempts.

**Tried:** Audit-then-cleanup approach in 8 phases — root junk, commit keepers,
fix iOS path-casing artifacts, archive handovers, drop redundant stashes, remove
worktrees, prune merged branches, attempt to promote `nerve` to `apps/nerve/`.

**Result:** All 8 phases shipped. Working tree went from 17 untracked + 2 modified
to clean. Worktrees: 11 → 2. Branches: 30 → 13. Stashes: 2 → 0. Phase 8 (nerve
promotion) turned out to already be done on origin/main — fast-forwarding local
main pulled it in.

**Decision:** Adopt terminal Claude Code with this CLAUDE.md, DECISIONS.md, and
the `/finish` slash command as the standing workflow. The `kb-lookup.sh` PreToolUse
hook auto-injects `knowledge/` context when editing protected apps, so the
business-brain rule is enforced by the harness rather than by remembering.

**Watch out for:**
- macOS case-insensitive FS will keep producing untracked-file noise if anything
  touches `apps/ios/SalesFlow/` vs `apps/ios/salesflow/`. The repo's tracked path
  is **capital-S `SalesFlow`**. If git status starts showing untracked iOS files
  that you didn't create, suspect a casing rename, not lost work.
- `claude/nice-kare-edfa44` is a live TestFlight beta worktree. Do not touch.
  Promote work *out* of it via copy + new branch, never operate inside it.
- Local main can drift far behind origin/main during heavy parallel work. Always
  fetch + check `git log origin/main..main` and `git log main..origin/main`
  before branching.

**Related:** Stage 1–3 onboarding session 2026-05-07. Branch
`feat/cli-workflow-onboarding`. Recent cleanup commits on
`feat/composer-workbench-and-qualifier`.

---

## 2026-05-07 — Vercel 4.5 MB body cap on demo uploads → signed upload URLs

**Context:** Dropping the HTML demo on `/admin/leads` (the "Claude Desktop
handoff" zone) failed with `Network error uploading demo.` for the 5.3 MB
`noose-and-needle` file. Smaller demos uploaded fine. The original endpoint
streamed the file as `multipart/form-data` through a Next.js route on
sales-dashboard, deployed to Vercel.

**Tried:** Read the file server-side via `req.formData()` then
`sb.storage.from('demo-sites').upload(...)`. Worked locally (no platform
limit), failed silently on Vercel for any file over ~4.5 MB.

**Result:** Vercel rejects request bodies over **4.5 MB on serverless
functions** at the platform layer, *before* the route handler runs. The
client `fetch` saw a connection reset / non-JSON response, and the catch
branch swallowed it into a flat "Network error" string — masking the real
413/cause. Symptom looked like network instability; actual cause was payload
size.

**Decision:** Have the browser upload directly to Supabase Storage via a
**signed upload URL**. The API route stays on Vercel but only mints the
URL (tiny JSON body), then the browser PUTs file bytes straight to Supabase
— file never traverses Vercel. `@supabase/supabase-js` v2 supports this via
`storage.from(bucket).createSignedUploadUrl(path, { upsert: true })`.

**Watch out for:**
- The 4.5 MB cap applies to **every** Vercel-hosted route that takes a file
  body. Any future upload flow on this domain (lead photos, brand assets,
  etc.) will hit the same wall — default to signed URLs from day one rather
  than discovering it again at 5 MB.
- Don't trust generic catch branches on uploads. When a fetch promise
  rejects, the response (if any) is often HTML, so `await res.json()` also
  throws and falls into the same catch — making it impossible to tell a
  413 from a real network drop. The replacement reader (`readJsonOrText`)
  surfaces the first 200 chars of the response when JSON parsing fails.
- Supabase's default bucket file-size limit is 50 MB — fine for now, but
  if demos start bundling video the bucket needs a higher `fileSizeLimit`
  set explicitly at create time.

**Related:** PRs #33, #34. Files:
`apps/sales-dashboard/src/app/api/admin/demo-upload/route.ts`,
`apps/sales-dashboard/src/app/admin/leads/page.tsx`.

---

## 2026-05-07 — Skill-emitted `demo_site_domain` is a placeholder, not a live URL

**Context:** Follow-up bug after the upload fix. If the user dropped the
HTML *before* the JSON brief, the assigned lead's demo URL was wrong — it
pointed at something like `noose-and-needle.shop`, which isn't served. The
HTML had uploaded successfully and the dropzone briefly showed the right
Supabase URL, but it got overwritten when the JSON dropped.

**Tried:** N/A — root cause was in `applyBrief()` at line 162:
`setDemoDomain(s('demo_site_domain'))`. Unconditional overwrite.

**Result:** The `lead-json` skill emits a *placeholder* `demo_site_domain`
(the future-bought shop domain) in its output JSON. That value is meant
for the eventual live deployment, not the current spec-site demo. When
`applyBrief` fired after an HTML upload, it stomped the live Supabase URL
with this placeholder, and `handleCreate` then sent the bogus value to
`/api/admin/leads`.

**Decision:** In `applyBrief`, prefer `uploadedDemoUrl` whenever one exists:
`setDemoDomain(uploadedDemoUrl || briefDomain)`. The uploaded Supabase URL
is the truth — the JSON's value is best-effort metadata.

**Watch out for:**
- Anywhere else that consumes `lead-json` output and writes to a
  `demo_site_domain`-shaped field, the same trap applies. The skill is
  *not* lying — it's annotating a future state — but any code that treats
  the field as authoritative will break the same way.
- Drop-order independence is a feature here: the dropzone has to behave
  identically whether the user drops {html, json} together, html-then-json,
  or json-then-html. Future changes to `applyBrief` or the upload handler
  should preserve this property.
- `submit/` is the canonical drop folder convention
  (`~/Desktop/salespatch-demos/<slug>/submit/<slug>.{html,json}`). The
  dropzone unwraps it via `webkitGetAsEntry` one level deep — flat folder
  only, deeper trees aren't a use case here.

**Related:** PR #34. Files:
`apps/sales-dashboard/src/app/admin/leads/page.tsx` (`applyBrief`,
`collectDroppedFiles`).

---

<!-- New entries go above this line -->
