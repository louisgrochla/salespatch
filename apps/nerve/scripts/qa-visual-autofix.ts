/**
 * Autofix orchestrator for visual-QA critical bugs.
 *
 * Reads `<demo>/outputs/qa-visual-result.json`, walks every critical
 * bug, applies known-good HTML remedies (`qa-visual-remedies.ts`),
 * and writes the updated `demo.html` back in place.
 *
 * Single-pass — does NOT re-render or re-run visual QA. The /build-demo
 * skill is responsible for the iteration loop:
 *
 *   1. qa-visual-render.ts + qa-visual.ts → qa-visual-result.json
 *   2. If has_critical → qa-visual-autofix.ts → updated demo.html
 *   3. qa-visual-render.ts + qa-visual.ts → fresh qa-visual-result.json
 *   4. Loop back to 2 with a max of 3 iterations.
 *
 * Splitting iteration from fix means the autofix script can be tested
 * (and re-run) in isolation — it's a pure HTML transformation given
 * a result file.
 *
 * Usage:
 *   npx tsx apps/nerve/scripts/qa-visual-autofix.ts <demo.html>
 *
 * The qa-visual-result.json is expected at <demo dir>/qa-visual-result.json
 * (the conventional location written by qa-visual.ts and the manual flow).
 *
 * Stdout: JSON summary matching AutofixSummary from qa-visual-remedies.ts.
 * Stderr: per-fix progress lines.
 * Exit:   0 always (no critical bugs is fine; unfixable bugs aren't an error).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { applyRemedies } from "./qa-visual-remedies";
import type { BugFinding } from "./qa-visual-prompts";

interface RunResult {
  bugs: BugFinding[] | null;
  has_critical: boolean | null;
  bug_count: number | null;
}

function loadResult(htmlPath: string): RunResult {
  const resultPath = join(dirname(htmlPath), "qa-visual-result.json");
  if (!existsSync(resultPath)) {
    throw new Error(
      `qa-visual-result.json not found at ${resultPath} — run qa-visual.ts (or the manual /build-demo flow) first`,
    );
  }
  const raw = JSON.parse(readFileSync(resultPath, "utf8"));
  return {
    bugs: raw.bugs,
    has_critical: raw.has_critical,
    bug_count: raw.bug_count,
  };
}

function main(): void {
  const [, , htmlPathArg] = process.argv;
  if (!htmlPathArg) {
    console.error("usage: qa-visual-autofix.ts <demo.html>");
    process.exit(1);
  }
  const htmlPath = resolve(htmlPathArg);
  if (!existsSync(htmlPath)) {
    console.error(`ERROR: ${htmlPath} not found`);
    process.exit(1);
  }

  const result = loadResult(htmlPath);
  // PR-D: bugs can be null when the layer failed. Nothing to autofix.
  if (result.bugs === null) {
    console.error(
      `qa-visual-autofix: bugs layer failed in last QA run (null) — nothing to fix`,
    );
    console.log(
      JSON.stringify(
        { bugs_attempted: 0, fixes_applied: [], unfixable_bugs: [] },
        null,
        2,
      ),
    );
    return;
  }
  if (!result.has_critical) {
    console.error(
      `qa-visual-autofix: no critical bugs in last QA run (${result.bug_count} bugs total) — nothing to fix`,
    );
    console.log(
      JSON.stringify(
        { bugs_attempted: 0, fixes_applied: [], unfixable_bugs: [] },
        null,
        2,
      ),
    );
    return;
  }

  console.error(
    `qa-visual-autofix: ${result.bugs.filter((b) => b.severity === "critical").length} critical bug(s) in ${htmlPath}`,
  );

  const html = readFileSync(htmlPath, "utf8");
  const { html: updated, summary } = applyRemedies(html, result.bugs);

  if (summary.fixes_applied.length > 0) {
    writeFileSync(htmlPath, updated, "utf8");
    console.error(
      `qa-visual-autofix: wrote ${summary.fixes_applied.length} fix(es) to ${htmlPath}`,
    );
    for (const f of summary.fixes_applied) {
      console.error(`  ✓ [${f.pattern}] ${f.location} — ${f.message}`);
    }
  } else {
    console.error(`qa-visual-autofix: no fixes applied (html unchanged)`);
  }

  if (summary.unfixable_bugs.length > 0) {
    console.error(
      `qa-visual-autofix: ${summary.unfixable_bugs.length} unfixable critical bug(s):`,
    );
    for (const b of summary.unfixable_bugs) {
      console.error(`  ✗ [${b.pattern}] ${b.location} — ${b.reason}`);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
