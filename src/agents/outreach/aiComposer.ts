/**
 * AI Composer — generates unique, professional HTML+CSS using Claude via OpenRouter.
 *
 * Replaces the deterministic template-filling approach with genuine AI creativity.
 * Takes the structured brief + design decisions + asset URLs and sends them to
 * Claude Sonnet, which generates a complete single-page website from scratch.
 *
 * Each generated site is genuinely unique — different layouts, visual approaches,
 * and copy — tailored specifically to the business.
 */

import type { SiteBrief } from "./briefGenerator.js";
import type { DesignDecision } from "./designSystem.js";
import { reportSpend } from "../../lib/spendReporter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIComposerAssets {
  logoUrl: string;
  heroUrl: string;
  galleryUrls: string[];
}

export interface AIComposerResult {
  html: string;
  tokensUsed: number;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// OpenRouter config
// ---------------------------------------------------------------------------

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const AI_COMPOSER_MODEL = process.env.AI_COMPOSER_MODEL ?? "anthropic/claude-sonnet-4-20250514";
const AI_COMPOSER_TIMEOUT_MS = Number(process.env.AI_COMPOSER_TIMEOUT_MS ?? "120000");

// Sonnet pricing via OpenRouter (approximate)
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  brief: SiteBrief,
  design: DesignDecision,
  assets: AIComposerAssets,
): string {
  const { colours, fonts, hero, componentStyle } = design;

  const googleFontsUrl = `https://fonts.googleapis.com/css2?family=${fonts.headingImport}&family=${fonts.bodyImport}&display=swap`;

  const assetLines: string[] = [];
  if (assets.logoUrl) assetLines.push(`- Logo image: ${assets.logoUrl}`);
  if (assets.heroUrl) assetLines.push(`- Hero/banner image: ${assets.heroUrl}`);
  if (assets.galleryUrls.length > 0) {
    assetLines.push(`- Gallery images (use all of these):`);
    assets.galleryUrls.forEach((url, i) => assetLines.push(`  ${i + 1}. ${url}`));
  }

  const reviewLines = brief.bestReviews.length > 0
    ? brief.bestReviews.map((r) =>
        `  - "${r.text.slice(0, 200)}" — ${r.author} (${r.rating}★)`
      ).join("\n")
    : "  None available";

  const serviceLines = brief.services
    .map((s) => `  - ${s.name}: ${s.description}`)
    .join("\n");

  const hoursLines = brief.openingHours.length > 0
    ? brief.openingHours.map((h) => `  - ${h}`).join("\n")
    : "";

  const menuLines = brief.menuItems && brief.menuItems.length > 0
    ? brief.menuItems.slice(0, 20).map((m) =>
        `  - ${m.name}${m.price ? ` — ${m.price}` : ""}${m.description ? ` (${m.description})` : ""}`
      ).join("\n")
    : "";

  return `You are a world-class web designer creating a professional, modern, single-page website. Your output quality should match the best agency-built small business websites — the kind that win design awards.

CRITICAL: Return ONLY the complete HTML document. No markdown fences, no explanations, no commentary. Start with <!DOCTYPE html> and end with </html>.

═══════════════════════════════════════════════════
BUSINESS IDENTITY
═══════════════════════════════════════════════════
Name: ${brief.businessName}
Type: ${brief.businessType} (${brief.vertical} vertical)
Category: ${brief.specificCategory}
Description: ${brief.description}

Phone: ${brief.phone}
Email: ${brief.email}
Address: ${brief.address}
${brief.googleRating ? `Google Rating: ${brief.googleRating}★ from ${brief.googleReviewCount} reviews` : ""}

═══════════════════════════════════════════════════
SERVICES
═══════════════════════════════════════════════════
${serviceLines}

═══════════════════════════════════════════════════
CUSTOMER REVIEWS
═══════════════════════════════════════════════════
${reviewLines}

${hoursLines ? `═══════════════════════════════════════════════════
OPENING HOURS
═══════════════════════════════════════════════════
${hoursLines}` : ""}

${menuLines ? `═══════════════════════════════════════════════════
MENU ITEMS
═══════════════════════════════════════════════════
${menuLines}` : ""}

═══════════════════════════════════════════════════
DESIGN SYSTEM (USE THESE EXACT VALUES)
═══════════════════════════════════════════════════
Primary colour: ${colours.primary}
Primary dark: ${colours.primaryDark}
Primary light: ${colours.primaryLight}
Secondary: ${colours.secondary}
Accent: ${colours.accent}
Background: ${colours.background}
Surface: ${colours.surface}
Text: ${colours.text}
Text muted: ${colours.textMuted}
Text on primary: ${colours.textOnPrimary}
Gradient: ${colours.gradient}

Heading font: '${fonts.heading}' (weight: ${fonts.headingWeight})
Body font: '${fonts.body}' (weight: ${fonts.bodyWeight})
Google Fonts import: ${googleFontsUrl}

Component style: ${componentStyle}
Hero variant: ${hero.variant}
Hero text alignment: ${hero.textAlign}
Corner radius approach: ${design.layout.cornerRadius}
Shadow depth: ${design.layout.shadowDepth}
Section spacing: ${design.layout.sectionSpacing}

═══════════════════════════════════════════════════
ASSETS TO EMBED
═══════════════════════════════════════════════════
${assetLines.length > 0 ? assetLines.join("\n") : "No images available — use colour/gradient backgrounds instead"}

═══════════════════════════════════════════════════
COPY & CTA DIRECTIVES
═══════════════════════════════════════════════════
Hero headline: ${brief.heroHeadline}
Hero subtext: ${brief.heroSubtext}

Primary CTA: "${brief.ctaPrimary.text}" → action: ${brief.ctaPrimary.action}, target: ${brief.ctaPrimary.target}
  Rationale: ${brief.ctaPrimary.why}
${brief.ctaSecondary ? `Secondary CTA: "${brief.ctaSecondary.text}" → action: ${brief.ctaSecondary.action}, target: ${brief.ctaSecondary.target}` : ""}

Trust badges: ${brief.trustBadges.join(" · ")}

About copy: ${brief.aboutCopy}

═══════════════════════════════════════════════════
SECTION ORDER (follow this sequence)
═══════════════════════════════════════════════════
${brief.sectionOrder.map((s, i) => `${i + 1}. ${s}`).join("\n")}

═══════════════════════════════════════════════════
AVOID TOPICS (DO NOT mention any of these)
═══════════════════════════════════════════════════
${brief.avoidTopics.join(", ")}

═══════════════════════════════════════════════════
REQUIREMENTS
═══════════════════════════════════════════════════
1. Output a SINGLE complete HTML file with all CSS in a <style> tag
2. Use the exact colours and fonts specified above — import Google Fonts
3. Mobile-first responsive design with clean breakpoints
4. Modern, sophisticated aesthetic — not generic or template-looking
5. Smooth scroll behaviour, subtle CSS animations (fade-in, hover effects)
6. Sticky/transparent header with logo + nav links
7. If a hero image is provided, use it as a full-width background with overlay
8. If no hero image, create a compelling gradient/pattern hero
9. Service cards with good visual hierarchy
10. If reviews exist, show them as testimonial cards with star ratings
11. If gallery images exist, use a modern grid layout
12. If menu items exist, show them in an elegant menu layout with prices
13. If opening hours exist, display them in a clean table/grid
14. ${brief.mapsEmbedUrl ? `Include a Google Maps embed using this URL: ${brief.mapsEmbedUrl}` : "Include a contact section with address details"}
15. Footer with business name, contact info, and copyright year
16. Use semantic HTML (header, nav, main, section, footer)
17. All CTA buttons should use the specified action types (tel: links for phone, mailto: for email, etc.)
18. Make the design UNIQUE — vary layouts, use creative spacing, asymmetric grids where appropriate
19. The site should look like it costs £2000+ to build, not £50

REMEMBER: Return ONLY the HTML. No markdown, no explanation. Start with <!DOCTYPE html>.`;
}

// ---------------------------------------------------------------------------
// Main composer function
// ---------------------------------------------------------------------------

export async function generateSiteWithAI(
  brief: SiteBrief,
  design: DesignDecision,
  assets: AIComposerAssets,
  _leadId: string,
): Promise<AIComposerResult> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("AI Composer requires OPENROUTER_API_KEY (or OPENAI_API_KEY) to be set");
  }

  const systemPrompt = buildSystemPrompt(brief, design, assets);
  const userPrompt = `Generate the complete website for ${brief.businessName} (${brief.businessType}). Follow all the design constraints and copy directives exactly. Make it look premium, professional, and unique.`;

  console.log(`[AI Composer] Calling ${AI_COMPOSER_MODEL} for ${brief.businessName}...`);
  const t0 = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_COMPOSER_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://localhost",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "openclaw-site-composer",
      },
      body: JSON.stringify({
        model: AI_COMPOSER_MODEL,
        max_tokens: 16000,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${body}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter response missing message content");
    }

    const promptTokens = payload.usage?.prompt_tokens ?? 0;
    const completionTokens = payload.usage?.completion_tokens ?? 0;
    const totalTokens = promptTokens + completionTokens;

    const costUsd = (promptTokens / 1_000_000) * INPUT_COST_PER_M
                  + (completionTokens / 1_000_000) * OUTPUT_COST_PER_M;

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[AI Composer] Done in ${elapsed}s — ${totalTokens} tokens, $${costUsd.toFixed(4)}`);

    // Mirror spend to NERVE — fire-and-forget, never blocks generation.
    reportSpend({
      provider: "openrouter",
      model: AI_COMPOSER_MODEL,
      agent_id: "site-composer-agent",
      lead_id: _leadId || undefined,
      cost_usd: costUsd,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      request_kind: "completion",
      success: true,
      metadata: { business_name: brief.businessName },
      occurred_at: new Date().toISOString(),
    });

    // Extract HTML from response (strip any markdown fences if model adds them)
    let html = content.trim();
    if (html.startsWith("```html")) {
      html = html.slice(7);
    } else if (html.startsWith("```")) {
      html = html.slice(3);
    }
    if (html.endsWith("```")) {
      html = html.slice(0, -3);
    }
    html = html.trim();

    // Ensure it starts with DOCTYPE
    if (!html.toLowerCase().startsWith("<!doctype")) {
      const doctypeIdx = html.toLowerCase().indexOf("<!doctype");
      if (doctypeIdx >= 0) {
        html = html.slice(doctypeIdx);
      }
    }

    return {
      html,
      tokensUsed: totalTokens,
      costUsd,
    };
  } finally {
    clearTimeout(timeout);
  }
}
