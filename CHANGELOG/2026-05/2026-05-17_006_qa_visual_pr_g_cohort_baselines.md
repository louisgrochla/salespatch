# qa-visual — PR-G cohort baselines + relative grading

Seventh of the 10 PRs from `qa-visual-IMPLEMENTATION-PLAN.md`. Turns
visual-QA grades from absolute scores into cohort-relative readings.
Now that PR-E ingest is live and the warehouse has rows to aggregate,
every new demo gets a per-dimension comparison against the vertical's
cohort median.

## What changed

- `apps/nerve/scripts/qa-visual-prompts.ts`:
  - NEW interfaces `BaselineComparison` / `BaselineDimensionComparison`
    / `BaselineCohortRates`.
  - NEW const `BASELINE_DRIFT_THRESHOLD = 0.5` — the gap below which
    a dimension is flagged below-baseline. Single-grade-integer-gap
    is meaningful; floating noise within ±0.5 isn't.
  - `VisualQaResult` gains optional `baseline_comparison?: BaselineComparison`
    field — absent on pre-PR-G producers; present (possibly empty-
    shape) on PR-G+ producers.
  - Three new Zod schemas + cross-field refine: `baselines_available:
    true` REQUIRES `cohort_rates !== null`; `false` REQUIRES empty
    `dimensions` AND null `cohort_rates`. Compile-time `_typeParity`
    guards confirm Zod ↔ interface match.
- `apps/nerve/src/lib/sl-mas/qaVisualResultStore.ts`:
  - NEW `computeBaselines(vertical)` method. Single Postgres query
    using `percentile_cont(0.5)` for medians and `FILTER (WHERE …)`
    for rate counters. JOIN to `demo_artefacts` for vertical
    (matches `qaResultStore.byOutcome` pattern).
  - NEW exported `BaselineSummary` interface — what the read
    endpoint returns.
- `apps/nerve/src/app/api/read/qa-visual/baselines/route.ts` (NEW):
  GET `?vertical=<X>` returns `BaselineSummary`. Vertical optional
  (vertical-agnostic when omitted). Read-only — no HMAC, founder-
  session middleware applies per the `(app)` layout. Below n=10:
  returns `baselines_available: false` with a `sample_size_warning`.
- `apps/nerve/scripts/qa-visual.ts`:
  - NEW `fetchBaselineSummary(vertical)` — pre-fetches the cohort
    baseline at the start of each run. Read-only HTTP GET. Returns
    null on any failure; composer treats null as "no cohort yet".
  - NEW `composeBaselineComparison({vertical, baselineSummary,
    thisBrandFidelity, thisVoiceConsistency, thisSectionGrades})`
    — pure function. Always emits a `BaselineComparison` (possibly
    empty-shape) so downstream queries can distinguish "no cohort
    yet" from "pre-PR-G producer".
  - Result composition gains `baseline_comparison: composeBaselineComparison(…)`.
  - Stderr summary line gains `baselines=on_par(n=15)` /
    `baselines=below(n=15)[brand_fidelity,voice_consistency]` /
    `baselines=n/a(n=3)` suffix.
- `apps/nerve/scripts/qa-visual-prompts.md`:
  - New "Schema bump in PR-G" callout.
  - New "Cohort baselines (PR-G)" section documenting the shape,
    drift threshold, network-failure semantics, and below-n=10
    handling.
  - Canonical-result block gains `baseline_comparison` row.
- `apps/nerve/scripts/qa-visual-drift-test.ts`:
  - `REQUIRED_SYMBOLS` grows 24 → 29: `baseline_comparison`,
    `BaselineComparison`, `BaselineDimensionComparison`,
    `BaselineCohortRates`, `BASELINE_DRIFT_THRESHOLD`.
- `~/.claude/commands/build-demo.md` (user-level, not in repo):
  - New "Step 1.6 — fetch cohort baselines" step (after dynamic
    scan, before reading PNGs).
  - Step 4 canonical-result block gains the full
    `baseline_comparison` shape + composition rules.
  - Output Format line 4 gains the `baselines=` suffix format.

## Why

Visual-QA grades have always been absolute — "brand_fidelity 4/5"
tells you the brief's brand decode landed mostly well in isolation,
but doesn't tell you whether THIS demo's 4/5 is above or below
typical for the vertical. After PR-E shipped the ingest, the
warehouse started accumulating rows. PR-G turns those rows into
per-dimension medians the producer can compare against in real time.

Cohort-relative grading matters most in two cases:
1. **Spotting regression demos** — a 4.0 brand-fidelity on a vertical
   where the median is 4.5 is a quiet failure the absolute grade
   would miss.
2. **Building rep confidence** — when the demo lands above cohort
   median, the chat output says so explicitly. The rep walks into
   the shop knowing this build is stronger than typical.

The implementation is intentionally minimal: 3 graded dimensions
(brand_fidelity, voice_consistency, section_grades_mean), one rate
block (5 percentages), one drift threshold (0.5). Adding more
dimensions or per-cohort-rate flags is a follow-up.

## Stack

- TypeScript + Prisma + Next.js 14 App Router (existing stack)
- Postgres `percentile_cont(0.5) WITHIN GROUP` for medians +
  `FILTER (WHERE …)` for rate counters — single query, no
  application-side aggregation
- Zod schemas + cross-field refine + compile-time parity guards

## Integrations

- New read endpoint: `GET /api/read/qa-visual/baselines?vertical=X`
- Producer pre-fetch: `qa-visual.ts` and the manual `/build-demo`
  flow both call the endpoint at the start of a run
- Canonical result schema: `baseline_comparison` is OPTIONAL —
  pre-PR-G results validate unchanged. PR-G producers always emit
  the field; pre-PR-G producers don't.
- NERVE ingest accepts the field via the existing
  `/api/ingest/qa-visual-result` route — the route's hand-rolled
  validator was already permissive on optional fields, so no route
  changes were needed (the producer-side Zod validator is the
  enforcement point).

## How to verify

1. **Type-check + drift test:**
   ```bash
   cd ~/Desktop/klaude-repo
   npx tsc --noEmit --strict apps/nerve/scripts/qa-visual-*.ts
   npm run qa-visual:drift-test
   ```
   Zero tsc output; drift-test reports 29/29 symbols.

2. **Schema validator smoke test (in-PR):**
   - No baseline_comparison → valid (backward-compat)
   - baselines_available: false + empty dimensions + null rates → valid
   - Full available → valid
   - available + null cohort_rates → cross-field rejection
   - unavailable + non-empty dimensions → cross-field rejection
   - null this_grade → below_baseline must be null → valid

3. **Route smoke test (post-deploy):**
   ```bash
   curl 'https://nerve.salespatch.co.uk/api/read/qa-visual/baselines?vertical=retail'
   ```
   Until backfill catches up to n=10 per vertical, expect
   `baselines_available: false`. After that, expect numeric medians
   and percentages.

4. **End-to-end (when API key + cohort data are present):**
   - Run `qa-visual.ts` against a fresh demo
   - Verify `outputs/qa-visual-result.json.baseline_comparison`
     populated with cohort medians
   - Verify chat output line includes `baselines=on_par(n=N)` or
     `baselines=below(n=N)[...]`

## Known issues

- Below n=10 the medians are noise — endpoint correctly returns
  `baselines_available: false`. Until the warehouse accumulates ≥10
  rows per vertical (currently only `retail` has any visual-QA
  results at all, from the Bouquet Bar PR-A smoke test), every
  comparison will be empty-shape. This is the cold-start problem
  the implementation plan flagged; PR-G ships the infrastructure
  so the moment cohort data exists, comparisons activate.
- `section_grades_mean` is computed by averaging the grades inside
  each run's `section_grades` JSONB array, then taking the median
  across runs. Median-of-means rather than mean-of-medians; both
  approaches have tradeoffs and this one was chosen for the cheaper
  SQL.
- Drift threshold 0.5 is constant — same gap matters less for some
  dimensions than others (a 0.5 drop on a 4.8 median is
  proportionally smaller than on a 3.0 median). Future enhancement:
  per-dimension thresholds, or dynamic thresholds based on cohort
  variance.
- Pre-fetch is per-run (HTTP GET at the start of every visual-QA
  pass). For a busy producer, caching the baseline summary for a
  few minutes would cut latency; not needed at current volumes.
- `vertical` filter requires the JOIN to succeed — if a demo
  artefact wasn't ingested (artefactId null on the qa_visual_results
  row), it gets excluded from the cohort. Soft FK by design;
  vertical-tagged cohorts will skew toward artefacts that landed
  through the full pipeline.
- The `baseline_comparison` field is absent on pre-PR-G results.
  Backfilling them would require re-running visual QA against
  every prior demo; the cost (~£0.02 × cohort size with the SDK
  runner active) is small but the benefit is marginal at current
  volumes. Skip for now.
