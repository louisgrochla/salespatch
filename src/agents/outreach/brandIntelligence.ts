/**
 * Brand Intelligence Agent — AI-powered brand analysis via Claude.
 *
 * Takes all scraped data (reviews, social bios, Google categories, website content,
 * brand colours/fonts from the analyser) and produces deep brand insights:
 * - Brand tone, personality, voice examples
 * - Review-derived USPs and customer sentiment
 * - Market position (budget/mid-range/premium/luxury)
 * - Suggested headline, tagline, about copy
 * - Refined services with descriptions
 * - Trust signals and differentiators
 *
 * Single Claude API call per lead via OpenRouter. ~$0.005-0.01 per lead.
 * Fully additive — graceful fallback when AI unavailable.
 */

import { createLogger } from "../../lib/logger.js";
import { AgentHandler } from "../../pipeline/agentRuntime.js";
import { reportSpend } from "../../lib/spendReporter.js";
import type { ProfileResult } from "./leadProfilerAgent.js";
import type { BrandAnalysis } from "./brandAnalyser.js";

const log = createLogger("brand-intelligence");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandIntelligenceResult {
  lead_id: string;
  tone: string;
  personality: string;
  voice_examples: string[];
  unique_selling_points: string[];
  customer_sentiment: string;
  common_praise: string[];
  market_position: "budget" | "mid-range" | "premium" | "luxury";
  suggested_headline: string;
  suggested_tagline: string;
  suggested_about: string;
  refined_services: Array<{ name: string; description: string }>;
  trust_signals: string[];
  differentiators: string[];
  colour_recommendations?: { primary?: string; secondary?: string; rationale?: string };
  font_recommendations?: { heading?: string; body?: string; rationale?: string };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const BRAND_INTELLIGENCE_MODEL =
  process.env.BRAND_INTELLIGENCE_MODEL ?? "openai/gpt-4.1-mini";
const BRAND_INTELLIGENCE_TIMEOUT_MS =
  Number(process.env.BRAND_INTELLIGENCE_TIMEOUT_MS ?? "30000");
const BRAND_INTELLIGENCE_ENABLED =
  (process.env.BRAND_INTELLIGENCE_ENABLED ?? "true") !== "false";

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const brandIntelligenceAgent: AgentHandler = async (input) => {
  const profiles: ProfileResult[] =
    (input.upstreamArtifacts?.profiles as ProfileResult[]) ??
    findInUpstream<ProfileResult[]>(input.upstreamArtifacts, "profiles") ??
    [];
  const analyses: BrandAnalysis[] =
    (input.upstreamArtifacts?.analyses as BrandAnalysis[]) ??
    findInUpstream<BrandAnalysis[]>(input.upstreamArtifacts, "analyses") ??
    [];

  if (!BRAND_INTELLIGENCE_ENABLED || !OPENROUTER_API_KEY) {
    log.warn("brand intelligence disabled or no API key");
    return {
      summary: `Brand intelligence skipped (${!OPENROUTER_API_KEY ? "no API key" : "disabled"})`,
      artifacts: { intelligence: [], profiles, analyses },
    };
  }

  const results: BrandIntelligenceResult[] = [];
  let totalCost = 0;

  for (const profile of profiles) {
    const analysis = analyses.find((a) => a.lead_id === profile.lead_id);

    try {
      const result = await analyseWithAI(profile, analysis);
      results.push(result);
      totalCost += result._cost ?? 0;
    } catch (err) {
      log.warn(`intelligence failed for ${profile.business_name}`, {
        error: String(err),
      });
      results.push(buildFallback(profile, analysis));
    }
  }

  log.info(`analysed ${results.length} businesses`, {
    cost: totalCost.toFixed(4),
    ai_count: results.filter((r) => r.tone !== "professional").length,
  });

  return {
    summary: `Brand intelligence: ${results.length} businesses analysed ($${totalCost.toFixed(4)})`,
    artifacts: {
      intelligence: results,
      profiles,
      analyses,
      _decision: {
        reasoning: `Analysed ${results.length} brands via AI. Market positions: ${[...new Set(results.map((r) => r.market_position))].join(", ")}. Avg USPs per lead: ${(results.reduce((s, r) => s + r.unique_selling_points.length, 0) / Math.max(results.length, 1)).toFixed(1)}`,
        alternatives: ["Could batch multiple leads into single API call", "Could use cheaper model for basic analysis"],
        confidence: results.length > 0 ? 0.8 : 0.3,
        tags: results.map((r) => `position:${r.market_position}`),
      },
    },
    cost_usd: totalCost,
  };
};

// ---------------------------------------------------------------------------
// AI call
// ---------------------------------------------------------------------------

interface AIResult extends BrandIntelligenceResult {
  _cost?: number;
}

async function analyseWithAI(
  profile: ProfileResult,
  analysis: BrandAnalysis | undefined,
): Promise<AIResult> {
  const reviews = safeJsonParse<Array<{ author?: string; rating?: number; text?: string }>>(
    profile.reviews_json, [],
  );
  const socialProfiles = safeJsonParse<Array<{ platform?: string; bio?: string }>>(
    profile.social_profiles_json, [],
  );
  const googleBusiness = safeJsonParse<Record<string, unknown>>(
    profile.google_business_json, {},
  );

  const prompt = buildPrompt(profile, analysis, reviews, socialProfiles, googleBusiness);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRAND_INTELLIGENCE_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://localhost",
        "X-Title": process.env.OPENROUTER_APP_NAME ?? "openclaw-brand-intelligence",
      },
      body: JSON.stringify({
        model: BRAND_INTELLIGENCE_MODEL,
        temperature: 0.4,
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API ${response.status}: ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response");

    const parsed = JSON.parse(content) as Partial<BrandIntelligenceResult>;
    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;
    const cost = (inputTokens * 0.4 + outputTokens * 1.6) / 1_000_000; // gpt-4.1-mini pricing

    // Mirror spend to NERVE — fire-and-forget.
    reportSpend({
      provider: "openrouter",
      model: BRAND_INTELLIGENCE_MODEL,
      agent_id: "brand-intelligence-agent",
      lead_id: profile.lead_id ?? profile.business_name,
      cost_usd: cost,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      request_kind: "completion",
      success: true,
      metadata: { business_name: profile.business_name },
      occurred_at: new Date().toISOString(),
    });

    return {
      lead_id: profile.lead_id ?? profile.business_name,
      tone: parsed.tone ?? "professional",
      personality: parsed.personality ?? "reliable and approachable",
      voice_examples: parsed.voice_examples ?? [],
      unique_selling_points: parsed.unique_selling_points ?? [],
      customer_sentiment: parsed.customer_sentiment ?? "neutral",
      common_praise: parsed.common_praise ?? [],
      market_position: validatePosition(parsed.market_position),
      suggested_headline: parsed.suggested_headline ?? "",
      suggested_tagline: parsed.suggested_tagline ?? "",
      suggested_about: parsed.suggested_about ?? "",
      refined_services: parsed.refined_services ?? [],
      trust_signals: parsed.trust_signals ?? [],
      differentiators: parsed.differentiators ?? [],
      colour_recommendations: parsed.colour_recommendations,
      font_recommendations: parsed.font_recommendations,
      _cost: cost,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a brand strategist analysing a local business to generate a personalised website. Return strict JSON with these keys:

- tone: string — brand voice tone (e.g., "warm and welcoming", "professional and authoritative", "friendly and casual")
- personality: string — brand personality in 2-3 words
- voice_examples: string[] — 3 example phrases in the brand's voice
- unique_selling_points: string[] — 3-5 USPs derived from reviews and business data
- customer_sentiment: string — overall sentiment summary (1 sentence)
- common_praise: string[] — top 3 things customers praise most
- market_position: "budget" | "mid-range" | "premium" | "luxury"
- suggested_headline: string — compelling hero headline (max 60 chars)
- suggested_tagline: string — tagline for below the headline (max 100 chars)
- suggested_about: string — about section copy (2-3 sentences, in the brand's voice)
- refined_services: [{name, description}] — top 4-6 services with compelling descriptions
- trust_signals: string[] — 3-5 trust indicators (certifications, experience, guarantees)
- differentiators: string[] — what makes this business different from competitors
- colour_recommendations: {primary?, secondary?, rationale?} — hex colours if the existing ones don't suit the brand
- font_recommendations: {heading?, body?, rationale?} — font suggestions if defaults don't match the tone

Base everything on the actual data provided. Never fabricate reviews or credentials. If data is thin, be honest — use "based on limited data" language.`;

function buildPrompt(
  profile: ProfileResult,
  analysis: BrandAnalysis | undefined,
  reviews: Array<{ author?: string; rating?: number; text?: string }>,
  socialProfiles: Array<{ platform?: string; bio?: string }>,
  googleBusiness: Record<string, unknown>,
): string {
  const parts: string[] = [];

  const verticalCategory = (profile as unknown as Record<string, unknown>).vertical_category as string | undefined;

  parts.push(`BUSINESS: ${profile.business_name}`);
  parts.push(`TYPE: ${profile.business_type ?? "local business"}`);
  if (verticalCategory) parts.push(`VERTICAL CATEGORY: ${verticalCategory} (${getVerticalContext(verticalCategory)})`);
  if (profile.address) parts.push(`LOCATION: ${profile.address}`);
  if (profile.google_rating) parts.push(`GOOGLE RATING: ${profile.google_rating}/5 (${profile.google_review_count ?? 0} reviews)`);

  if (profile.business_description_raw) {
    parts.push(`\nWEBSITE DESCRIPTION:\n${profile.business_description_raw.slice(0, 500)}`);
  }

  if (reviews.length > 0) {
    parts.push(`\nCUSTOMER REVIEWS (${reviews.length} total):`);
    for (const r of reviews.slice(0, 6)) {
      parts.push(`  ${r.rating ?? "?"}★ — "${(r.text ?? "").slice(0, 200)}"`);
    }
  }

  if (socialProfiles.length > 0) {
    parts.push(`\nSOCIAL PROFILES:`);
    for (const sp of socialProfiles) {
      if (sp.bio) parts.push(`  ${sp.platform}: "${sp.bio.slice(0, 150)}"`);
    }
  }

  const categories = googleBusiness.categories;
  if (categories) {
    parts.push(`\nGOOGLE CATEGORIES: ${JSON.stringify(categories)}`);
  }

  if (analysis) {
    parts.push(`\nEXISTING BRAND COLOURS: ${JSON.stringify(analysis.colours)}`);
    parts.push(`EXISTING FONTS: ${JSON.stringify(analysis.fonts)}`);
    if (analysis.services.length > 0) {
      parts.push(`SCRAPED SERVICES: ${analysis.services.join(", ")}`);
    }
  }

  // Instagram data (rich brand signals)
  const instagram = safeJsonParse<Record<string, unknown> | null>(
    (profile as unknown as Record<string, string>).instagram_json, null,
  );
  if (instagram) {
    parts.push(`\nINSTAGRAM PROFILE:`);
    if (instagram.bio) parts.push(`  Bio: "${instagram.bio}"`);
    if (instagram.followers) parts.push(`  Followers: ${instagram.followers}`);
    if (instagram.is_business) parts.push(`  Business account: yes`);
    if (instagram.category) parts.push(`  Category: ${instagram.category}`);
    const posts = (instagram.recent_posts as Array<{ caption?: string; likes?: number; hashtags?: string[] }>) ?? [];
    if (posts.length > 0) {
      parts.push(`  Recent posts (${posts.length}):`);
      for (const p of posts.slice(0, 6)) {
        parts.push(`    - "${(p.caption ?? "").slice(0, 150)}" (${p.likes ?? 0} likes)`);
      }
    }
    const topTags = (instagram.top_hashtags as Array<{ tag: string; count: number }>) ?? [];
    if (topTags.length > 0) {
      parts.push(`  Top hashtags: ${topTags.map((t) => `#${t.tag}`).join(", ")}`);
    }
    const engagement = instagram.avg_engagement as { avg_likes?: number; avg_comments?: number } | undefined;
    if (engagement) {
      parts.push(`  Avg engagement: ${engagement.avg_likes} likes, ${engagement.avg_comments} comments per post`);
    }
  }

  if (profile.website_quality_score !== undefined) {
    parts.push(`\nWEBSITE QUALITY SCORE: ${profile.website_quality_score}/100`);
  }
  if (profile.pain_points_json) {
    const painPoints = safeJsonParse<string[]>(profile.pain_points_json, []);
    if (painPoints.length > 0) {
      parts.push(`CURRENT WEAKNESSES: ${painPoints.join("; ")}`);
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFallback(
  profile: ProfileResult,
  analysis: BrandAnalysis | undefined,
): BrandIntelligenceResult {
  return {
    lead_id: profile.lead_id ?? profile.business_name,
    tone: "professional",
    personality: "reliable and approachable",
    voice_examples: [],
    unique_selling_points: [],
    customer_sentiment: "no reviews available",
    common_praise: [],
    market_position: "mid-range",
    suggested_headline: "",
    suggested_tagline: "",
    suggested_about: "",
    refined_services: (analysis?.services ?? []).map((s) => ({ name: s, description: "" })),
    trust_signals: [],
    differentiators: [],
  };
}

function validatePosition(
  pos: string | undefined,
): BrandIntelligenceResult["market_position"] {
  const valid = ["budget", "mid-range", "premium", "luxury"] as const;
  if (pos && valid.includes(pos as typeof valid[number])) {
    return pos as typeof valid[number];
  }
  return "mid-range";
}

function getVerticalContext(category: string): string {
  switch (category) {
    case "food": return "restaurant/cafe/takeaway — focus on food quality, atmosphere, hygiene rating, online ordering";
    case "beauty": return "salon/barber/spa — focus on expertise, client transformations, hygiene, licensed professionals";
    case "retail": return "shop/boutique/store — focus on product range, unique offerings, customer experience";
    case "professional": return "office-based service — focus on qualifications, experience, client outcomes";
    case "trades": return "trade/contractor — focus on certifications, before/after work, reliability";
    default: return "local business — focus on what makes them unique in their community";
  }
}

function safeJsonParse<T>(json: string | undefined | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** Search nested upstream artifacts for a key (pipeline engine nests by node_id) */
function findInUpstream<T>(
  artifacts: Record<string, unknown>,
  key: string,
): T | undefined {
  if (key in artifacts) return artifacts[key] as T;
  for (const val of Object.values(artifacts)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;
      if (key in nested) return nested[key] as T;
    }
  }
  return undefined;
}
