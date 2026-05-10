import type { CriticEvaluation } from "../runtime/types.js";
import type { AgentExecutionOutput } from "../pipeline/agentRuntime.js";

export type { CriticEvaluation };

export interface CriticInput {
  agent_id: string;
  output: AgentExecutionOutput;
  upstream: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface CriticModel {
  evaluate(input: CriticInput): Promise<CriticEvaluation>;
  getActiveModelVersion(): string;
}

/**
 * Rule-based scorer. Currently grades site-composer-agent outputs.
 * Other agents return a neutral 0.5 / "uncertain" so the reflection
 * loop is a no-op until per-agent rules land.
 */
export class HeuristicCritic implements CriticModel {
  getActiveModelVersion(): string {
    return "heuristic-v1";
  }

  async evaluate(input: CriticInput): Promise<CriticEvaluation> {
    if (input.agent_id === "site-composer-agent") {
      return this.evaluateSiteComposer(input);
    }
    return {
      score: 0.5,
      prediction: "uncertain",
      critique: { strengths: [], weaknesses: [], specific_suggestions: [] },
      confidence: 0.0,
      model_version: this.getActiveModelVersion(),
    };
  }

  private evaluateSiteComposer(input: CriticInput): CriticEvaluation {
    const sites = input.output.artifacts.sites as
      | Array<Record<string, unknown>>
      | undefined;

    if (!Array.isArray(sites) || sites.length === 0) {
      return {
        score: 0,
        prediction: "unlikely_close",
        critique: {
          strengths: [],
          weaknesses: ["No sites generated"],
          specific_suggestions: ["Verify upstream brief data"],
        },
        confidence: 0.9,
        model_version: this.getActiveModelVersion(),
      };
    }

    // Aggregate score across all generated sites; the worst site dominates
    // because reflection retry only helps if every output meets the bar.
    const perSite = sites.map((s) => this.scoreSite(s));
    const worst = perSite.reduce((min, x) => (x.score < min.score ? x : min), perSite[0]);
    const avg = perSite.reduce((sum, x) => sum + x.score, 0) / perSite.length;
    const score = Math.min(avg, worst.score + 0.1);

    const strengths = dedupe(perSite.flatMap((p) => p.strengths)).slice(0, 8);
    const weaknesses = dedupe(perSite.flatMap((p) => p.weaknesses)).slice(0, 8);
    const suggestions = dedupe(perSite.flatMap((p) => p.suggestions)).slice(0, 8);

    return {
      score,
      prediction:
        score >= 0.7 ? "likely_close" : score < 0.4 ? "unlikely_close" : "uncertain",
      critique: { strengths, weaknesses, specific_suggestions: suggestions },
      confidence: 0.8,
      model_version: this.getActiveModelVersion(),
    };
  }

  private scoreSite(site: Record<string, unknown>): {
    score: number;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
  } {
    const html = (site.html_output as string) ?? "";
    const css = (site.css_output as string) ?? "";
    const businessName = (site.business_name as string) ?? "";
    const briefUsed = (site.brief_used as boolean) ?? false;
    const hasReviews = (site.has_reviews as boolean) ?? false;
    const hasGallery = (site.has_gallery as boolean) ?? false;
    const hasMap = (site.has_map as boolean) ?? false;
    const brandSource = (site.brand_source as string) ?? "vertical_default";

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    // Hard fail: no HTML.
    if (!html.trim()) {
      return {
        score: 0,
        strengths: [],
        weaknesses: ["Empty HTML output"],
        suggestions: ["Investigate composer template error"],
      };
    }
    score += 0.10;

    // Title tag
    if (/<title[^>]*>[^<]+<\/title>/i.test(html)) {
      score += 0.05;
      strengths.push("Has document title");
    } else {
      weaknesses.push("Missing <title> tag");
      suggestions.push("Ensure <title> tag is present in template head");
    }

    // Hero contains business name
    if (businessName && html.toLowerCase().includes(businessName.toLowerCase())) {
      score += 0.10;
      strengths.push("Hero contains business name");
    } else {
      weaknesses.push("Business name not surfaced in hero");
      suggestions.push("Verify {{business_name}} is interpolated in hero block");
    }

    // Brand source isn't fallback default
    if (brandSource !== "vertical_default") {
      score += 0.10;
      strengths.push(`Brand colours from ${brandSource}`);
    } else {
      weaknesses.push("Using vertical-default colours, not real brand");
      suggestions.push("Run brand-analyser on the lead's photos before composition");
    }

    // Trust / reviews
    if (hasReviews) {
      score += 0.10;
      strengths.push("Reviews surfaced");
    } else {
      weaknesses.push("No reviews section rendered");
      suggestions.push("Surface review count + best reviews if Google rating exists");
    }

    // Phone or booking
    if (/href=["']tel:/i.test(html) || /<iframe[^>]*src=["'][^"']*book/i.test(html)) {
      score += 0.10;
      strengths.push("Direct contact path (tel: or booking iframe)");
    } else {
      weaknesses.push("No tel: link or booking iframe");
      suggestions.push("Add a tel: anchor for the primary phone number");
    }

    // Gallery
    if (hasGallery) {
      score += 0.05;
      strengths.push("Photo gallery present");
    }

    // Map
    if (hasMap) {
      score += 0.05;
      strengths.push("Map embedded");
    }

    // Brief was used (not fallback copy)
    if (briefUsed) {
      score += 0.10;
      strengths.push("Built from real site brief");
    } else {
      weaknesses.push("Built without brief — uses fallback copy");
      suggestions.push("Generate site-brief upstream so copy reflects scraped data");
    }

    // File size sanity (single-file demo target ~500KB)
    const totalSize = html.length + css.length;
    if (totalSize > 0 && totalSize < 500_000) {
      score += 0.05;
      strengths.push(`Compact output (${Math.round(totalSize / 1024)} KB)`);
    } else if (totalSize >= 500_000) {
      weaknesses.push(`Output ${Math.round(totalSize / 1024)} KB exceeds 500 KB target`);
      suggestions.push("Inline only the assets that materially help conversion");
    }

    // Placeholder / lorem ipsum check — hard cap at 0.4
    const lower = html.toLowerCase();
    if (
      lower.includes("lorem ipsum") ||
      lower.includes("your business name") ||
      lower.includes("{{business_name}}") ||
      lower.includes("{{hero_headline}}")
    ) {
      const cap = 0.4;
      score = Math.min(score, cap);
      weaknesses.push("Unfilled placeholders or lorem ipsum present");
      suggestions.push("Re-run with brief data, ensure all template vars resolve");
    } else {
      score += 0.15;
      strengths.push("All placeholders resolved");
    }

    return {
      score: Math.min(1, Math.max(0, score)),
      strengths,
      weaknesses,
      suggestions,
    };
  }
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
