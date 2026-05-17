# qa-visual — PR-C Layer 4 voice + Layer 5 customer + Layer 6 section grading

Third of the 10 PRs from `qa-visual-IMPLEMENTATION-PLAN.md`. Closes the
"below-the-fold under-graded" (audit A5) and "voice drift unchecked"
(audit A7) gaps; adds a customer-perspective signal that complements
the owner-reaction layer.

## What changed

- `apps/nerve/scripts/qa-visual-render.ts` — extends the renderer with
  per-section slicing. New `captureSections` helper finds every
  `<section>`, `<footer>`, and `<main > div>` element with meaningful
  bounding box, sanitises its id-or-first-heading into a label, and
  captures each via element-handle screenshots (auto-scrolls to bring
  below-the-fold sections into view; `page.screenshot({clip})` would
  silently fail on anything outside the current viewport). Output:
  `<out_dir>/sections/section-NN-<label>.png` plus a `sections[]`
  array in `render-result.json`.
- `apps/nerve/scripts/qa-visual-prompts.ts` — adds three new
  SYSTEM_PROMPTs and user-message builders:
  - `VOICE_CONSISTENCY_SYSTEM_PROMPT` +
    `buildVoiceConsistencyUserMessage` — Layer 4: grades preservation
    of the brief's `voice_quotes[]` and detects build-inserted voice
    drift (welcome-openers, marketing-mush vocab).
  - `CUSTOMER_REACTION_SYSTEM_PROMPT` +
    `buildCustomerReactionUserMessage` — Layer 5: role-plays a UK
    consumer who landed from a Google search. Different signal from
    owner-reaction (Layer 3) — "should I trust this?" vs "is this me?".
  - `SECTION_GRADING_SYSTEM_PROMPT` +
    `buildSectionGradingUserMessage` — Layer 6: per-section design
    rhythm + brand consistency grading 1-5, one note per section.
  - Three new TS interfaces (`VoiceConsistencyResult`,
    `CustomerReaction`, `SectionGrade`) plus three Zod schemas with
    matching parity guards.
  - `VisualQaResult` extended with REQUIRED fields:
    `voice_consistency`, `customer_reaction`, `section_grades`.
- `apps/nerve/scripts/qa-visual-prompts.md` — mirrors all of the
  above. New Layer 4 / 5 / 6 sections, updated canonical-result block,
  updated runtime-validation list, and a callout that pre-PR-C v1
  result files won't validate against the new schema.
- `apps/nerve/scripts/qa-visual.ts` — extends the SDK runner to make
  three new vision calls (Layers 4, 5, 6) after the existing three.
  `loadContext` now reads `voice_quotes[]` (prefers brand-analysis,
  falls back to brief) and `vertical`. Layer 6 reads the per-section
  slices from the renderer's output and sends them as additional
  images to the vision call (one batch of N images, not N calls).
  `callVision` was refactored to accept an `imageB64s` array rather
  than fixed hero/full pair so Layer 6 can pass section slices.
  `max_tokens` bumped from 2000 to 3500 for the larger layer outputs.
- `apps/nerve/scripts/qa-visual-drift-test.ts` — required-symbols list
  grows from 13 to 22 (3 new prompts, 3 new builders, 3 new
  interfaces). All 22 symbols present in both `.ts` and `.md`.
- `~/.claude/commands/build-demo.md` (user-level skill, not in repo) —
  Step 3 now documents six layers instead of three. Canonical result
  block gains the three new top-level fields. Output Format line
  updated with new stderr summary format including `voice`, `customer`,
  `trust`, `sections` figures.

## Why

The audit (`apps/nerve/scripts/qa-visual-AUDIT.md`) identified three
gaps the v1 spike's three-layer pass didn't cover:

- **A5 — below-the-fold under-graded**: both PNGs sent to every layer
  but prompts are hero-biased. Lookbook tile rhythm, About section
  copy density, footer balance — all hand-waved. Layer 6 fixes this
  by splitting the page into semantic sections and grading each
  individually so a weak About doesn't hide behind a strong hero.
- **A7 — voice drift unchecked**: Layer 2 grades fonts but not whether
  the rendered *words* preserve the brief's verbatim language. The
  build can drop "DM to contact or enquire 🩷" and replace it with
  "Welcome to The Bouquet Bar" without Layer 2 flagging anything.
  Layer 4 closes this gap by injecting the brief's `voice_quotes[]`
  and grading quote-by-quote preservation + drift detection.
- **Customer perspective missing** (audit proposal 8): Layer 3 plays
  the owner. The owner already trusts themselves — a demo can land
  high on owner-recognition while still bouncing search-traffic
  customers who land cold from Google. Layer 5 closes this by
  role-playing the customer with no prior context.

The renderer extension was an enabling prerequisite: without per-section
slices, Layer 6 would have to ask the model to re-locate sections in
the full-page screenshot every call. Cheap to do once at render time;
expensive (and unreliable) to do six times at vision time.

## Stack

- TypeScript + Playwright + Anthropic SDK (all already in repo, no
  new deps).
- Per-section slicing uses Playwright element-handle screenshots
  (auto-scrolls). The previous implementation tried
  `page.screenshot({clip: {x, y, width, height}})` which only works
  for content visible in the current viewport — sections below the
  fold silently failed. Element-handle scrolls into view first.
- The page.evaluate callback that finds section elements is written
  closure-free (no helper functions, no const arrow declarations) so
  tsx's `__name` decoration doesn't break browser-side execution.

## Integrations

- Per-section slices land at `outputs/.qa-visual/sections/`. The list
  appears in `render-result.json.sections[]`.
- SDK runner reads `brand-analysis.json` for `voice_quotes` (Layer 4
  input) and `brief.json` for `vertical` (Layer 5 input). Both fall
  through cleanly when missing.
- `voice_consistency`, `customer_reaction`, `section_grades` are
  REQUIRED on the canonical `VisualQaResult`. Pre-PR-C v1 result
  files fail validation; re-run the visual-QA pass to refresh.
- NERVE ingest endpoint is still not built (PR-E pending); 404 from
  the helper surfaces cleanly per existing skill text.
- Cost — SDK runner now makes 6 Haiku 4.5 vision calls per demo
  instead of 3, plus the section-grading call sends N images instead
  of 2. Per-demo cost rises from ~£0.005 to ~£0.02. Trivial vs the
  £350 sale; flagged for the autumn budgeting decision.

## How to verify

1. Type-check + drift test:
   ```bash
   cd ~/Desktop/klaude-repo
   npx tsc --noEmit --strict apps/nerve/scripts/qa-visual-*.ts
   npm run qa-visual:drift-test
   ```
   Expect zero tsc output; drift-test reports
   `OK — all 22 required symbols present in both files`.

2. Renderer end-to-end with per-section slicing:
   ```bash
   rm -rf ~/Desktop/salespatch-demos/the-bouquet-bar/outputs/.qa-visual
   npx tsx apps/nerve/scripts/qa-visual-render.ts \
     ~/Desktop/salespatch-demos/the-bouquet-bar/outputs/demo.html
   ```
   Expect 9 section PNGs (hero, enquire, what-i-make, lookbook,
   proof, how, about, visit, footer) in `.qa-visual/sections/` and
   a `sections[]` array of length 9 in `render-result.json`. Total
   render time ~6s (mobile + desktop + 9 section slices).

3. Schema validator: smoke-tested in-PR with five cases — full PR-C
   shape passes; missing required field, bad enum, out-of-range
   grade, and pre-PR-C v1 result all fail with named-field errors.

## Known issues

- Per-section labels are derived from `id` OR first `<h2>/<h3>` text,
  fallback to tag name. One Bouquet Bar section ends up labelled
  "section" because its `<section class="proof">` lacks an id and
  the first heading is "100%" (which sanitises to nothing). Doesn't
  affect grading — the slice still goes through Layer 6 — but the
  filename is less readable. Future refinement: prefer class names
  when id is absent.
- Existing pre-PR-C `qa-visual-result.json` files (the v1 spike's
  outputs) will fail validation against the new schema. Documented
  in the .md callout; resolves on re-run.
- Per-photo grading (audit A6) is NOT in this PR — deferred to PR-H
  per the implementation plan. Section grading is the higher-leverage
  below-the-fold win because it catches design-rhythm failures the
  per-photo grade can't see.
- Customer-reaction prompt depends on a usable `vertical` string from
  the brief. Most leads have it; a few briefs leave it null. The
  prompt falls back to `business_type` in that case, which produces
  slightly less natural search-query phrasing but still works.
- Section slicing adds ~1.5s to render time. Acceptable. If it grows
  with very long demos a fast-mode flag (skip below-the-fold sections
  beyond N) can be added.
