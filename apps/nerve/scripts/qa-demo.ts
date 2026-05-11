/**
 * Auto-QA pass for a built demo.html. Heuristic checker — runs inside
 * /build-demo after the file is written, scores it across four categories
 * (HTML structure, accessibility, photo coverage, copy quality), and
 * emits a wire-format QA result JSON ready to POST to
 * /api/ingest/qa-result.
 *
 * The qa_results table has been wired since A5 but had no producer; this
 * is the producer for the manual-skill path. The autumn Pi siteQaAgent
 * will eventually replace it with a heavier check (headless render,
 * Lighthouse, actual WCAG contrast). For now: regex heuristics, zero
 * dependencies, runs in a few hundred ms against multi-MB inline HTML.
 *
 * Usage:
 *   npx tsx apps/nerve/scripts/qa-demo.ts <demo.html> <artefact_id> <lead_id> [<ran_at_iso>]
 *
 * Stdout: JSON matching QaResultInput, ready to pipe into
 *         ~/.claude/scripts/nerve/post-ingest.sh.
 * Stderr: one-line human-readable summary so the skill can surface it
 *         in chat without re-parsing the JSON.
 *
 * Pure Node — no deps beyond fs.
 */

import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";

interface Issue {
  severity: "error" | "warning" | "info";
  area: "html" | "a11y" | "photos" | "copy";
  message: string;
}

// Banned vocabulary mirrored from the /lead-json + /build-demo skill copy
// rules. A demo using any of these words has reverted to marketing-mush
// vocabulary that the founder bins on sight; the QA flag should catch it
// before the rep walks into the shop.
const BANNED_VOCAB = [
  "unlock",
  "leverage",
  "transform",
  "elevate",
  "seamless",
  "bespoke",
  "curated",
  "journey",
  "vibrant",
  "nestled",
  "passionate",
  "dedicated",
  "premium",
  "world-class",
  "synergy",
  "robust",
  "holistic",
  "empower",
  "game-changing",
];

function main(): void {
  const [, , htmlPath, artefactId, leadId, ranAtArg] = process.argv;
  if (!htmlPath || !artefactId || !leadId) {
    console.error(
      "usage: qa-demo.ts <demo.html> <artefact_id> <lead_id> [<ran_at_iso>]",
    );
    process.exit(1);
  }

  const abs = resolve(htmlPath);
  let html: string;
  try {
    html = readFileSync(abs, "utf8");
  } catch (e) {
    console.error(`ERROR: cannot read ${abs}: ${String(e)}`);
    process.exit(1);
  }

  const ranAt = ranAtArg ?? new Date().toISOString();
  // qa_id natural key matches the convention in qa-result/route.ts comments:
  // <artefact_id>-qa-<iso_no_colons>. Strip colons + dots so the id is
  // shell- and URL-safe.
  const qaId = `${artefactId}-qa-${ranAt.replace(/[:.]/g, "")}`;

  const issues: Issue[] = [];

  const htmlScore = scoreHtml(html, issues);
  const a11yScore = scoreA11y(html, issues);
  const photoScore = scorePhotos(html, issues);
  const copyScore = scoreCopy(html, issues);

  const total = htmlScore + a11yScore + photoScore + copyScore;
  const passed = total >= 70;

  const htmlErrors = issues.filter(
    (i) => i.area === "html" && i.severity === "error",
  ).length;
  const htmlWarnings = issues.filter(
    (i) => i.area === "html" && i.severity === "warning",
  ).length;

  const result = {
    qa_id: qaId,
    artefact_id: artefactId,
    lead_id: leadId,
    score: total,
    passed,
    html_valid: htmlErrors === 0,
    html_warnings: htmlWarnings,
    html_errors: htmlErrors,
    accessibility_score: Math.round((a11yScore / 25) * 100),
    contrast_score: scoreContrastHeuristic(html),
    issues,
    notes: summary(htmlScore, a11yScore, photoScore, copyScore, total),
    agent_id: "qa-demo-heuristic",
    agent_version: "v1-2026-05-11",
    source: "manual_skill",
    metadata: {
      sub_scores: {
        html: htmlScore,
        a11y: a11yScore,
        photos: photoScore,
        copy: copyScore,
      },
      file_bytes: Buffer.byteLength(html, "utf8"),
      file_basename: basename(abs),
    },
    ran_at: ranAt,
  };

  console.error(
    `QA: ${total}/100 ${passed ? "PASS" : "FAIL"} ` +
      `(html=${htmlScore}/25 a11y=${a11yScore}/25 ` +
      `photos=${photoScore}/25 copy=${copyScore}/25, ` +
      `${issues.length} issue${issues.length === 1 ? "" : "s"})`,
  );
  console.log(JSON.stringify(result, null, 2));
}

// ── Category 1: HTML structure (25 points) ───────────────────────────────

function scoreHtml(html: string, issues: Issue[]): number {
  let score = 25;
  const has = (re: RegExp): boolean => re.test(html);

  if (!has(/<html[^>]*\blang=/i)) {
    score -= 3;
    issues.push({
      severity: "warning",
      area: "html",
      message: "<html> missing lang attribute",
    });
  }
  if (!has(/<title>/i)) {
    score -= 2;
    issues.push({ severity: "error", area: "html", message: "missing <title>" });
  }
  if (!has(/<main[\s>]/i)) {
    score -= 3;
    issues.push({
      severity: "warning",
      area: "html",
      message: "missing <main> landmark",
    });
  }
  if (!has(/<header[\s>]/i)) {
    score -= 2;
    issues.push({
      severity: "warning",
      area: "html",
      message: "missing <header>",
    });
  }
  if (!has(/<footer[\s>]/i)) {
    score -= 2;
    issues.push({
      severity: "warning",
      area: "html",
      message: "missing <footer>",
    });
  }

  const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1Count === 0) {
    score -= 4;
    issues.push({ severity: "error", area: "html", message: "no <h1>" });
  } else if (h1Count > 1) {
    score -= 2;
    issues.push({
      severity: "warning",
      area: "html",
      message: `${h1Count} <h1> elements (expected 1)`,
    });
  }

  // Crude unclosed-tag heuristic for the layout-bearing containers. Not a
  // real parser; misses cases where the same tag is used as void (it
  // shouldn't be for these). Flag is informational — a real validator
  // would be the autumn Pi siteQaAgent's job.
  for (const tag of ["div", "section", "article", "ul", "ol"] as const) {
    const opens = (
      html.match(new RegExp(`<${tag}[\\s>]`, "gi")) ?? []
    ).length;
    const closes = (html.match(new RegExp(`</${tag}>`, "gi")) ?? []).length;
    if (opens !== closes) {
      score -= 2;
      issues.push({
        severity: "error",
        area: "html",
        message: `unbalanced <${tag}>: ${opens} opens vs ${closes} closes`,
      });
    }
  }

  return Math.max(0, score);
}

// ── Category 2: Accessibility (25 points) ────────────────────────────────

function scoreA11y(html: string, issues: Issue[]): number {
  let score = 25;

  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  const imgsMissingAlt = imgs.filter((i) => !/\balt\s*=/.test(i)).length;
  if (imgs.length > 0) {
    const ratio = imgsMissingAlt / imgs.length;
    const deduction = Math.round(ratio * 8);
    score -= deduction;
    if (imgsMissingAlt > 0) {
      issues.push({
        severity: "warning",
        area: "a11y",
        message: `${imgsMissingAlt}/${imgs.length} <img> missing alt attribute`,
      });
    }
  }

  const links = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  const linksEmpty = links.filter((l) => {
    if (/\baria-label\s*=/i.test(l)) return false;
    const inner = l.replace(/<[^>]+>/g, "").trim();
    return inner.length === 0;
  }).length;
  if (linksEmpty > 0) {
    score -= Math.min(5, linksEmpty);
    issues.push({
      severity: "warning",
      area: "a11y",
      message: `${linksEmpty} link(s) without accessible text or aria-label`,
    });
  }

  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gi) ?? [];
  const buttonsEmpty = buttons.filter((b) => {
    if (/\baria-label\s*=/i.test(b)) return false;
    const inner = b.replace(/<[^>]+>/g, "").trim();
    return inner.length === 0;
  }).length;
  if (buttonsEmpty > 0) {
    score -= Math.min(5, buttonsEmpty);
    issues.push({
      severity: "warning",
      area: "a11y",
      message: `${buttonsEmpty} button(s) without accessible text or aria-label`,
    });
  }

  if (!/prefers-reduced-motion/i.test(html)) {
    score -= 4;
    issues.push({
      severity: "warning",
      area: "a11y",
      message: "no prefers-reduced-motion media query",
    });
  }

  if (!/:focus\b|:focus-visible\b/i.test(html)) {
    score -= 3;
    issues.push({
      severity: "warning",
      area: "a11y",
      message: "no :focus or :focus-visible styles defined",
    });
  }

  return Math.max(0, score);
}

// ── Category 3: Photo coverage (25 points) ───────────────────────────────

function scorePhotos(html: string, issues: Issue[]): number {
  let score = 25;

  const inlineImgs = (
    html.match(/<img[^>]+src=["']data:image\//gi) ?? []
  ).length;
  const placeholderHints = (
    html.match(/\[\s*[^\]]*photo[^\]]*·[^\]]*drop\s*file\s*here\s*\]/gi) ?? []
  ).length;

  if (inlineImgs === 0) {
    score -= 10;
    issues.push({
      severity: "warning",
      area: "photos",
      message:
        "no inline data: image embeds — demo is running on placeholders only",
    });
  } else if (inlineImgs < 3) {
    score -= 5;
    issues.push({
      severity: "info",
      area: "photos",
      message: `only ${inlineImgs} inline photo(s) embedded`,
    });
  }

  if (placeholderHints > 2) {
    score -= Math.min(10, placeholderHints * 2);
    issues.push({
      severity: "warning",
      area: "photos",
      message: `${placeholderHints} placeholder slot(s) — should mostly be replaced with real photos before shipping`,
    });
  }

  return Math.max(0, score);
}

// ── Category 4: Copy quality (25 points) ─────────────────────────────────

function scoreCopy(html: string, issues: Issue[]): number {
  let score = 25;

  // Strip data: URIs + script/style + tag markup so the banned-word /
  // punctuation check only sees user-visible prose. base64-encoded photos
  // contain everything; banned vocab inside them is a false positive.
  const visible = html
    .replace(/data:[^"']*/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();

  const emDashes = (visible.match(/—/g) ?? []).length;
  if (emDashes > 0) {
    score -= Math.min(5, emDashes);
    issues.push({
      severity: "warning",
      area: "copy",
      message: `${emDashes} em-dash(es) — banned per skill copy rules`,
    });
  }

  const exclaims = (visible.match(/!/g) ?? []).length;
  if (exclaims > 0) {
    score -= Math.min(5, exclaims);
    issues.push({
      severity: "warning",
      area: "copy",
      message: `${exclaims} exclamation mark(s) — banned per skill copy rules`,
    });
  }

  const found = BANNED_VOCAB.filter((w) =>
    new RegExp(`\\b${w}\\b`, "i").test(visible),
  );
  if (found.length > 0) {
    score -= Math.min(15, found.length * 3);
    issues.push({
      severity: "warning",
      area: "copy",
      message: `banned vocab present: ${found.join(", ")}`,
    });
  }

  return Math.max(0, score);
}

// ── Contrast (placeholder — real WCAG check needs render) ────────────────

function scoreContrastHeuristic(html: string): number {
  // Without rendering we can't compute true WCAG contrast. Heuristic:
  // CSS defines explicit color AND background-color → 80, one of them → 65,
  // nothing explicit → 50. Real check belongs to the autumn Pi siteQaAgent.
  const hasColor = /[\s;{]color\s*:/i.test(html);
  const hasBg = /background(-color)?\s*:/i.test(html);
  if (hasColor && hasBg) return 80;
  if (hasColor || hasBg) return 65;
  return 50;
}

function summary(
  html: number,
  a11y: number,
  photos: number,
  copy: number,
  total: number,
): string {
  const weak: string[] = [];
  if (html < 20) weak.push(`html=${html}/25`);
  if (a11y < 20) weak.push(`a11y=${a11y}/25`);
  if (photos < 20) weak.push(`photos=${photos}/25`);
  if (copy < 20) weak.push(`copy=${copy}/25`);
  return weak.length === 0
    ? `passing across all categories (${total}/100)`
    : `${total}/100 — weak: ${weak.join(", ")}`;
}

main();
