# qa-visual — Layer 7 specificity grade

**Date:** 2026-05-18
**Scope:** Sixth and final structural skill change from the lead-2
audit. Adds a new visual-QA layer that grades whether the rendered
demo could be shipped for a different same-vertical business by
swapping only name + photos + location. Catches the failure mode
where Layers 2-4 all pass (brand-fidelity, voice, owner-reaction)
but the demo still feels templatey because the build invented the
connective copy.
**Branch:** `feat/qa-visual-specificity-layer`
**Base branch:** `main`

## What changed

### `apps/nerve/scripts/qa-visual-prompts.md`

- New "Layer 7 — Specificity grade (PR-K)" section between Layer 6
  and the Canonical result file.
- Documents: system prompt, user message helper, inputs (full.png +
  business_name + vertical), output schema (`SpecificityResult`),
  grading rubric (1-5), swap-test verdicts
  (`would_break | mostly_works | could_swap`).
- Lands in `qa_visual_results.metadata.specificity` for now (no
  first-class column / Prisma migration).

### `apps/nerve/scripts/qa-visual-prompts.ts`

- New `SPECIFICITY_SYSTEM_PROMPT` constant — the system prompt the
  vision call sees. Names what counts as "specific" vs "templatey"
  with concrete examples drawn from lead-2's actual failures (the
  `<Place> <noun>, made for <X>` hero pattern is called out by name).
- New `SpecificityResult` TS interface — `grade`, `specific_facts_seen[]`,
  `templatey_signals[]`, `swap_test_verdict`, `notes`.
- New `buildSpecificityUserMessage` helper — accepts `businessName`
  + nullable `vertical`. Tells vision the swap-test instruction
  without leaking brief content.

### `.claude/commands/build-demo.md`

- "Step 3 — apply the **six** layers" becomes "apply the **seven**
  layers".
- New Layer 7 entry in the per-layer inputs list — read `brief.json`
  for `business_name` + `vertical`, apply `SPECIFICITY_SYSTEM_PROMPT`
  to `full.png` alone, land result in `metadata.specificity`.
- Output Format Visual-QA line gains `specificity=<N>/5(<verdict>)`
  segment.

## Why

Lead-2 (Annie's Nails) scored brand_fidelity=5.0 + voice_consistency=5
+ owner_reaction=YES + customer_reaction=YES across Layers 2-4 — and
the user still correctly called it "very bland and templatey". The
existing layers grade *fidelity to the brief*; none of them grade
*whether the brief's voice actually made it to the page in a way that
distinguishes this business from a same-vertical template*. A demo
can score 5/5 on every existing layer and still be a magazine-shaped
template with the business name swapped in.

Layer 7 closes that gap. It judges the rendered page from a customer's
viewpoint, without seeing the brief, and applies the swap test that
the brief's reasoning-layer can't apply to its own output.

Together with the other five PRs in this sequence:
- PR #124 (positioning Track B) — fix the wrong-archetype root cause
- PR #125 (functional-front-door principle) — fix the filter
- PR #126 (pitch-tier verdict) — make Tier 2 load-bearing
- PR #127 (strict section blueprint) — drop template-section filler
- PR #128 (voice budget) — drop invented body copy
- **PR (this one) — grade what shipped**

The first five remove the structural defaults that produced templatey
output. Layer 7 is the regression-test: even if a future change
re-introduces a templatey path, the specificity grade will catch the
result. Closed-pitch close-rate will eventually correlate with
specificity grade; the warehouse learns "grade=5 closes 2x grade=3"
once n is meaningful.

## Stack

- TypeScript constants + Markdown only.
- No Prisma migration. `qa_visual_results.metadata` is already
  flexible JSONB.
- No code changes to the ingest validator — `metadata` accepts the
  new `specificity` field unchanged.
- TS verified: `cd apps/nerve && npx tsc --noEmit` clean.

## Integrations

- The vision call uses the existing visual-QA infrastructure
  (`qa-visual-render.ts` for the full.png, `embedRecord` for RAG).
- A future PR can promote `metadata.specificity` to a first-class
  column on `qa_visual_results` (Prisma migration) once the cohort
  is big enough to query against close-rate. Logged.
- Pairs with `apps/nerve/scripts/qa-visual-variant-selector.ts` —
  variant scoring could weight specificity grade alongside brand
  fidelity. Today the selector doesn't see specificity yet (it's in
  metadata); a one-line extension to read it would close that loop.

## How to verify

```bash
cd apps/nerve && npx tsc --noEmit   # clean
bash scripts/setup-skills.sh         # symlinks should already be in place
```

End-to-end on a fresh demo:

1. Run /spec-site-brief → /build-demo on a lead.
2. After visual-QA runs, inspect `qa-visual-result.json.metadata.specificity`:
   - `grade` 1-5
   - `specific_facts_seen[]` lists what the vision call saw as unique to this business
   - `templatey_signals[]` lists any AI-tell patterns (or empty if the demo is clean)
   - `swap_test_verdict` ∈ `would_break | mostly_works | could_swap`
3. The Output Format chat line includes `specificity=N/5(verdict)`.
4. Compare against an existing demo (e.g. annies-nails-beauty pre-PR-K
   ship) — that demo would now score 2-3 with templatey_signals citing
   the hero h1 pattern.

## Known issues

- The specificity grade is per-demo, not per-section. Layer 6 grades
  sections individually but Layer 7 grades the whole page. A future
  PR could decompose specificity to per-section if useful.
- The `metadata.specificity` location is the JSONB escape hatch — it's
  not yet a first-class column. Querying close-rate by grade requires
  jsonb_extract until the migration lands.
- The vision call cost is ~£0.02 per demo (one fullPage screenshot,
  one prompt). Same order of magnitude as other layers; no opt-in gate
  needed.
- The swap-test rubric ("could you ship this for a different business
  in the same vertical") is subjective; vision calls may grade
  inconsistently across cohorts. Worth tracking grade-distribution
  over the first 10-20 demos to spot drift.
