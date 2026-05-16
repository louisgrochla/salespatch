# qa-visual — PR-A foundation hardening (renderer + schema + drift test)

First of the implementation plan's 10 PRs (see
`apps/nerve/scripts/qa-visual-IMPLEMENTATION-PLAN.md`). Stacks on PR #93
(visual-QA spike) — does not merge until #93 lands first.

## What changed

- `apps/nerve/scripts/qa-visual-render.ts` (in-repo) — substantially
  rewritten. Wait strategy is now `waitUntil:"networkidle"` plus
  `document.fonts.ready` plus a 200ms paint-settle grace, replacing the
  fragile fixed 1.2s timeout. Captures TWO viewports per run: mobile
  (375×812, 2× scale, real iPhone UA — unchanged from spike) and a new
  desktop pair (1280×800). Writes `render-result.json` with timings,
  paths, byte sizes, and viewport metadata so callers can probe outcome
  without parsing stderr.
- `apps/nerve/scripts/qa-visual-prompts.ts` (in-repo) — gains Zod-backed
  runtime schemas mirroring every TS interface. New export:
  `validateVisualQaResult(input): {valid: true; data} | {valid: false;
  errors[]}`. Cross-field invariants enforced:
  `bug_count === bugs.length`, `has_critical` iff any bug has
  `severity=critical`. Compile-time `_typeParity` guards catch drift
  between hand-written interfaces and Zod-inferred shapes via TS
  structural typing.
- `apps/nerve/scripts/qa-visual-prompts.md` (in-repo) — new "Runtime
  validation" section + references to `BrandDimensionGrade` and
  `validateVisualQaResult` so the drift test passes.
- `apps/nerve/scripts/qa-visual.ts` (in-repo) — imports the validator;
  calls it before `writeFileSync` of `qa-visual-result.json`. Refuses
  to write a known-invalid file with `process.exit(2)` and named-field
  error messages.
- `apps/nerve/scripts/qa-visual-drift-test.ts` (in-repo) — NEW. Cheap
  grep-based check: every required public symbol from
  `qa-visual-prompts.ts` is also referenced in `qa-visual-prompts.md`.
  Catches the "added a constant to one file but not the other"
  drift class.
- `package.json` (root) — new npm script `qa-visual:drift-test` wired
  into the existing `verify` chain so `npm run verify` runs typecheck +
  build + drift-test + tests.
- `~/.claude/commands/build-demo.md` (user-level, not in repo) — added
  a `[ -f "$RENDER_SCRIPT" ]` guard around the Visual-QA stage that
  exits the stage cleanly with `"Visual-QA: skipped (script missing)"`
  if the script doesn't exist (fixes the workflow trap of running the
  skill from `main` before this PR merges). Added a paragraph in Step 4
  documenting `validateVisualQaResult` and the cross-field invariants
  for the manual flow.

## Why

The audit (`apps/nerve/scripts/qa-visual-AUDIT.md`) surfaced four
foundation gaps the spike shipped with:

1. **Workflow trap (A1)**: running `/build-demo` from a branch missing
   `qa-visual-render.ts` silently 0-byte's the render. Skill text now
   guards explicitly.

2. **Renderer fragility (C3)**: the fixed 1.2s `waitForTimeout` was
   network-flaky — fonts loaded over a flaky connection produced
   semi-rendered hero crops where the model couldn't read text reliably.
   `networkidle` + `document.fonts.ready` is deterministic.

3. **Single-viewport blind spot (A8)**: many owners pull out a laptop
   after the rep pitch lands. Demos that work at 375 may break at 1280
   — currently impossible to know without manually opening the file.
   Desktop capture closes the loop.

4. **No schema validation at write time (audit code-finding 8)**: the
   manual flow composes `qa-visual-result.json` by hand. The shape is
   easy to get wrong; cross-field invariants like
   `bug_count === bugs.length` are easy to forget. Zod-backed validator
   catches both shape drift and invariant drift at the producer, with
   named-field errors.

5. **No drift test (audit code-finding 7)**: the contract that the
   `.ts` and `.md` agree on the public surface is currently
   handshake-only. A future contributor who adds a constant to one
   without the other silently breaks the manual flow's spec
   compliance. Grep-based drift test now enforces.

All five are closed by this PR. Implementation plan classifies these as
Phase 1 (Foundation) — everything subsequent depends on a reliable
pipeline, so this had to ship first.

## Stack

- TypeScript + Playwright (already in repo). No new runtime deps.
- Zod (already in `apps/nerve/node_modules` per the schema work for the
  ingest endpoints). Imported into `qa-visual-prompts.ts` for schema
  definition.
- tsx (already a root devDep) used for the drift-test runner.

## Integrations

- No new external integrations.
- Existing integrations preserved: skill-text manual flow consumes the
  same prompts + schema; SDK runner (`qa-visual.ts`, dormant) uses the
  validator before write; future NERVE `/api/ingest/qa-visual-result`
  route can rely on the producer having validated.

## How to verify

1. Type-check:
   ```bash
   cd ~/Desktop/klaude-repo
   npx tsc --noEmit --strict apps/nerve/scripts/qa-visual-prompts.ts \
     apps/nerve/scripts/qa-visual-render.ts \
     apps/nerve/scripts/qa-visual.ts \
     apps/nerve/scripts/qa-visual-drift-test.ts
   ```
   Expect zero output.

2. Drift test (positive):
   ```bash
   npm run qa-visual:drift-test
   ```
   Expect `OK — all 12 required symbols present in both files`.

3. Drift test (negative — temporary corruption to verify it catches):
   ```bash
   sed -i.bak 's/BugFinding/BugXXX/g' apps/nerve/scripts/qa-visual-prompts.md
   npm run qa-visual:drift-test ; echo "exit=$?"
   mv apps/nerve/scripts/qa-visual-prompts.md.bak apps/nerve/scripts/qa-visual-prompts.md
   ```
   Expect `DRIFT DETECTED` with `BugFinding` listed as missing, exit=1.

4. Renderer end-to-end on any cohort demo:
   ```bash
   npx tsx apps/nerve/scripts/qa-visual-render.ts \
     ~/Desktop/salespatch-demos/the-bouquet-bar/outputs/demo.html
   ```
   Expect `.qa-visual/` directory containing `hero.png`, `full.png`,
   `desktop-hero.png`, `desktop-full.png`, and `render-result.json`.

5. Schema validator (positive + negative): the validation logic was
   exercised in-PR against the existing Bouquet Bar
   `qa-visual-result.json`. The existing file validates cleanly;
   deliberate violations (wrong `bug_count`, missing field, bad enum,
   inconsistent `has_critical`) all return named-field errors.

## Known issues

- The drift test only checks PRESENCE of identifiers. Semantic drift
  (e.g. severity rubric in `.ts` differs in meaning from `.md`) is not
  caught. The compile-time `_typeParity` guard in
  `qa-visual-prompts.ts` catches TS-shape drift; this test catches
  identifier drift. Semantic drift is review-time only — flagged as a
  future enhancement.
- The validator's `ran_at` check uses `z.string().datetime()` which
  requires strict ISO 8601 with `T` separator and `Z` or `±HH:MM`
  offset. Producers that emit other date formats will be rejected —
  intentional, but worth knowing.
- Desktop render adds ~1.5s per run. Acceptable but the user-facing
  `/build-demo` skill spends an extra few seconds on the visual-QA
  stage. Not user-visible in the chat output but worth noting.
- Stacks on PR #93. Cannot merge until #93 lands first because the
  in-repo scripts only exist on the spike branch.
