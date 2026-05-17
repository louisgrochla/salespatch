/**
 * Variant selector for A/B-style build-demo runs.
 *
 * `/build-demo` can optionally produce N hero variants (different
 * positioning approaches: text-on-solid, text-beside-photo, text-over-
 * photo). Each variant gets its own folder with a built `demo.html`
 * and a full visual-QA result. This script reads the lot, scores each
 * variant via a documented composite formula, and picks the winner.
 *
 * Why automated rather than human-picked: the scoring is deterministic
 * and the warehouse needs the per-variant breakdown for cohort
 * learning ("what kinds of hero designs win for vertical=florist?").
 * A future PR can override the picker with human-in-the-loop; the
 * sidecar this script writes is the audit trail either way.
 *
 * Pipeline expectation (orchestrated by the /build-demo skill):
 *
 *   outputs/
 *     variants/
 *       A/  demo.html  qa-visual-result.json
 *       B/  demo.html  qa-visual-result.json
 *       C/  demo.html  qa-visual-result.json
 *     variant-selection.json   <- this script writes here
 *     demo.html                <- skill copies winner here after selection
 *
 * Usage:
 *   npx tsx apps/nerve/scripts/qa-visual-variant-selector.ts \
 *     <outputs_dir>            (assumes variants/ subdirectory)
 *
 * Stdout: JSON matching VariantSelectionResult.
 * Stderr: per-variant score breakdown + winner line.
 * Exit:   0 always (no variants found is reported in stderr, not as a failure).
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { resolve, join, basename } from "node:path";
import {
  validateVisualQaResult,
  type VisualQaResult,
} from "./qa-visual-prompts";

// ─────────────────────────────────────────────────────────────────────
// Wire-format types written to variant-selection.json
// ─────────────────────────────────────────────────────────────────────

export interface VariantScoreBreakdown {
  /** Variant label inferred from folder name. "A" / "B" / "C" / etc. */
  label: string;
  /** Absolute path to this variant's demo.html. */
  demo_path: string;
  /** Absolute path to this variant's qa-visual-result.json. */
  result_path: string;
  /**
   * Hard-gate: variants with critical bugs are disqualified UNLESS every
   * other variant also has criticals (in which case picker falls back
   * to the lowest-critical-count variant).
   */
  has_critical: boolean;
  critical_count: number;
  /** Per-component contribution to the composite. All on 0-5 scale. */
  components: {
    brand_fidelity: number;
    section_grades_mean: number;
    voice_consistency: number;
    owner_reaction: number;
    customer_reaction: number;
    test_of_success: number;
  };
  /** PR-G bonus/penalty: +0.5 per dimension above baseline, -0.5 per dimension below. Null when no baseline data. */
  baseline_adjustment: number | null;
  /** Final composite score on 0-5 scale (component-weighted) + baseline_adjustment. */
  score: number;
  /** Reason this variant was picked (for the winner) or rejected (losers). */
  why: string;
}

export interface VariantSelectionResult {
  selection_id: string;
  outputs_dir: string;
  variants_root: string;
  ran_at: string;
  /** Variants discovered + scored. Sorted descending by score. */
  variants: VariantScoreBreakdown[];
  /** Index in `variants[]` of the picked variant. Null when no variants found. */
  winner_index: number | null;
  /** Convenience: same as variants[winner_index] when winner_index !== null. */
  winner_label: string | null;
  winner_demo_path: string | null;
  winner_score: number | null;
  /** When all variants had criticals, the picker fell back to fewest-criticals. */
  hard_gate_bypassed: boolean;
  /** One-line human summary of the selection. */
  notes: string;
}

// ─────────────────────────────────────────────────────────────────────
// Composite scoring formula
// ─────────────────────────────────────────────────────────────────────
//
// All components are normalised to 0-5 then combined with these weights:
//
//   35% brand_fidelity.overall_grade
//   25% mean(section_grades.grade)
//   15% voice_consistency.overall_grade
//   10% owner_reaction.would_buy   (yes=5, maybe=3, no=1)
//   10% customer_reaction.would_act (yes=5, maybe=3, no=1)
//    5% owner_reaction.test_of_success_passes (true=5, false=1)
//
// Weights sum to 100%. Resulting composite is on 0-5 scale, matching
// every other grade in the QA pipeline so downstream queries can
// compare a variant's score against the cohort baselines unchanged.
//
// Baseline adjustment (PR-G): when the variant's result carries a
// baseline_comparison with baselines_available=true, add +0.5 per
// dimension above the vertical median, subtract 0.5 per dimension
// below. Caps at ±1.5 total to avoid baseline noise dominating.

const WEIGHTS = {
  brand_fidelity: 0.35,
  section_grades_mean: 0.25,
  voice_consistency: 0.15,
  owner_reaction: 0.1,
  customer_reaction: 0.1,
  test_of_success: 0.05,
} as const;
const BASELINE_BONUS = 0.5;
const BASELINE_CAP = 1.5;

function reactionToScore(reaction: "yes" | "maybe" | "no"): number {
  return reaction === "yes" ? 5 : reaction === "maybe" ? 3 : 1;
}

function computeBreakdown(
  label: string,
  demoPath: string,
  resultPath: string,
  result: VisualQaResult,
): VariantScoreBreakdown {
  // Components default to neutral 3.0 when the corresponding layer
  // failed in this variant (null). Penalising failed layers too hard
  // would tilt the selection toward "no layer failures" rather than
  // "best demo"; neutral keeps the comparison about positive signal.
  const brand = result.brand_fidelity?.overall_grade ?? 3.0;
  const sectionMean =
    result.section_grades && result.section_grades.length > 0
      ? result.section_grades.reduce((acc, s) => acc + s.grade, 0) /
        result.section_grades.length
      : 3.0;
  const voice = result.voice_consistency?.overall_grade ?? 3.0;
  const owner = result.owner_reaction
    ? reactionToScore(result.owner_reaction.would_buy)
    : 3.0;
  const customer = result.customer_reaction
    ? reactionToScore(result.customer_reaction.would_act)
    : 3.0;
  const testPass = result.owner_reaction
    ? result.owner_reaction.test_of_success_passes
      ? 5
      : 1
    : 3.0;

  const components = {
    brand_fidelity: brand,
    section_grades_mean: sectionMean,
    voice_consistency: voice,
    owner_reaction: owner,
    customer_reaction: customer,
    test_of_success: testPass,
  };
  const composite =
    components.brand_fidelity * WEIGHTS.brand_fidelity +
    components.section_grades_mean * WEIGHTS.section_grades_mean +
    components.voice_consistency * WEIGHTS.voice_consistency +
    components.owner_reaction * WEIGHTS.owner_reaction +
    components.customer_reaction * WEIGHTS.customer_reaction +
    components.test_of_success * WEIGHTS.test_of_success;

  // Baseline adjustment — only when cohort data is available.
  let baselineAdjustment: number | null = null;
  if (
    result.baseline_comparison &&
    result.baseline_comparison.baselines_available
  ) {
    let bonus = 0;
    for (const dim of result.baseline_comparison.dimensions) {
      if (dim.this_grade === null) continue;
      if (dim.below_baseline === true) bonus -= BASELINE_BONUS;
      else if (dim.this_grade > dim.vertical_median + 0.5) bonus += BASELINE_BONUS;
    }
    baselineAdjustment = Math.max(-BASELINE_CAP, Math.min(BASELINE_CAP, bonus));
  }

  const finalScore =
    Math.round(
      (composite + (baselineAdjustment ?? 0)) * 100,
    ) / 100;

  const criticalCount = result.bugs
    ? result.bugs.filter((b) => b.severity === "critical").length
    : 0;

  return {
    label,
    demo_path: demoPath,
    result_path: resultPath,
    has_critical: result.has_critical === true,
    critical_count: criticalCount,
    components,
    baseline_adjustment: baselineAdjustment,
    score: finalScore,
    why: "", // filled in by selectWinner once ranking is known
  };
}

// ─────────────────────────────────────────────────────────────────────
// Selection — hard-gate then composite
// ─────────────────────────────────────────────────────────────────────

function selectWinner(
  variants: VariantScoreBreakdown[],
): { winnerIndex: number | null; hardGateBypassed: boolean } {
  if (variants.length === 0) return { winnerIndex: null, hardGateBypassed: false };

  // Sort by composite score descending. Variants is mutated in place
  // so the order of the variant_selection.json `variants[]` matches
  // the ranking.
  variants.sort((a, b) => b.score - a.score);

  const nonCritical = variants.filter((v) => !v.has_critical);
  if (nonCritical.length > 0) {
    // Normal case: winner is the highest-scoring non-critical variant.
    const winner = nonCritical[0];
    const winnerIndex = variants.indexOf(winner);
    for (const v of variants) {
      if (v === winner) {
        v.why = `picked: score ${v.score.toFixed(2)}, no critical bugs`;
      } else if (v.has_critical) {
        v.why = `rejected: ${v.critical_count} critical bug(s) — disqualified by hard-gate`;
      } else {
        v.why = `rejected: score ${v.score.toFixed(2)} below winner (${winner.score.toFixed(2)})`;
      }
    }
    return { winnerIndex, hardGateBypassed: false };
  }

  // Hard-gate bypass: every variant has criticals. Pick fewest-criticals,
  // then by score. The skill text should escalate this case to the human
  // — auto-shipping a critical-bug demo is a last resort, not a default.
  variants.sort((a, b) => {
    if (a.critical_count !== b.critical_count)
      return a.critical_count - b.critical_count;
    return b.score - a.score;
  });
  const winner = variants[0];
  for (const v of variants) {
    if (v === winner) {
      v.why = `picked (hard-gate bypass): ${v.critical_count} critical bug(s) — fewest of the variants; score ${v.score.toFixed(2)}`;
    } else {
      v.why = `rejected: ${v.critical_count} critical bug(s) — more than winner (${winner.critical_count})`;
    }
  }
  return { winnerIndex: 0, hardGateBypassed: true };
}

// ─────────────────────────────────────────────────────────────────────
// Variant discovery — walk outputs/variants/<LABEL>/
// ─────────────────────────────────────────────────────────────────────

interface VariantCandidate {
  label: string;
  demoPath: string;
  resultPath: string;
}

function discoverVariants(outputsDir: string): VariantCandidate[] {
  const variantsRoot = join(outputsDir, "variants");
  if (!existsSync(variantsRoot)) return [];
  const labels = readdirSync(variantsRoot).filter((name) => {
    const full = join(variantsRoot, name);
    return statSync(full).isDirectory() && !name.startsWith(".");
  });
  const out: VariantCandidate[] = [];
  for (const label of labels.sort()) {
    const demoPath = join(variantsRoot, label, "demo.html");
    const resultPath = join(variantsRoot, label, "qa-visual-result.json");
    if (existsSync(demoPath) && existsSync(resultPath)) {
      out.push({ label, demoPath, resultPath });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

function main(): void {
  const [, , outputsDirArg] = process.argv;
  if (!outputsDirArg) {
    console.error(
      "usage: qa-visual-variant-selector.ts <outputs_dir>\n  expects outputs_dir/variants/<LABEL>/{demo.html, qa-visual-result.json}",
    );
    process.exit(1);
  }
  const outputsDir = resolve(outputsDirArg);
  if (!existsSync(outputsDir)) {
    console.error(`ERROR: ${outputsDir} not found`);
    process.exit(1);
  }
  const variantsRoot = join(outputsDir, "variants");
  const candidates = discoverVariants(outputsDir);

  const ranAt = new Date().toISOString();
  const ranAtNoColons = ranAt.replace(/[:.]/g, "");
  const slug = basename(resolve(outputsDir, ".."));

  if (candidates.length === 0) {
    console.error(`qa-visual-variant-selector: no variants found at ${variantsRoot}`);
    const empty: VariantSelectionResult = {
      selection_id: `${slug}-variant-selection-${ranAtNoColons}`,
      outputs_dir: outputsDir,
      variants_root: variantsRoot,
      ran_at: ranAt,
      variants: [],
      winner_index: null,
      winner_label: null,
      winner_demo_path: null,
      winner_score: null,
      hard_gate_bypassed: false,
      notes: "no variants discovered — variant-mode wasn't used, or builds failed before producing qa-visual-result.json",
    };
    writeFileSync(
      join(outputsDir, "variant-selection.json"),
      JSON.stringify(empty, null, 2),
    );
    console.log(JSON.stringify(empty, null, 2));
    return;
  }

  console.error(
    `qa-visual-variant-selector: discovered ${candidates.length} variant(s): ${candidates.map((c) => c.label).join(", ")}`,
  );

  // Score every candidate. Validate each visual-QA result first — a
  // malformed result would skew the comparison silently. Drop invalid
  // variants with a clear log line.
  const breakdowns: VariantScoreBreakdown[] = [];
  for (const c of candidates) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(c.resultPath, "utf8"));
    } catch (e) {
      console.error(
        `qa-visual-variant-selector: [${c.label}] SKIP — invalid JSON: ${(e as Error).message}`,
      );
      continue;
    }
    const validation = validateVisualQaResult(raw);
    if (!validation.valid) {
      console.error(
        `qa-visual-variant-selector: [${c.label}] SKIP — schema violation: ${validation.errors[0]}`,
      );
      continue;
    }
    const breakdown = computeBreakdown(
      c.label,
      c.demoPath,
      c.resultPath,
      validation.data as VisualQaResult,
    );
    breakdowns.push(breakdown);
  }

  if (breakdowns.length === 0) {
    console.error(
      "qa-visual-variant-selector: every variant failed validation — no selection possible",
    );
    const empty: VariantSelectionResult = {
      selection_id: `${slug}-variant-selection-${ranAtNoColons}`,
      outputs_dir: outputsDir,
      variants_root: variantsRoot,
      ran_at: ranAt,
      variants: [],
      winner_index: null,
      winner_label: null,
      winner_demo_path: null,
      winner_score: null,
      hard_gate_bypassed: false,
      notes: "every variant's qa-visual-result.json failed schema validation",
    };
    writeFileSync(
      join(outputsDir, "variant-selection.json"),
      JSON.stringify(empty, null, 2),
    );
    console.log(JSON.stringify(empty, null, 2));
    return;
  }

  const { winnerIndex, hardGateBypassed } = selectWinner(breakdowns);
  // After selectWinner mutates the sort order, winnerIndex points into
  // the sorted `breakdowns` array.
  const winner = winnerIndex !== null ? breakdowns[winnerIndex] : null;

  const result: VariantSelectionResult = {
    selection_id: `${slug}-variant-selection-${ranAtNoColons}`,
    outputs_dir: outputsDir,
    variants_root: variantsRoot,
    ran_at: ranAt,
    variants: breakdowns,
    winner_index: winnerIndex,
    winner_label: winner?.label ?? null,
    winner_demo_path: winner?.demo_path ?? null,
    winner_score: winner?.score ?? null,
    hard_gate_bypassed: hardGateBypassed,
    notes: winner
      ? `winner: ${winner.label} (score ${winner.score.toFixed(2)})${
          hardGateBypassed ? " — HARD-GATE BYPASSED, every variant had critical bugs" : ""
        }`
      : "no winner picked",
  };

  const outPath = join(outputsDir, "variant-selection.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  for (const v of result.variants) {
    console.error(
      `qa-visual-variant-selector: [${v.label}] score=${v.score.toFixed(2)} crit=${v.critical_count} — ${v.why}`,
    );
  }
  if (winner) {
    console.error(
      `qa-visual-variant-selector: WINNER → ${winner.label} (${winner.demo_path})${
        hardGateBypassed ? " — HARD-GATE BYPASSED" : ""
      }`,
    );
  }
  console.error(`qa-visual-variant-selector: result → ${outPath}`);

  console.log(JSON.stringify(result, null, 2));
}

main();
