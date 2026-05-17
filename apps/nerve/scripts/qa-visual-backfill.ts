/**
 * Backfill walker for visual-QA results.
 *
 * Walks `~/Desktop/salespatch-demos/*\/outputs/qa-visual-result.json`
 * and POSTs each via the standard nerve post-ingest helper to
 * /api/ingest/qa-visual-result. Idempotent by `qa_visual_id`:
 * already-ingested rows return inserted=false, not an error, so the
 * script is safe to re-run.
 *
 * Validation: each candidate file is checked against the canonical
 * VisualQaResult schema BEFORE POST. Files that fail validation are
 * skipped with a clear message so a stale pre-PR-C / pre-PR-D shape
 * doesn't contaminate the warehouse and you know which leads need a
 * fresh visual-QA pass.
 *
 * Usage:
 *   npx tsx apps/nerve/scripts/qa-visual-backfill.ts            # all
 *   npx tsx apps/nerve/scripts/qa-visual-backfill.ts <slug>     # one
 *
 * Requires the post-ingest helper:
 *   ~/.claude/scripts/nerve/post-ingest.sh
 *
 * Stderr: per-file progress lines.
 * Stdout: final summary JSON (total / inserted / skipped_already
 *         / skipped_invalid / posted_failed).
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, join, basename } from "node:path";
import { validateVisualQaResult } from "./qa-visual-prompts";

interface Summary {
  total: number;
  inserted: number;
  skipped_already: number;
  skipped_invalid: number;
  posted_failed: number;
  rows: Array<{
    slug: string;
    file: string;
    status: "inserted" | "skipped_already" | "skipped_invalid" | "posted_failed";
    message?: string;
  }>;
}

const DEMOS_ROOT = join(homedir(), "Desktop/salespatch-demos");
const POST_INGEST = join(homedir(), ".claude/scripts/nerve/post-ingest.sh");
const ENDPOINT = "/api/ingest/qa-visual-result";

function findCandidates(slugFilter?: string): string[] {
  if (!existsSync(DEMOS_ROOT)) {
    throw new Error(`demos root not found: ${DEMOS_ROOT}`);
  }
  const slugs = slugFilter
    ? [slugFilter]
    : readdirSync(DEMOS_ROOT).filter((name) => {
        const full = join(DEMOS_ROOT, name);
        return statSync(full).isDirectory() && !name.startsWith(".");
      });
  const out: string[] = [];
  for (const slug of slugs) {
    const file = join(DEMOS_ROOT, slug, "outputs/qa-visual-result.json");
    if (existsSync(file)) out.push(file);
  }
  return out;
}

function postOne(file: string): { ok: boolean; message: string } {
  try {
    const stdout = execFileSync(POST_INGEST, [ENDPOINT, file], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { ok: true, message: stdout.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const out = (err.stdout ?? "").trim();
    const errMsg = (err.stderr ?? "").trim() || err.message || String(e);
    return { ok: false, message: `${out}\n${errMsg}`.trim() };
  }
}

function main(): void {
  if (!existsSync(POST_INGEST)) {
    console.error(`qa-visual-backfill: ERROR ${POST_INGEST} not found`);
    process.exit(1);
  }
  const slugFilter = process.argv[2];
  const candidates = findCandidates(slugFilter);
  console.error(
    `qa-visual-backfill: ${candidates.length} candidate file(s)${slugFilter ? ` (filter=${slugFilter})` : ""}`,
  );

  const summary: Summary = {
    total: candidates.length,
    inserted: 0,
    skipped_already: 0,
    skipped_invalid: 0,
    posted_failed: 0,
    rows: [],
  };

  for (const file of candidates) {
    const slug = basename(resolve(file, "..", ".."));

    // Pre-validate so we don't POST garbage.
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`qa-visual-backfill: [${slug}] SKIP invalid JSON: ${(e as Error).message}`);
      summary.skipped_invalid++;
      summary.rows.push({ slug, file, status: "skipped_invalid", message: (e as Error).message });
      continue;
    }
    const validation = validateVisualQaResult(raw);
    if (!validation.valid) {
      const first = validation.errors[0] ?? "schema error";
      console.error(`qa-visual-backfill: [${slug}] SKIP schema violation: ${first}`);
      summary.skipped_invalid++;
      summary.rows.push({
        slug,
        file,
        status: "skipped_invalid",
        message: validation.errors.join("; "),
      });
      continue;
    }

    const posted = postOne(file);
    if (!posted.ok) {
      console.error(`qa-visual-backfill: [${slug}] FAILED: ${posted.message.slice(0, 200)}`);
      summary.posted_failed++;
      summary.rows.push({ slug, file, status: "posted_failed", message: posted.message });
      continue;
    }
    // The helper outputs the response body. inserted:true/false tells us
    // whether this was a new row or an idempotent replay.
    const insertedMatch = /"inserted"\s*:\s*(true|false)/.exec(posted.message);
    const isNew = insertedMatch?.[1] === "true";
    if (isNew) {
      console.error(`qa-visual-backfill: [${slug}] inserted`);
      summary.inserted++;
      summary.rows.push({ slug, file, status: "inserted" });
    } else {
      console.error(`qa-visual-backfill: [${slug}] already ingested`);
      summary.skipped_already++;
      summary.rows.push({ slug, file, status: "skipped_already" });
    }
  }

  console.error(
    `qa-visual-backfill: done — ` +
      `total=${summary.total} inserted=${summary.inserted} ` +
      `skipped_already=${summary.skipped_already} ` +
      `skipped_invalid=${summary.skipped_invalid} ` +
      `posted_failed=${summary.posted_failed}`,
  );
  console.log(JSON.stringify(summary, null, 2));
}

main();
