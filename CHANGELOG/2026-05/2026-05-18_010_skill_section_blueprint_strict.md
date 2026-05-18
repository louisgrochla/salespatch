# build-demo — strict blueprint rule (no template-filler sections)

**Date:** 2026-05-18
**Scope:** Fourth of six structural skill changes from the lead-2
audit. Drops the "standard pattern" catalogue from `/build-demo`
Section construction rules so the build constructs each section from
the brief's `blueprint_sections[]` rather than supplementing with
template defaults. Adds a banned-mobile-hero-copy-patterns list.
**Branch:** `feat/skill-section-blueprint-strict`
**Base branch:** `main`

## What changed

### `.claude/commands/build-demo.md` Section construction rules

- **Strict-blueprint rule added.** The brief's
  `blueprint_sections[]` IS the demo's structure. Build N sections,
  N = `length(blueprint_sections)`. No more, no fewer. Section order
  matches the brief's order. Section name matches the brief's `name`
  field (used as the section's heading or aria-label). Section purpose
  is the brief's `intent` field — must materially serve that intent.
- **Catalogue removed.** The previous "standard pattern" listed nine
  sections (HERO / SOCIAL PROOF / DIAGNOSIS-DRIVEN / PRODUCT / STORY /
  PRESS / WHOLESALE / VISIT / FOOTER) each with examples and
  instructions. Even with "adapt, don't follow blindly" framing, the
  catalogue trained the build toward shipping those nine by default.
  Every demo trended toward the same skeleton with names swapped in.
  Removing the catalogue forces the build to construct from scratch.
- **Universal sections explicit.** Only nav + footer are added without
  a brief entry. They're chrome, not content. Everything between is
  the brief's blueprint exactly.
- **Banned mobile-hero copy patterns.** Five patterns flagged as
  templatey AI tells:
  - `<Place name> <noun>, made for <X>` (e.g. "Aberdeen nails, made
    for repeat visits" — exactly what lead-2 shipped)
  - `Where <adjective> meets <adjective>` (e.g. "Where craft meets
    care")
  - Rule-of-three nouns separated by `·` or `,` with no specific
    facts (e.g. "Quality. Craft. Care.")
  - "The place for <category>" / "Your <category> destination"
  - "We believe in <X>" / "At <business>, we..."
  The hero must reference a fact only this business has.

## Why

The lead-2 (Annie's Nails) audit produced "Aberdeen nails, made for
repeat visits" as the hero h1 — exactly the templatey AI-tell pattern.
The /build-demo skill's "standard pattern" catalogue trained the build
to reach for that default even when the brief's blueprint listed only
six sections (none of which mapped 1:1 to the nine in the catalogue).
The build supplemented the brief with template defaults because the
skill text encouraged it.

The deeper structural problem: a skill that lists "the standard
pattern" produces standard-pattern output. The brief's
diagnosis-driven blueprint never gets to drive the build; it gets
*supplemented* by the build's templatey instincts. Replacing the
catalogue with "build exactly what the brief said, no more" is the
fix that compounds across every future build.

## Stack

- Markdown only — pure skill-prompt edits.
- No code changes, no Prisma migration, no validator changes.
- Backwards-compatible: existing briefs with `blueprint_sections`
  arrays already drive the build; this PR just removes the
  template-filler escape hatch.

## Integrations

- Pairs cleanly with the upcoming `feat/skill-voice-budget` PR which
  applies the same "use what the brief gave you" principle to body
  copy. Together they remove the two biggest sources of templatey
  output (extra sections + invented copy).
- The banned-patterns list is enforced by prompt only. A follow-up
  could add the regex to `apps/nerve/scripts/qa-demo.ts` so the
  static QA score takes a hit when the hero matches a banned pattern.
  Logged but not in this PR.

## How to verify

```bash
bash scripts/setup-skills.sh   # symlinks should already be in place
```

End-to-end:

1. Re-build the urban-cutz demo (or any existing lead's demo). Confirm
   the resulting `demo-artefact.json.metadata.layout_decisions.gallery_order_filenames`
   has the same sections the brief listed in `blueprint_sections[]` —
   no extras. Section count of the rendered HTML == section count of
   the brief blueprint.
2. Run /build-demo on a fresh lead. Confirm the hero h1 does NOT
   match any banned pattern. The chat output should call out which
   specific fact the hero anchors on.
3. Spot-check a deliberately-empty blueprint case — if the brief
   committed to only three sections, the demo ships with three
   sections (plus nav + footer chrome), not nine.

## Known issues

- Banned-patterns regex isn't yet enforced by static QA. The prompt
  ban is the only check; a future PR can extend
  `apps/nerve/scripts/qa-demo.ts` with a regex sweep that penalises
  the copy_score when a pattern matches.
- Existing demos (urban-cutz, annies-nails-beauty, jp-nail) shipped
  under the old catalogue and may have sections the new rule would
  reject. They build fine on the old artefact; only future re-runs
  pick up the strict rule.
- The brief's `blueprint_sections[]` is currently free-form prose
  for `name` and `intent`. A future PR could canonicalise the names
  for cross-lead querying ("how often does a 'Hero' section close
  vs an 'Intro' section"), but that's downstream.
