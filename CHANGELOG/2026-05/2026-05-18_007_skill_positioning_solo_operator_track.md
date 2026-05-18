# spec-site-brief — solo-operator positioning track + tightened feature_opportunities

**Date:** 2026-05-18
**Scope:** First of six structural skill changes from the lead-2 (Annie's
Nails) audit. Fixes the templatey-output root cause: the brand-decode
forces a public-brand archetype even when the brand IS one person. Adds
Track B (operator-as-brand) with the operator's own captions as the
canonical reference instead of a magazine archetype. Also tightens
`feature_opportunities[]` so SaaS-default features (newsletter strips,
email captures, price anchors) can't sneak in as inline filler.
**Branch:** `feat/skill-positioning-solo-operator-track`
**Base branch:** `main`

## What changed

### `skills/spec-site-brief/SKILL.md`

- **Phase 2 → Aesthetic positioning** — replaced the single-track
  public-brand reference rule with two tracks:
  - **Track A — Brand-led operator.** Use a public-brand reference
    (Aimé Leon Dore / Margot Henderson / Sang Bleu / etc). The list
    of examples is unchanged. Track A applies when the operator has
    a distinct brand identity beyond their personal voice — logo,
    colour system, deliberate interior.
  - **Track B — Operator-as-brand.** Solo nail tech, single-craft
    barber, one-woman ceramics studio. The brief commits to 3-5
    verbatim caption lines from `voice_quotes[]` + the typographic
    choice that fits them + a one-sentence voice rule (e.g. "The
    demo must read as if Annie wrote it on a Tuesday lunch break")
    instead of a magazine archetype.
  - Track selection has a four-question test before naming a
    reference. When in doubt, default to Track B for sole-traders.
  - `brand-analysis.json.positioning_track` is the new mandatory
    field; `positioning_reference` shape changes per track.

- **Phase 2 → Feature inventory (`feature_opportunities[]`)** — three
  structural changes:
  - The enum (`email_drop_list | enquiry_form | portfolio_filter |
    price_anchor | newsletter | event_calendar | wholesale_path |
    gallery_grid | live_status | other`) is dropped. Every entry now
    has a free-form `feature` description in the operator's own
    words; the SaaS-pattern names were templatey by enumeration.
  - The cap drops from 4 → 3 entries.
  - Priority field changes from `1-5` integer to `must | should |
    maybe` enum. `must` earns a top-level section; `should` may earn
    a smaller component; `maybe` does NOT ship — it surfaces back
    as a suggestion only. The previous "priority 4-5 → inline strip"
    middle path was exactly where templatey SaaS-defaults sneaked in.
  - `diagnosis_trace` field (new, required) replaces the looser
    `rationale` — must be a substring of a Phase 1 / Phase 3 captured
    fact. The build validates this against `outputs/brief.json` before
    NERVE ingest; entries with unverifiable traces are rejected.

- **Phase 4 → BRAND INTELLIGENCE output template** — adds the
  `Track: [brand_led | operator_as_brand]` line. For operator_as_brand
  briefs, the POSITIONING section now lists the voice rule + the 3-5
  caption lines that drive body copy, not a public-brand reference.

- **Phase 4 → brand-analysis.json schema example** — adds
  `positioning_track`, reshapes `positioning_reference` description,
  reshapes `metadata.feature_opportunities[]` to the new field set
  (`feature` free-form, `diagnosis_trace` required, `priority` enum).

### What this fixes

The lead-2 (Annie's Nails) audit produced a templatey demo because:
1. The brand-decode was forced to pick "Margot Henderson editorial-warmth"
   — a public-brand archetype that doesn't fit a solo Vietnamese nail
   tech writing "Hi ladies" captions to her loyal clients. The build
   then executed the wrong reference faithfully.
2. A priority-3 `feature_opportunities` entry (`email_drop_list`)
   shipped as a templatey inline strip even though Annie's diagnosis
   (trust gap) doesn't need owned-audience capture.

Both failures had the same shape: the skill's defaults push toward
generic-SaaS / magazine-template outputs unless the brief operator
actively fights them. Track B + the maybe-doesn't-ship rule remove
the path that generates the genericity in the first place.

## Why

Per the discussion in chat: every revision needs to land in the skill,
not in the run. The skills compound when they become the Agent SDK
system prompt for the eventual specialised agents. A patch to Annie's
specific demo would not generalise — the next solo-operator lead
would produce the same templatey demo because the skill defaults haven't
moved. This PR moves the default.

## Stack

- Markdown only — pure skill-prompt edits. No new code, no Prisma
  migration, no dependency changes.
- `BrandAnalysis.metadata` is already flexible JSONB, so
  `positioning_track` + the reshaped `feature_opportunities[]` land
  without a validator change.

## Integrations

- Downstream: `/build-demo` will read `brand-analysis.json.positioning_track`
  to know whether to enforce the voice-budget rule (added in the
  follow-up PR `feat/skill-voice-budget`). When this PR ships before
  the voice-budget PR, `/build-demo` ignores the new field cleanly.
- Backwards-compatibility: existing leads (urban-cutz, annies-nails-beauty,
  jp-nail) have `positioning_track` absent. `/build-demo`'s fall-back
  treats absent as "Track A" so existing leads continue to build
  identically. New leads adopt the new fields.

## How to verify

```bash
bash scripts/setup-skills.sh   # if not run yet
```

Run /spec-site-brief on a fresh solo-operator lead. Expect the chat
output to declare "Track: operator_as_brand" with a voice rule + the
verbatim caption lines that drive the build. Confirm via:

```bash
jq '.metadata.positioning_track, .metadata.feature_opportunities' \
  ~/Desktop/salespatch-demos/<slug>/outputs/brand-analysis.json
```

Run /spec-site-brief on a fresh brand-led lead (tattoo studio with a
strong visual identity). Expect "Track: brand_led" with a public-brand
reference (e.g. "Sang Bleu London editorial") in `positioning_reference`.

POST to `/api/ingest/brand-analysis` — HTTP 200 in both cases (the
existing validator accepts the new metadata shape without changes).

## Known issues

- `/build-demo` doesn't yet consume `positioning_track`. Until
  `feat/skill-voice-budget` ships, Track B briefs produce the same
  templatey demos. This PR is the necessary first step but the build-
  side fix is what closes the loop visibly.
- The diagnosis_trace substring-validation isn't yet enforced by code.
  The skill prompt requires it but a future static-validator could
  catch invented traces at brief-generation time. Logged as a one-line
  follow-up.
- Existing leads (annies-nails-beauty, urban-cutz, jp-nail) have the
  old schema in their metadata. They build cleanly via the fall-back
  but won't benefit from Track B until they're re-briefed. A one-off
  re-brief is fine; no backfill script required.
