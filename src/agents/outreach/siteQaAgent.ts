import { AgentHandler } from "../../pipeline/agentRuntime.js";
import { assetExists, getAssetPath } from "../../lib/assetStore.js";
import { statSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedSite {
  lead_id?: string;
  site_name: string;
  html_output: string;
  css_output: string;
  business_name?: string;
  domain?: string;
  assets_used_json?: string;
}

interface QaIssue {
  severity: "error" | "warning" | "info";
  category: "html" | "css" | "content" | "images" | "accessibility" | "seo";
  message: string;
}

// ---------------------------------------------------------------------------
// WCAG contrast helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.replace("#", "").match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return 21; // assume fine if can't parse
  const l1 = relativeLuminance(c1.r, c1.g, c1.b);
  const l2 = relativeLuminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/**
 * Validates generated landing pages for quality.
 * Checks: HTML validity, placeholder leaks, content quality,
 * mobile responsiveness, SEO, image validation, colour contrast.
 */
export const siteQaAgent: AgentHandler = async (input) => {
  const upstream = input.upstreamArtifacts as Record<string, { sites?: GeneratedSite[] }>;

  const sites: GeneratedSite[] = [];
  for (const nodeOutput of Object.values(upstream)) {
    if (nodeOutput?.sites) sites.push(...nodeOutput.sites);
  }

  if (sites.length === 0) {
    return {
      summary: "No sites to QA.",
      artifacts: { results: [], qa_count: 0 },
    };
  }

  const results: Array<Record<string, unknown>> = [];

  for (const site of sites) {
    const issues: QaIssue[] = [];
    const html = site.html_output;
    const htmlLower = html.toLowerCase();
    const leadId = site.lead_id;

    // ---------------------------------------------------------------
    // 1. Template placeholder leaks
    // ---------------------------------------------------------------
    const placeholderMatches = html.match(/\{\{[^}]+\}\}/g);
    if (placeholderMatches && placeholderMatches.length > 0) {
      issues.push({
        severity: "error",
        category: "content",
        message: `${placeholderMatches.length} unfilled placeholder(s): ${placeholderMatches.slice(0, 3).join(", ")}`,
      });
    }

    // ---------------------------------------------------------------
    // 2. HTML structure
    // ---------------------------------------------------------------
    if (!htmlLower.includes("<!doctype html>")) {
      issues.push({ severity: "error", category: "html", message: "Missing DOCTYPE declaration" });
    }
    if (!htmlLower.includes("<meta charset")) {
      issues.push({ severity: "warning", category: "html", message: "Missing charset meta tag" });
    }
    if (!htmlLower.includes("viewport")) {
      issues.push({ severity: "error", category: "html", message: "Missing viewport meta tag — not mobile friendly" });
    }
    if (!htmlLower.includes("<title>")) {
      issues.push({ severity: "error", category: "seo", message: "Missing <title> tag" });
    }
    if (!htmlLower.includes('<meta name="description"')) {
      issues.push({ severity: "warning", category: "seo", message: "Missing meta description — hurts SEO" });
    }

    // ---------------------------------------------------------------
    // 3. Content quality
    // ---------------------------------------------------------------
    if (html.length < 1000) {
      issues.push({ severity: "warning", category: "content", message: "Very short content — may appear thin" });
    }
    if (htmlLower.includes("lorem ipsum") || htmlLower.includes("placeholder")) {
      issues.push({ severity: "error", category: "content", message: "Contains placeholder/lorem ipsum text" });
    }
    if (htmlLower.includes("example.com") || htmlLower.includes("example.invalid")) {
      issues.push({ severity: "warning", category: "content", message: "Contains example URLs" });
    }

    // ---------------------------------------------------------------
    // 4. Contact presence
    // ---------------------------------------------------------------
    if (!htmlLower.includes("tel:")) {
      issues.push({ severity: "warning", category: "content", message: "No clickable phone link found" });
    }
    if (!htmlLower.includes("mailto:")) {
      issues.push({ severity: "info", category: "content", message: "No clickable email link found" });
    }

    // ---------------------------------------------------------------
    // 5. CSS checks
    // ---------------------------------------------------------------
    if (!site.css_output || site.css_output.length < 100) {
      issues.push({ severity: "error", category: "css", message: "CSS is missing or very short" });
    }
    if (!site.css_output.includes("@media")) {
      issues.push({ severity: "warning", category: "css", message: "No media queries — may not be responsive" });
    }

    // ---------------------------------------------------------------
    // 6. Accessibility basics
    // ---------------------------------------------------------------
    if (!htmlLower.includes("lang=")) {
      issues.push({ severity: "warning", category: "accessibility", message: "Missing lang attribute on <html> tag" });
    }

    // Check img alt attributes
    const imgTags = html.match(/<img[^>]*>/gi) ?? [];
    for (const imgTag of imgTags) {
      if (!imgTag.includes("alt=")) {
        issues.push({ severity: "warning", category: "accessibility", message: `Image missing alt attribute: ${imgTag.slice(0, 60)}...` });
      }
    }

    // ---------------------------------------------------------------
    // 7. Image validation (Phase 2)
    // ---------------------------------------------------------------
    if (leadId) {
      // Check asset file download URLs in HTML
      const assetUrlPattern = /relativePath=\.assets\/([^&"']+)\/([^&"']+)/g;
      let assetMatch;
      while ((assetMatch = assetUrlPattern.exec(html)) !== null) {
        const [, matchedLeadId, filename] = assetMatch;
        const decodedFilename = decodeURIComponent(filename);
        const decodedLeadId = decodeURIComponent(matchedLeadId);

        if (!assetExists(decodedLeadId, decodedFilename)) {
          issues.push({
            severity: "error",
            category: "images",
            message: `Referenced image not found on disk: ${decodedFilename}`,
          });
        } else {
          // Check file size
          try {
            const filePath = getAssetPath(decodedLeadId, decodedFilename);
            const stats = statSync(filePath);
            if (stats.size > 2 * 1024 * 1024) {
              issues.push({
                severity: "error",
                category: "images",
                message: `Image too large (${(stats.size / 1024 / 1024).toFixed(1)}MB): ${decodedFilename}`,
              });
            } else if (stats.size > 500 * 1024) {
              issues.push({
                severity: "warning",
                category: "images",
                message: `Image could be smaller (${(stats.size / 1024).toFixed(0)}KB): ${decodedFilename}`,
              });
            }
          } catch { /* non-fatal */ }
        }
      }

      // Check if assets were used when available
      if (site.assets_used_json) {
        try {
          const usedAssets = JSON.parse(site.assets_used_json) as string[];
          if (usedAssets.length === 0) {
            issues.push({
              severity: "info",
              category: "images",
              message: "No brand assets were embedded — using default template only",
            });
          }
        } catch { /* non-fatal */ }
      }
    }

    // ---------------------------------------------------------------
    // 8. Colour contrast (WCAG AA)
    // ---------------------------------------------------------------
    const primaryMatch = site.css_output.match(/\.btn-primary\s*\{[^}]*background:\s*(#[a-fA-F0-9]{6})/);
    const ctaBtnMatch = site.css_output.match(/\.cta-section\s*\{[^}]*background:\s*(#[a-fA-F0-9]{6})/);

    if (primaryMatch?.[1]) {
      const ratio = contrastRatio(primaryMatch[1], "#ffffff");
      if (ratio < 4.5) {
        issues.push({
          severity: "warning",
          category: "accessibility",
          message: `Primary button colour ${primaryMatch[1]} has low contrast with white text (${ratio.toFixed(1)}:1, need 4.5:1)`,
        });
      }
    }
    if (ctaBtnMatch?.[1]) {
      const ratio = contrastRatio(ctaBtnMatch[1], "#ffffff");
      if (ratio < 3) {
        issues.push({
          severity: "warning",
          category: "accessibility",
          message: `CTA section background ${ctaBtnMatch[1]} has low contrast with white text (${ratio.toFixed(1)}:1, need 3:1)`,
        });
      }
    }

    // ---------------------------------------------------------------
    // Score
    // ---------------------------------------------------------------
    const errorCount = issues.filter((i) => i.severity === "error").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    let score = 100;
    score -= errorCount * 20;
    score -= warningCount * 5;
    score = Math.max(0, Math.min(100, score));

    const QC_THRESHOLD = Number(process.env.QC_THRESHOLD ?? "70");
    const passed = errorCount === 0 && score >= QC_THRESHOLD;

    results.push({
      lead_id: site.lead_id,
      site_name: site.site_name,
      domain: site.domain,
      passed,
      score,
      issues,
      error_count: errorCount,
      warning_count: warningCount,
      html_size: html.length,
      css_size: site.css_output.length,
      image_checks: issues.filter((i) => i.category === "images").length,
      accessibility_checks: issues.filter((i) => i.category === "accessibility").length,
    });
  }

  const passCount = results.filter((r) => r.passed).length;
  const avgScore = Math.round(
    results.reduce((sum, r) => sum + (r.score as number), 0) / results.length,
  );

  return {
    summary: `QA completed: ${passCount}/${results.length} passed (avg score: ${avgScore}, threshold: ${process.env.QC_THRESHOLD ?? "70"}).`,
    artifacts: {
      results,
      qa_count: results.length,
      pass_count: passCount,
      fail_count: results.length - passCount,
      avg_score: avgScore,
      _decision: {
        reasoning: `QA'd ${results.length} sites. ${passCount} passed (score ≥${process.env.QC_THRESHOLD ?? "70"} + no errors). Avg score: ${avgScore}. Common issues: ${getTopIssues(results as Array<{ issues: Array<{ category: string }> }>)}`,
        alternatives: ["Could lower threshold for initial launch", "Could add visual regression testing"],
        confidence: 0.9,
        tags: [`pass_rate:${Math.round(passCount / Math.max(results.length, 1) * 100)}pct`, `avg_score:${avgScore}`],
      },
      // Per-lead decisions for outcome attribution. Each pitch outcome
      // attaches to the lead's QA decision via `lead_id:<id>` tag.
      _decisions: results.map((r) => ({
        lead_id: r.lead_id as string,
        reasoning: `QA ${r.passed ? "passed" : "failed"} (score ${r.score}, ${r.error_count} errors, ${r.warning_count} warnings)`,
        alternatives: [],
        confidence: r.passed ? 0.9 : 0.4,
        tags: [
          `qa_passed:${r.passed ? "true" : "false"}`,
          `qa_score:${r.score}`,
          `qa_errors:${r.error_count}`,
        ],
      })),
    },
  };
};

function getTopIssues(results: Array<{ issues: Array<{ category: string }> }>): string {
  const counts = new Map<string, number>();
  for (const r of results) {
    for (const issue of r.issues) {
      counts.set(issue.category, (counts.get(issue.category) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, n]) => `${cat}(${n})`)
    .join(", ") || "none";
}
