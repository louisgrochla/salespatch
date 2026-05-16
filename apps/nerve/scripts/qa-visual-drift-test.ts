/**
 * Drift test — verifies qa-visual-prompts.ts and qa-visual-prompts.md
 * agree on the public surface.
 *
 * The two files share a parity contract per AUDIT-finding "no drift
 * test between .ts and .md". The .ts file is the executable canon (Zod
 * schemas + SDK runner imports); the .md file is the human-readable
 * mirror read by the /build-demo manual flow. A name added to one
 * without the other = silent NERVE-warehouse contamination, because
 * the manual flow will follow the .md spec but the SDK runner will
 * produce a different shape.
 *
 * This test grep-counts every required symbol in both files. Cheap,
 * deterministic, no deps. Exits 0 if both files mention every required
 * symbol; exits 1 with a clear diff if any are missing.
 *
 * Usage:
 *   npx tsx apps/nerve/scripts/qa-visual-drift-test.ts
 *
 * Wire into pre-merge CI (and the npm script "qa-visual:drift-test")
 * so a PR that edits one file without the other gets caught at review
 * time, not at the next NERVE rollout.
 *
 * Scope is intentionally minimal: this test only checks PRESENCE of
 * required identifiers. Drift in semantics (e.g. severity rubric in
 * .ts says "critical = ship-blocker" but .md says "critical = serious
 * bug") is not caught by this test. The compile-time _typeParity guard
 * in qa-visual-prompts.ts catches TS-shape drift via the type system;
 * this test catches identifier drift via grep.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TS_PATH = resolve(__dirname, "qa-visual-prompts.ts");
const MD_PATH = resolve(__dirname, "qa-visual-prompts.md");

/**
 * Every public symbol that BOTH files must mention. Adding a new
 * prompt / interface / builder? Add it here too.
 */
const REQUIRED_SYMBOLS = [
  // Layer-1 (Bugs)
  "BUGS_SYSTEM_PROMPT",
  "buildBugsUserMessage",
  // Layer-2 (Brand fidelity)
  "BRAND_FIDELITY_SYSTEM_PROMPT",
  "buildBrandFidelityUserMessage",
  // Layer-3 (Owner reaction)
  "OWNER_REACTION_SYSTEM_PROMPT",
  "buildOwnerReactionUserMessage",
  // TS interfaces / canonical result shape
  "VisualQaResult",
  "BugFinding",
  "BrandFidelityResult",
  "OwnerReaction",
  "BrandDimensionGrade",
  // Runtime validation surface
  "validateVisualQaResult",
];

function main(): void {
  let ts: string;
  let md: string;
  try {
    ts = readFileSync(TS_PATH, "utf8");
    md = readFileSync(MD_PATH, "utf8");
  } catch (e) {
    console.error(`qa-visual-drift-test: ERROR reading source files: ${(e as Error).message}`);
    process.exit(2);
  }

  const missingFromTs: string[] = [];
  const missingFromMd: string[] = [];

  for (const symbol of REQUIRED_SYMBOLS) {
    // Match the symbol as a whole word — avoids `OwnerReaction` matching
    // inside `OwnerReactionAlt` if we ever add a variant.
    const re = new RegExp(`\\b${symbol}\\b`);
    if (!re.test(ts)) missingFromTs.push(symbol);
    if (!re.test(md)) missingFromMd.push(symbol);
  }

  if (missingFromTs.length === 0 && missingFromMd.length === 0) {
    console.log(
      `qa-visual-drift-test: OK — all ${REQUIRED_SYMBOLS.length} required symbols present in both files`,
    );
    process.exit(0);
  }

  console.error(`qa-visual-drift-test: DRIFT DETECTED`);
  if (missingFromTs.length > 0) {
    console.error(`  missing from qa-visual-prompts.ts:`);
    for (const s of missingFromTs) console.error(`    - ${s}`);
  }
  if (missingFromMd.length > 0) {
    console.error(`  missing from qa-visual-prompts.md:`);
    for (const s of missingFromMd) console.error(`    - ${s}`);
  }
  console.error(
    `\nFix: ensure both files mention each symbol. The .ts file is the executable canon; the .md is the human-readable mirror. Drift = silent NERVE contamination.`,
  );
  process.exit(1);
}

main();
