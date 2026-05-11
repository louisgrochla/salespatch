# Auto-QA pass — first producer for the qa_results table

## What changed

- `apps/nerve/scripts/qa-demo.ts` — new heuristic QA checker. Pure
  Node, no dependencies. Takes `<demo.html> <artefact_id> <lead_id>
  [<ran_at_iso>]` and emits a `QaResultInput` JSON to stdout +
  human-readable summary to stderr.
- `~/.claude/commands/build-demo.md` (user-level, not committed) — new
  "Auto-QA pass" section runs the script after the demo artefact has
  been posted, captures the output to
  `outputs/qa-result.json`, and POSTs it via
  `~/.claude/scripts/nerve/post-ingest.sh /api/ingest/qa-result`.
  Output format adds one line surfacing the QA stderr summary.

## Why

`qa_results` has been wired since A5 but had no producer — the autumn
Pi siteQaAgent doesn't exist yet, and the manual `/build-demo` skill
shipped every demo without a quality score. That meant the warehouse
could never answer "do high-QA demos close better?" or "what failure
modes correlate with rejections?" — the data simply wasn't there.

This is a heuristic check, not a render. Limits acknowledged in the
script comments — real WCAG contrast, headless render, Lighthouse
all belong to the autumn Pi pass. But heuristics score four
categories the founder cares about:

- **HTML structure** (25): lang attr, title, main/header/footer
  landmarks, single h1, balanced layout containers
- **Accessibility** (25): img alt coverage, link/button accessible
  text, prefers-reduced-motion, :focus styles
- **Photo coverage** (25): inline data: image embed count, placeholder
  fallback count (catches the "shipped with `[product photo · drop
  file here]`" failure mode)
- **Copy quality** (25): em-dash count, exclamation mark count, banned
  vocabulary from the /lead-json + /build-demo skill rules (unlock,
  leverage, transform, seamless, etc.)

Score totals 0-100. Pass at ≥ 70. The score is the operational signal
today; the per-issue array is the corpus the F4 agent layer trains
against when it inherits the skill.

## Stack
- TypeScript script, pure Node (no deps), run via `npx tsx`
- Posts via the existing `~/.claude/scripts/nerve/post-ingest.sh`
  helper to the already-live `/api/ingest/qa-result` HMAC endpoint
- Stores into the already-migrated `qa_results` table (migration 11)

## Integrations
- None new. The QA endpoint, table, and HMAC plumbing all predate
  this change (A5 work).

## How to verify
1. **Smoke against a known-good demo:**
   ```bash
   cd apps/nerve && npx tsx scripts/qa-demo.ts \
     ~/Desktop/salespatch-demos/jp-nail/outputs/demo.html \
     jp-nail-demo-2026-05-11T154808Z jp-nail
   ```
   Expect stderr `QA: 100/100 PASS` (or similar high score) and a
   well-formed JSON to stdout.
2. **Smoke against a deliberately-bad fixture** (verified locally
   2026-05-11): 36/100 FAIL across all four categories with 17 issues
   covering missing landmarks, unbalanced tags, missing alts,
   placeholder photos, em-dashes, exclamation marks, banned vocab.
3. **End-to-end ingest against prod** (verified 2026-05-11): JP Nail's
   real demo + real artefact_id produced
   `qa_id=jp-nail-demo-2026-05-11T154808Z-qa-2026-05-11T171500000Z`,
   HTTP 200, `inserted:true`. Visible on
   `/leads/jp-nail` under the existing QA results section.
4. Re-run on the same QA id (replay) returns `inserted:false` —
   idempotency confirmed via the existing route's qa_id PK.

## Known issues
- Heuristics, not a renderer. Contrast score is a 50/65/80 placeholder
  based on whether CSS defines explicit `color` and `background-color`;
  real WCAG calculation needs DOM layout. Real check is autumn Pi
  siteQaAgent's job — flagged in the script comments.
- Unbalanced-tag check is naive (regex count of opens vs closes for
  div/section/article/ul/ol); doesn't handle self-closing edge cases
  or HTML inside `<template>` / commented-out blocks. False positives
  possible on contrived markup; acceptable for the founder workflow.
- Banned-vocabulary check fires on visible text only (data: URIs and
  script/style content are stripped first), but won't catch banned
  words split across tags or hyphenation. Good enough for the smell
  test; not a contract.
- The `/build-demo` skill markdown change lives in `~/.claude/commands/`
  at user level — listed above for traceability, CI cannot test it.
