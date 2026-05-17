# qa-visual — PR-J competitor comparison render

Tenth and final PR from `qa-visual-IMPLEMENTATION-PLAN.md`. Adds
opt-in competitor comparison: renders the top N competitor sites
for the lead's vertical at the same mobile viewport this demo was
scored at, runs a comparative-trust vision call, returns a ranked
output with a door-ready takeaway the rep can quote.

## What changed

- `apps/nerve/scripts/qa-visual-prompts.ts`:
  - NEW interfaces `CompetitorEntry` + `CompetitorCompareResult`
    with per-entry trust rating + rank + per-entry "why" line +
    rendered/failed status.
  - NEW `COMPETITOR_COMPARE_SYSTEM_PROMPT` — comparative-trust
    judgement from a UK customer's first-impression perspective.
    Vision sees N+1 mobile screenshots, rates each on
    trust-at-glance 1-5, ranks them, writes one-line door-ready
    takeaway.
  - NEW `buildCompetitorCompareUserMessage({thisDemoName, entries})`
    — lists every entry with rendered/failed status so the model
    knows what's coming among the screenshots. Failed renders are
    still listed (so the model can mention them in `notes`) but no
    image is sent for them.
  - `VisualQaResult` gains optional + nullable
    `competitor_comparison?: CompetitorCompareResult | null`.
    Same three-state pattern as `photo_quality`: absent /
    null (vision call failed) / populated.
  - NEW Zod schemas with four cross-field invariants:
    - Exactly one entry must have `is_this_demo: true`
    - `rendered: true` requires trust + rank set + null reason;
      `rendered: false` requires reason set + null trust + null rank
    - `ranked_total` equals count of rendered entries
    - `this_demo_rank` matches the rank of the `is_this_demo` entry
- `apps/nerve/scripts/qa-visual-competitors.ts` (NEW):
  - Reads `outputs/competitors.json` (written by the spec-site-brief
    skill in Phase 1 verify).
  - Renders each competitor URL with Playwright at 375×812 (15s
    timeout, 600ms paint-settle, 5-competitor cap). Per-URL failure
    isolation — login walls / 4xx / timeouts / network errors land
    as `rendered: false` with a `render_failure_reason`; the
    comparison still proceeds with the rendered subset.
  - Reads this demo's `hero.png` from the existing render output.
  - Sends N+1 images (this demo + rendered competitors) in one
    vision call with positional alignment.
  - Writes `outputs/qa-visual-competitor-comparison.json` sidecar.
  - Non-destructively patches `outputs/qa-visual-result.json` to
    attach the result as `competitor_comparison` (validates the
    patched result against the canonical schema before writing
    — invalid patches surface a WARN and the sidecar is the only
    durable output).
- `apps/nerve/scripts/qa-visual-prompts.md`:
  - New "Schema bump in PR-J" callout.
  - New "Competitor comparison (PR-J — opt-in)" section covering
    the trigger, manifest shape, failure isolation,
    `MAX_COMPETITORS = 5` cap, output shape, cross-field invariants,
    and the takeaway field as door-ready prose.
  - Canonical-result block gains `competitor_comparison` row.
- `apps/nerve/scripts/qa-visual-drift-test.ts`:
  - `REQUIRED_SYMBOLS` grows 34 → 39: `competitor_comparison`,
    `CompetitorCompareResult`, `CompetitorEntry`,
    `COMPETITOR_COMPARE_SYSTEM_PROMPT`,
    `buildCompetitorCompareUserMessage`.
- `~/.claude/commands/build-demo.md` (user-level, not in repo):
  - New "Step 1.8 — (opt-in) competitor comparison (PR-J)" between
    Step 1.7 (photo quality) and Step 2 (Read PNGs). Activates on
    `outputs/competitors.json` presence + available API key.
  - Canonical-result block gains `competitor_comparison` shape.
  - Output Format line 4 gains `vs_competitors=#<rank>/<total>`
    suffix; spec adds an instruction to surface the `takeaway`
    line separately as door-ready prose.
- `~/.claude/skills/spec-site-brief/SKILL.md` (user-level,
  not in repo):
  - Phase 1 verify gains "Capture top competitors (PR-J)" sub-step.
    Documents writing `competitors.json` with 3-5 entries, picking
    real businesses that would appear on page 1 of a Google search
    for the vertical+area, and the skip-entirely rule for when no
    real competitors surface (mobile-only operators with no local
    SEO context).

## Why

Audit proposal 15: visual QA judges each demo in isolation; no
competitive proof point. A demo that scores well in isolation might
still be the weakest option a customer sees when they Google
"[vertical] [neighbourhood]". The rep walks into the shop with no
data on whether THIS demo would close vs the customer's other
options.

PR-J renders those other options at the same viewport and rates
them on the same scale. The output is a rank (#2 of 4) plus a
door-ready takeaway. When this demo ranks #1, the rep leans into
it. When it ranks last, the rep knows to lead with brief-led
diagnosis instead of comparison-led proof.

The implementation is conservative: per-URL failure isolation, hard
cap on competitors (5), 15s render timeout per URL. Login walls and
network errors don't break the comparison — they just become
`rendered: false` entries that get mentioned in the cohort `notes`.

## Stack

- Playwright (existing) + Anthropic SDK (existing). No new deps.
- One vision call, N+1 images. At Haiku 4.5 pricing for ~6 images
  per call: ~£0.03/run. Trivial vs £350 sale.
- Reuses the canonical schema's optional + nullable pattern (same
  three-state semantics as `photo_quality` from PR-H).

## Integrations

- Input: `outputs/competitors.json` (written by spec-site-brief
  skill's Phase 1 verify step).
- Side output: `.qa-visual/competitors/<slug>.png` per competitor.
- Sidecar: `outputs/qa-visual-competitor-comparison.json`.
- Canonical-result patch: `outputs/qa-visual-result.json` gains
  `competitor_comparison`. NERVE ingest then carries the comparison
  alongside the rest of the visual-QA result unchanged (the
  `/api/ingest/qa-visual-result` route + the route's hand-rolled
  validator both treat optional fields as permissive — no route
  changes needed).

## How to verify

1. **Type-check + drift test:**
   ```bash
   cd ~/Desktop/klaude-repo
   npx tsc --noEmit --strict apps/nerve/scripts/qa-visual-*.ts
   npm run qa-visual:drift-test
   ```
   Zero tsc output; drift-test reports **all 39 required symbols
   present in both files**.

2. **Schema smoke test (exercised in-PR with 7 cases):**
   - competitor_comparison absent → valid (backward-compat) ✓
   - Full success with 3 ranked competitors → valid ✓
   - One competitor failed to render → valid (only rendered counted) ✓
   - rendered=false + trust_at_glance set → cross-field rejection ✓
   - Zero is_this_demo entries → cross-field rejection ✓
   - ranked_total mismatches rendered count → cross-field rejection ✓
   - this_demo_rank doesn't match the is_this_demo entry's rank → cross-field rejection ✓

3. **End-to-end (when API key + a real lead with competitor URLs
   captured):**
   - Run `qa-visual-render.ts` on a built demo first
   - Write `outputs/competitors.json` per the manifest shape
   - Run `qa-visual-competitors.ts <outputs_dir>`
   - Confirm per-competitor PNGs land in
     `.qa-visual/competitors/<slug>.png`, sidecar JSON written,
     canonical result patched with `competitor_comparison`,
     stderr summary surfaces takeaway

## Known issues

- The `name` field on each competitor entry is just what the
  spec-site-brief skill wrote — no normalisation, no dedup. A
  manifest with two entries named "Anastasia Florists" would
  produce two separate ranked rows.
- `MAX_COMPETITORS = 5` is hardcoded. Larger cohorts would dilute
  the per-image attention vision can pay; smaller works fine.
- Some competitor sites use anti-bot measures (Cloudflare, hCaptcha)
  that 4xx the Playwright UA. These land as `rendered: false` with
  an HTTP-status reason. Not a per-PR fix — would need a residential
  proxy or a different scraping approach.
- The cohort comparison is point-in-time. A competitor that
  refreshes their site after the comparison ran isn't re-evaluated.
  For now, ad-hoc re-running the script regenerates the comparison.
- No NERVE-side aggregation yet ("for vertical=florist across all
  competitor comparisons, what's our average rank?"). The data is
  there in `qa_visual_results.competitor_comparison` JSONB; queries
  are a follow-up once enough comparisons exist.
- Vision call lands the rendered competitor screenshots through the
  SDK but the canonical result file then stores the comparison
  without the screenshots themselves. The sidecar paths in
  `.qa-visual/competitors/` are the only durable record of what was
  shown to vision; the warehouse only sees the ranks + rationales,
  not the screenshots.

## Roadmap state

**10 of 10 PRs shipped — the implementation plan is complete.**

Visual-QA coverage:
- 6 always-on layers (bugs, brand fidelity, owner reaction, voice
  consistency, customer reaction, section grading)
- 2 opt-in layers (per-photo quality, competitor comparison)
- Cohort baselines (PR-G)
- Autofix loop (PR-F)
- Partial-result retry/recovery (PR-D)
- NERVE ingest + read endpoints (PR-E)
- A/B variant scoring (PR-I)
- Single-spec dual-implementation contract (manual /build-demo +
  dormant SDK runner producing identical results)

Every audit issue (`apps/nerve/scripts/qa-visual-AUDIT.md`) is now
closed.

Next steps after this PR merges are operational rather than
roadmap: backfill the cohort once enough demos accumulate to make
baselines meaningful (currently retail has n<10), surface the
per-lead visual-QA history in the NERVE founder dashboard, and
start logging which dimensions of the visual-QA result correlate
with closure outcomes in the `lead_assignment_events` stream.
