# NERVE — /api/read/demo-artefacts/brief-drift

## What changed

- `apps/nerve/src/lib/sl-mas/demoArtefactStore.ts` — new `BriefDriftSummary`
  type + `briefDriftSummary(vertical?)` method. Raw SQL via
  `prisma.$queryRaw` unnests `demo_artefacts.metadata->'photo_classifications'`
  using `CROSS JOIN LATERAL jsonb_each` and discriminates each entry by
  `jsonb_typeof`. Both metadata shapes are handled:
    - **Legacy** (`{ filename: "role_string" }`, pre-#80) — counted toward
      `no_brief_role_count`
    - **New** (`{ filename: { role, brief_role, drift } }`, post-#80) —
      `drift === true` lands in the breakdown, `brief_role === null`
      falls under `no_brief_role_count`
  Aggregation runs in Node after the raw SQL pull. For the current
  warehouse size (n=14 artefacts) this is trivially fast; the SQL
  filter on `vertical` keeps it scalable.
- `apps/nerve/src/app/api/read/demo-artefacts/brief-drift/route.ts` —
  new HMAC-signed GET endpoint. Mirrors `/api/read/strategies`:
  - `x-read-signature` header against canonical sorted query string
  - `OUTCOME_INGEST_SECRET` (shared)
  - `OUTCOME_INGEST_ALLOW_UNSIGNED=true` in dev only
  - `Cache-Control: no-store` since the data is live
  Single optional `vertical` query param; omit for an all-verticals
  rollup.

## Response shape

```json
{
  "vertical": "hospitality",
  "total_artefacts": 4,
  "total_classified_photos": 56,
  "drift_count": 1,
  "drift_rate": 0.0182,
  "drift_by_brief_role": {
    "logo": { "n": 1, "overrode_to": { "unused": 1 } }
  },
  "no_brief_role_count": 0,
  "generated_at": "2026-05-15T22:40:00.000Z"
}
```

- `drift_rate` is `drift_count / (total_classified_photos - no_brief_role_count)` — the denominator excludes entries where there was no brief commitment to drift against. Defaults to `0` when the denominator is `0`.
- `drift_by_brief_role` is keyed by `brief_role`. Each value's `overrode_to` map shows which final roles the build chose instead. Empty `{}` means no drift cases for that role.

## Why

PR #80 introduced the drift shape but provided no read surface. The AI
layer needs to answer questions like "for vertical=barber, brief.
product_close → demo.product_close survives 95% of the time" without
running ad-hoc warehouse SQL. This endpoint serves that loop.

Concrete first signal once the warehouse fills out: Blackbird Bakery's
artefact (post-#80) has exactly one drift case — the IG bio screenshot
that the brief assigned `logo` was overridden to `unused` because the
file contained Instagram UI chrome. Per-vertical, this surfaces as
`drift_by_brief_role.logo.overrode_to.unused = 1`. After ~50 demos,
the same query starts to reveal which brief role decisions are reliable
vs which the build routinely overrides.

## Stack
Next.js 14 App Router + Prisma 5 raw SQL (no schema change). HMAC
signing helper already exists.

## Integrations
- NERVE only. No external APIs, no cost change.
- Consumed by future AI agents and the dashboard. The producer side
  (`/spec-site-brief` skill) does NOT call this — it consults
  `/api/read/strategies` and `/api/read/lead-profiles/winning-features`
  for forward-looking signal, not its own past drift.

## How to verify

1. `cd apps/nerve && npx tsc --noEmit` — clean (verified locally)
2. `cd apps/nerve && npm run dev` then in another shell:
   ```bash
   curl -s 'http://localhost:4400/api/read/demo-artefacts/brief-drift?vertical=hospitality' \
     -H "x-read-signature: $(echo -n 'vertical=hospitality' | openssl dgst -sha256 -hmac "$OUTCOME_INGEST_SECRET" -r | cut -d' ' -f1 | xargs printf 'sha256=%s\n')"
   ```
   Or easier, set `OUTCOME_INGEST_ALLOW_UNSIGNED=true` in `.env.local` and drop the header.
3. Post-deploy: hit the live endpoint via the nerve read helper:
   ```bash
   ~/.claude/scripts/nerve/get-ingest.sh /api/read/demo-artefacts/brief-drift "vertical=hospitality"
   ```
4. Expected for vertical=hospitality on current warehouse: at least
   one drift case from Blackbird Bakery's screenshot override
   (`drift_by_brief_role.logo.overrode_to.unused = 1`).
5. Test all-verticals rollup with no `vertical` param.

## Known issues

- Legacy artefacts (Blackbird v1, Nevermind, The Cult of Coffee) carry
  the pre-#80 shape — all their entries roll up under
  `no_brief_role_count`. Reading "drift_rate = 0 with high
  no_brief_role_count" correctly says "we have history but no brief
  commitments to grade it against yet". As new artefacts land, the
  denominator grows.
- The breakdown groups by `brief_role` only. If the AI layer wants
  per-vertical-per-brief-role rollups, that's a follow-up — for now,
  query once per vertical.
- No pagination — the response is a single aggregate object regardless
  of how many artefacts feed it. The raw query pulls every
  classification entry into memory; at current scale that's negligible
  (a few hundred entries) and the SQL has a vertical filter to scope it.
