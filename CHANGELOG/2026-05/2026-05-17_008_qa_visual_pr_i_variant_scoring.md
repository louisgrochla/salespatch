# qa-visual — PR-I A/B variant scoring + selector

Ninth of the 10 PRs from `qa-visual-IMPLEMENTATION-PLAN.md`. Adds
opt-in A/B-style hero variants to `/build-demo` and a deterministic
selector script that picks the highest-scoring variant by a
documented composite formula. The skill ships the winner; the loser
breakdowns land in `variant-selection.json` for warehouse learning.

## What changed

- `apps/nerve/scripts/qa-visual-variant-selector.ts` (NEW) — pure
  scoring + selection script. Discovers variants under
  `outputs/variants/<LABEL>/`, validates each `qa-visual-result.json`
  against the canonical Zod schema, computes per-variant composite
  scores, applies a hard-gate on critical bugs, writes the result
  to `variant-selection.json`. Exit code 0 always — no variants
  found is a stderr-only message, not a failure.
- `~/.claude/commands/build-demo.md` (user-level, not in repo) —
  new "Variant mode (PR-I — opt-in)" section between the photo
  embedding instructions and section construction rules.
  Documents the three v1 strategies (text-on-solid / text-beside-
  photo / text-over-photo), the file layout
  (`outputs/variants/<LABEL>/`), the selector invocation, the
  winner-copy step, the scoring formula, the hard-gate behaviour,
  and when to use vs skip variant mode.

## Why

Audit proposal 13: "currently one demo per brief, no iteration on
the hero where 80% of conversion lives." Variant mode lets the
build pay 3× build effort + 3× QA cost ONCE to ship a measurably
stronger demo on visual-trust-led briefs (florist / photographer /
cake-maker / hospitality verticals where the hero IS the pitch).

The selector is deterministic + auditable so:
1. The skill doesn't have to make subjective "which variant is
   best" calls — it follows the formula.
2. The warehouse can learn from the per-variant breakdown ("for
   vertical=florist, Variant B beats A by 0.4 on average; for
   vertical=barber, Variant C wins").
3. Re-running the selector on the same inputs always produces the
   same winner. Reproducible builds.

## Stack

- TypeScript, Anthropic SDK not required (selector is pure
  scoring — no vision calls of its own).
- Reuses `validateVisualQaResult` from `qa-visual-prompts.ts` to
  guard against malformed variant results poisoning the comparison.
- Pure data + math; no schema changes to the canonical
  `VisualQaResult` (the variant audit trail lives in its own
  sidecar file).

## Composite formula

All components normalised to 0-5 scale before weighted combination:

| Component | Weight |
|---|---|
| `brand_fidelity.overall_grade` | 35% |
| mean of `section_grades` grades | 25% |
| `voice_consistency.overall_grade` | 15% |
| `owner_reaction.would_buy` (yes=5, maybe=3, no=1) | 10% |
| `customer_reaction.would_act` (yes=5, maybe=3, no=1) | 10% |
| `owner_reaction.test_of_success_passes` (true=5, false=1) | 5% |

Weights sum to 100%. Final score on 0-5 scale.

**Baseline-aware (PR-G):** when the variant's result carries
`baseline_comparison` with `baselines_available: true`, each
above-baseline dimension adds +0.5 and each below-baseline
subtracts -0.5, capped at ±1.5. Variants that beat the vertical
cohort win tiebreakers against same-absolute-score variants that
don't.

**Failed layers handled gracefully:** components default to a
neutral 3.0 when the corresponding layer is null. Penalising
failed layers too hard would tilt selection toward "no layer
failures" rather than "best demo"; neutral keeps the comparison
about positive signal.

## Hard-gate behaviour

Variants with `has_critical: true` are disqualified unless every
variant has criticals. In the hard-gate-bypass case (all variants
critical), the picker falls back to fewest-criticals and the
result records `hard_gate_bypassed: true`. The skill text
escalates this to the human — auto-shipping a critical-bug demo
is a last resort, not a default.

## Integrations

- Reads: `outputs/variants/<LABEL>/demo.html` +
  `outputs/variants/<LABEL>/qa-visual-result.json` per variant.
- Writes: `outputs/variant-selection.json` (audit trail).
- Skill copies winner to `outputs/demo.html` +
  `outputs/qa-visual-result.json` so downstream stages
  (`lead-json`, demo-artefact ingest, autofix loop) work unchanged.

## How to verify

1. **Type-check:**
   ```bash
   cd ~/Desktop/klaude-repo
   npx tsc --noEmit --strict apps/nerve/scripts/qa-visual-variant-selector.ts apps/nerve/scripts/qa-visual-prompts.ts
   ```
   Zero output.

2. **Smoke test (exercised in-PR):**
   - Scenario 1 (normal): 3 variants, one has critical bug. Highest
     non-critical variant wins (score 5.00). Critical disqualified.
     Third rejected for lower score. ✓
   - Scenario 2 (hard-gate bypass): 2 variants, both have criticals.
     Fewer-criticals wins; `hard_gate_bypassed: true` in result. ✓

3. **End-to-end** (requires the build to produce 3 variants —
   skill-text driven):
   - Run `/build-demo` with variant mode requested
   - Confirm `outputs/variants/A|B|C/{demo.html, qa-visual-result.json}` produced
   - Confirm `outputs/variant-selection.json` written + winner copied to `outputs/demo.html`

## Known issues

- Variant generation lives in the build-demo skill prompts, not in
  this PR. The skill text describes the three strategies but the
  ACTUAL prompts that produce three structurally different heroes
  haven't been added to the build instructions yet. That's a
  follow-up — designing distinct hero patterns is its own task and
  PR-I's scope is the selector + orchestration spec.
- No NERVE ingest for `variant-selection.json` yet. The audit
  trail lives locally; "which variants win for vertical=X" queries
  need a future ingest route + Prisma model. Skip until variant
  mode has been used on ≥ 5 demos and we know what fields the
  warehouse needs.
- Composite weights are hardcoded constants in
  `qa-visual-variant-selector.ts`. Tuning them per-vertical (e.g.
  weighting `customer_reaction` higher for search-traffic verticals
  like florist than for foot-traffic verticals like café) is a
  future enhancement once cohort data justifies it.
- Hard-gate bypass is automatic — the skill text says to escalate
  to a human but there's no machine-enforced "block ship". A
  future hardening could refuse to copy a bypass winner to
  `outputs/demo.html` and require an explicit human override.
- Selector doesn't currently propagate the variant label into the
  warehouse-ingested artefact metadata. A demo built via variant
  mode and a demo built normally look identical to NERVE post-
  selection. Could attach `metadata.variant_label` to the artefact
  ingest in a follow-up.

## Roadmap state

**9 of 10 PRs shipped.** Remaining:
- **PR-J** — competitor comparison render (the last leverage PR)
