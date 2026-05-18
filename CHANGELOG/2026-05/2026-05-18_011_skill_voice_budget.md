# build-demo — voice budget for operator-as-brand builds

**Date:** 2026-05-18
**Scope:** Fifth of six structural skill changes from the lead-2
audit. Closes the loop on `feat/skill-positioning-solo-operator-track`
(PR #124): when the brief flagged `positioning_track:
operator_as_brand`, `/build-demo` must drive body copy from the
operator's own captions, not from the build's marketing voice. Without
this rule, Track B briefs still produced templatey demos because the
build invented copy.
**Branch:** `feat/skill-voice-budget`
**Base branch:** `main`
**Depends on:** PR #124 (positioning track introduces
`brand_analysis.json.metadata.positioning_track`).

## What changed

### `.claude/commands/build-demo.md` Pre-flight step 6c

New step that reads `brand-analysis.json.metadata.positioning_track`
and applies a voice budget for `operator_as_brand` builds:

- **Hero h1 / sub-line** — verbatim or near-verbatim from `voice_quotes[]`.
  Splicing two captured phrases together is allowed; invention from
  scratch is not.
- **About section** — 2-3 captured voice quotes weaved into short body
  paragraphs. Body weight, no museum-pull-quote framing.
- **Services / what we do** — every service description either comes
  from the brief's services list OR is a near-verbatim caption line
  from `voice_quotes[]` describing that service. Generic SaaS-shaped
  descriptions ("Long-lasting BIAB nails for everyday wear") are
  banned in favour of the operator's own caption ("Builder gel that
  holds 4-5 weeks on natural nails — I check every set at week 3").
- **Build can only invent chrome.** Nav labels, hours table, address,
  section labels, navigation CTAs ("See recent work"). Everything
  else is operator voice or verbatim brief fact.

**Insufficient-budget gate.** If the brief has fewer than 4
`voice_quotes[]` entries, the build STOPS rather than papering over
the gap with invented copy. It surfaces back to /spec-site-brief
naming which sections cannot be filled and requesting more caption
capture.

For `brand_led` (or absent — pre-track briefs default here), the
build follows its existing instincts unchanged. Backwards-compatible.

## Why

PR #124 introduced `positioning_track: operator_as_brand` to fix the
"brand-decode forces a magazine archetype onto solo operators" root
cause. But just having the field doesn't change the build's output —
the build still invents body copy in its own voice unless explicitly
told not to. Lead-2 (Annie's Nails) would have been classified as
Track B under #124 but still shipped with build-invented copy like
"Aberdeen nails, made for repeat visits" — because no rule said
"use Annie's words instead of yours".

The voice budget closes that loop. Track B + voice budget together
mean: Annie's hero shows one of HER actual lines (e.g. "An experienced
nail artist with a friendly face who helps you to look fabulous."),
her about section reads as 2-3 of her FB captions weaved together, her
services are her own descriptions, and the build only invents the chrome.

This is the structural rule that compounds — every future solo-operator
lead inherits the constraint and produces a demo that sounds like
THAT operator, not like a magazine-shaped template.

## Stack

- Markdown only — pure skill-prompt edit.
- No code changes, no Prisma migration, no validator changes.
- Backwards-compatible: pre-track briefs (no `positioning_track` field)
  treated as `brand_led`, build unchanged.

## Integrations

- Reads from `brand-analysis.json.metadata.positioning_track` (PR #124)
  and `voice_quotes[]` (already a required field).
- The "insufficient-budget gate" handshakes with /spec-site-brief — if
  the build can't ship, it asks the brief skill for more voice capture
  rather than running anyway with templatey output.
- Pairs with PR #127 (strict section blueprint) — together they remove
  the two biggest sources of templatey demos: extra-section template
  filler (#127) + invented body copy (this PR).

## How to verify

```bash
bash scripts/setup-skills.sh   # symlinks should already be in place
```

End-to-end:

1. Re-brief Annie's Nails (lead-2) with Track B set (PR #124 already
   merged). Run /build-demo. Confirm:
   - Hero h1 is a verbatim or near-verbatim line from her captured
     `voice_quotes[]` (NOT "Aberdeen nails, made for repeat visits").
   - About section reads as 2-3 of her FB captions weaved into body
     paragraphs, not a single museum-style pull-quote.
   - Service descriptions use her own caption language where she
     described those services (e.g. her "BIAB holds 4-5 weeks" line),
     not invented SaaS-shaped copy.
2. Run /build-demo on a Track A brief (urban-cutz). Behaviour
   unchanged — build follows existing instincts, body copy invention
   allowed within brand voice.
3. Try /build-demo on a thin-voice-capture brief (only 2 quotes).
   Build STOPS with the insufficient-budget message, names the
   sections that need more material, asks for /spec-site-brief re-run.

## Known issues

- The "4 voice_quotes[] minimum" threshold is heuristic. Could be
  vertical-specific (nail tech captions are short; tattoo artist
  captions are essays). A future PR could make the threshold a
  function of vertical + caption-word-count rather than a flat 4.
- The "verbatim or near-verbatim" check is prompt-only. A future
  static-validator could regex against the rendered HTML's hero h1
  to confirm it appears in `voice_quotes[]` literally or with minor
  edits. Logged.
- Existing demos (annies-nails-beauty, urban-cutz, jp-nail) shipped
  under the previous rule and don't benefit from voice budget until
  re-briefed + re-built. A one-off re-build is fine; no backfill
  script required.
