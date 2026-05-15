# build-demo — record hero + layout decisions in artefact metadata

## What changed

- `~/.claude/commands/build-demo.md` (user-level, not in repo) — adds a
  new `metadata.layout_decisions` map to the `demo-artefact.json` spec
  with five fields:
  - `hero_photo_filenames[]` — ordered list of hero photos (1-N to handle
    stacked/collage heroes alongside single-photo heroes)
  - `hero_roles[]` — parallel array of roles
  - `gallery_order_filenames[]` — gallery / portfolio render order
  - `featured_tile_filename` — the 3x2 anchor tile, or `null`
  - `credibility_banner_filename` — the post-hero full-bleed banner, or
    `null` if the section was skipped
- Includes a prose block explaining what each field is for and the three
  analytics questions they unlock at scale.

## Why

PR #80 (`brand_analyses.photo_roles` + drift tracking) captured *what
kind* of photo a file is and whether the build overrode the brief's
classification. Neither answered *where in the layout the photo landed*.
The Blackbird Bakery end-to-end run made the gap concrete: the demo used
a three-photo stacked hero (Dave's AFC + Susan's pink-and-gold + Struan's
split 18th) with `product_close` for all three, but `demo-artefact.json`
only stored that they were `product_close` somewhere — not that they
became the hero. Same for the AFC cake landing as the 3x2 feature tile
in the gallery.

These five fields capture the three analytics signals the warehouse can
turn on the moment outcomes start landing:

1. Which `role` typically wins the hero slot for a given vertical.
2. Whether multi-photo heroes close better than single-photo heroes
   (`length(hero_photo_filenames)` grouped by outcome).
3. Whether the credibility-banner pattern helps when a storefront photo
   is available (`credibility_banner_filename IS NOT NULL` joined with
   `lead_assignment_events`).

## Stack
User-level Claude Code skill (`build-demo.md`). No NERVE changes — the
new field lives inside the existing `demo_artefacts.metadata` JSONB
column, which is opaque passthrough. Same trade-off as the `drift`
shape change in #80.

## Integrations
None new. NERVE `/api/ingest/demo-artefact` accepts the wider metadata
shape without code changes; analytics queries against
`metadata->'layout_decisions'` are downstream work.

## How to verify

1. Run `/build-demo` on a fresh lead (or rebuild a known lead with a new
   artefact_id per the SL-MAS replay pattern).
2. Inspect `outputs/demo-artefact.json` — confirm `metadata.layout_decisions`
   is present and all five fields populated (with `null` or `[]` where the
   section was skipped, never omitted).
3. Confirm the NERVE ingest returns HTTP 200 (the metadata column is
   JSONB; new fields are stored as-is).
4. Query the warehouse:
   ```sql
   SELECT vertical,
          metadata->'layout_decisions'->>'featured_tile_filename' IS NOT NULL AS has_feature_tile,
          jsonb_array_length(metadata->'layout_decisions'->'hero_photo_filenames') AS hero_count
   FROM demo_artefacts
   WHERE generated_at > now() - interval '7 days';
   ```

## Known issues

- Existing `demo_artefacts` rows (Nevermind, The Cult of Coffee, Blackbird
  v1/v2) do NOT have `metadata.layout_decisions`. Analytics SQL must guard
  with `metadata ? 'layout_decisions'` or `COALESCE` patterns. No backfill
  is planned — the field is forward-only.
- The hero composition fields don't capture *why* a particular photo was
  chosen over another (e.g. "AFC red was picked over the FRIENDS purple
  because the brief's positioning leaned heritage colour"). That reasoning
  would live in a separate optional field (`hero_selection_rationale`)
  if it ever proves useful; not adding now to avoid scope creep.
