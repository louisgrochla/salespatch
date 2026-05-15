# brand_analyses — photo_roles map + drift tracking in demo_artefacts

## What changed

- `apps/nerve/prisma/schema.prisma` — `BrandAnalysis` model gains
  `photoRoles Json @default("{}") @map("photo_roles")`. New column on
  `brand_analyses`.
- `apps/nerve/prisma/migrations/18_brand_analysis_photo_roles/migration.sql` —
  `ALTER TABLE brand_analyses ADD COLUMN photo_roles JSONB NOT NULL DEFAULT '{}'::jsonb`.
  Safe on live rows; legacy analyses get an empty map, which `/build-demo`
  treats as "no brief commitment — classify from scratch".
- `apps/nerve/src/lib/sl-mas/brandAnalysisStore.ts` — `BrandAnalysisInput`
  gains optional `photo_roles?: Record<string, string>`; `BrandAnalysisRow`
  gains required `photo_roles: Record<string, string>` (defaults to `{}`).
  `inputToCreate` and `rowToAnalysis` map both directions.
- `apps/nerve/src/app/api/ingest/brand-analysis/route.ts` — `validatePayload`
  now rejects `photo_roles` if it isn't an object of string values.
- `~/.claude/skills/spec-site-brief/SKILL.md` (user-level, not in repo) —
  Phase 2 ends with a new "Photo role mapping" sub-section instructing the
  brief writer to commit a role per photo before closing Phase 2. The
  `brand-analysis.json` schema example includes `photo_roles`.
- `~/.claude/commands/build-demo.md` (user-level, not in repo) — pre-flight
  step #2 reads `brand-analysis.json` first as the structured commitment
  (hex, fonts, voice, positioning, photo_roles), only falling back to
  brief.md prose if the sidecar is absent. Photo classification section
  rewritten to use `brand-analysis.json.photo_roles` as the placement
  default; the build overrides with reason only.
  `demo-artefact.json.metadata.photo_classifications` shape changes from
  `{ filename: role }` to `{ filename: { role, brief_role, drift } }`.

## Why
`/spec-site-brief` Phase 2 was already reading every photo to do brand
decode. `/build-demo` was reading every photo again to classify them for
placement — with no role-map passed between the two passes. The brief's
implicit "the hand-imperfect logo is in photo X" reasoning never reached
the builder, who classified independently. If the two disagreed, the demo
drifted from the brand decode.

The fix passes Phase 2's classification forward as `brand-analysis.json.
photo_roles`. The build now defaults to the brief's call and overrides
only with reason — and records the override in
`demo_artefacts.metadata.photo_classifications.drift` so the AI layer can
learn which kinds of brief calls don't survive contact with layout (e.g.
"for vertical=barber, brief.product_close → demo.product_close survives
95% of the time, but brief.interior → demo.storefront overrides happen
40% of the time").

Lifting `photo_roles` to a real column (rather than nesting it under
`metadata`) makes it directly queryable for the learning loop — JSONB
path queries against `metadata` are uglier and slower than a dedicated
column. The drift shape stays inside `demo_artefacts.metadata` because it
is per-build state, not brief commitment.

## Stack
Next.js 14 + Prisma + Postgres on the NERVE side. User-level Claude Code
slash commands on the producer side.

## Integrations
NERVE warehouse Postgres (Vercel/Neon). HMAC ingest at
`/api/ingest/brand-analysis`. No other apps touched.

## How to verify
1. `cd apps/nerve && npx prisma generate && npx tsc --noEmit` — clean.
2. `cd apps/nerve && npx prisma migrate deploy` — should apply
   `18_brand_analysis_photo_roles` against the configured database.
3. Run the manual skill chain on a fresh lead: `/new-lead "<name>"` →
   `/spec-site-brief` → `/build-demo` → `/lead-json`. Check
   `outputs/brand-analysis.json` has a populated `photo_roles` map.
   Check `outputs/demo-artefact.json.metadata.photo_classifications`
   has the new `{ role, brief_role, drift }` shape per file.
4. After ingest, query Postgres:
   `SELECT analysis_id, photo_roles FROM brand_analyses ORDER BY created_at DESC LIMIT 5;`

## Known issues
- The two existing leads with the old shape (`nevermind-...`,
  `the-cult-of-coffee`) keep their legacy `demo_artefacts.metadata.
  photo_classifications` as `{ filename: role }` strings. Any analytics
  SQL that queries this column must handle both shapes via
  `jsonb_typeof(value)`. Backfill is not justified — old rows just become
  `drift: null` cases in any analysis.
- `photo_roles` for the two legacy `brand_analyses` rows is `{}` (the
  column default). They'd need re-running through `/spec-site-brief` to
  populate, which would create a new `analysis_id` row rather than
  updating the old one. Same intentional replay pattern as the rest of
  SL-MAS ingest.
