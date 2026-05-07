import { createLogger } from "../../lib/logger.js";
import { AgentHandler } from "../../pipeline/agentRuntime.js";
import type { VerticalCategory } from "./leadScoutAgent.js";

const log = createLogger("lead-qualifier");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LeadWithProfile {
  lead_id?: string;
  business_name: string;
  business_type?: string;
  vertical_category?: VerticalCategory;
  has_premises?: boolean;
  is_chain?: boolean;
  has_website: number;
  website_url?: string | null;
  website_quality_score?: number | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  google_photos_downloaded?: number;
  price_level?: number;
  business_status?: string;
  has_social_links?: number;
  pain_points_json?: string;
  phone?: string;
  email?: string;
  address?: string;
  description?: string;
  reviews?: Array<{ rating: number; text: string; time?: number }>;
  instagram_followers?: number;
  instagram_handle?: string;
}

interface QualifiedLead extends LeadWithProfile {
  qualification_score: number;
  qualification_reasons: string[];
}

interface RejectedLead extends LeadWithProfile {
  rejection_reason: string;
}

// ---------------------------------------------------------------------------
// Scoring config
// ---------------------------------------------------------------------------

const VERTICAL_MULTIPLIERS: Record<string, number> = {
  food: 1.2,
  beauty: 1.2,
  retail: 1.1,
  professional: 1.0,
  trades: 0.9,
  health: 1.1,
  automotive: 1.0,
  services: 1.0,
  unknown: 0.8,
};

// ---------------------------------------------------------------------------
// Hard rejection — instant disqualification
// ---------------------------------------------------------------------------

const KNOWN_CHAINS_EXPANDED = [
  // Fast food
  "mcdonald", "burger king", "kfc", "subway", "domino", "pizza hut", "five guys",
  "taco bell", "wendy", "papa john", "papa johns",
  // Coffee
  "costa", "starbucks", "caffe nero", "pret a manger", "pret ",
  // High street food
  "greggs", "nando", "wagamama", "zizzi", "pizza express", "yo sushi",
  "frankie & benny", "tgi friday", "ask italian", "prezzo", "bella italia",
  "harvester", "beefeater", "toby carvery", "hungry horse",
  // Pubs
  "wetherspoon", "slug and lettuce", "all bar one", "greene king",
  "stonegate", "mitchells & butlers",
  // Hair
  "toni & guy", "toni&guy", "supercuts", "rush hair", "headmasters",
  // Retail
  "tesco", "sainsbury", "asda", "aldi", "lidl", "morrisons", "waitrose",
  "boots", "superdrug", "the body shop", "lush ",
  // Fitness
  "anytime fitness", "puregym", "pure gym", "the gym group", "david lloyd",
  "nuffield health", "virgin active", "bannatyne",
  // Bakery / cake
  "cake box", "black sheep coffee", "gail", "greggs",
  // Other
  "specsavers", "vision express", "eurocar parts", "halfords",
  "kwik fit", "national tyres",
];

interface HardRejectResult {
  rejected: boolean;
  reason: string;
}

function checkHardReject(lead: LeadWithProfile): HardRejectResult {
  // 1. Permanently or temporarily closed
  if (lead.business_status === "CLOSED_PERMANENTLY") {
    return { rejected: true, reason: "Permanently closed" };
  }
  if (lead.business_status === "CLOSED_TEMPORARILY") {
    return { rejected: true, reason: "Temporarily closed" };
  }

  // 2. Instagram followers > 10K = chain signal
  if (lead.instagram_followers && lead.instagram_followers > 10_000) {
    return {
      rejected: true,
      reason: `Chain signal: ${(lead.instagram_followers / 1000).toFixed(1)}K Instagram followers`,
    };
  }

  // 3. Known chain by name
  const nameLower = lead.business_name.toLowerCase();
  for (const chain of KNOWN_CHAINS_EXPANDED) {
    if (nameLower.includes(chain)) {
      return { rejected: true, reason: `Known chain: matches "${chain}"` };
    }
  }

  // 4. is_chain flag from scout
  if (lead.is_chain) {
    return { rejected: true, reason: "Chain/franchise detected by scout" };
  }

  // 5. Google review count > 1000 = large operation
  if (lead.google_review_count && lead.google_review_count > 1000) {
    return {
      rejected: true,
      reason: `Large operation: ${lead.google_review_count} Google reviews`,
    };
  }

  // 6. Website quality > 70 = they don't need us
  if (lead.website_quality_score != null && lead.website_quality_score > 70) {
    return {
      rejected: true,
      reason: `Good existing website (quality ${lead.website_quality_score}/100) — doesn't need us`,
    };
  }

  // 7. No physical premises (unless trades — they go to customers)
  if (lead.has_premises === false && lead.vertical_category !== "trades") {
    return { rejected: true, reason: "No physical premises detected" };
  }

  return { rejected: false, reason: "" };
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const leadQualifierAgent: AgentHandler = async (input) => {
  const upstream = input.upstreamArtifacts as Record<
    string,
    { leads?: LeadWithProfile[]; profiles?: LeadWithProfile[] }
  >;

  const allLeads: LeadWithProfile[] = [];
  const allProfiles = new Map<string, LeadWithProfile>();

  for (const nodeOutput of Object.values(upstream)) {
    if (nodeOutput?.leads) allLeads.push(...nodeOutput.leads);
    if (nodeOutput?.profiles) {
      for (const p of nodeOutput.profiles) {
        if (p.lead_id || p.business_name) {
          allProfiles.set(p.lead_id ?? p.business_name, p);
        }
      }
    }
  }

  const mergedLeads = allLeads.map((lead) => {
    const profile = allProfiles.get(lead.lead_id ?? lead.business_name);
    return profile ? { ...lead, ...profile } : lead;
  });

  const leadsToScore = mergedLeads.length > 0 ? mergedLeads : Array.from(allProfiles.values());

  const qualified: QualifiedLead[] = [];
  const rejected: RejectedLead[] = [];

  for (const lead of leadsToScore) {
    // Hard rejections first — instant disqualification
    const hardReject = checkHardReject(lead);
    if (hardReject.rejected) {
      rejected.push({ ...lead, rejection_reason: hardReject.reason });
      continue;
    }

    const { score, reasons } = scoreLead(lead);
    const vertical = lead.vertical_category ?? "unknown";
    const multiplier = VERTICAL_MULTIPLIERS[vertical] ?? 0.8;
    const finalScore = Math.round(score * multiplier);

    if (multiplier !== 1.0) {
      reasons.push(`Vertical: ${vertical} (×${multiplier})`);
    }

    if (finalScore >= 30) {
      qualified.push({ ...lead, qualification_score: finalScore, qualification_reasons: reasons });
    } else {
      const reason = `Score ${finalScore} below threshold — ${reasons.join("; ") || "insufficient signals"}`;
      rejected.push({ ...lead, rejection_reason: reason });
    }
  }

  qualified.sort((a, b) => b.qualification_score - a.qualification_score);

  const tradeCount = leadsToScore.filter((l) => l.vertical_category === "trades").length;
  const chainCount = leadsToScore.filter((l) => l.is_chain).length;
  const newBusinessCount = qualified.filter((l) => (l.google_review_count ?? 0) < 30).length;

  log.info("qualification complete", {
    total: leadsToScore.length,
    qualified: qualified.length,
    rejected: rejected.length,
    trades: tradeCount,
    chains: chainCount,
    new_businesses: newBusinessCount,
  });

  return {
    summary: `Qualified ${qualified.length}/${leadsToScore.length}. Top: ${qualified[0]?.qualification_score ?? 0}. Rejected: ${rejected.length} (${tradeCount} trades, ${chainCount} chains). ${newBusinessCount} new businesses.`,
    artifacts: {
      qualified,
      rejected,
      qualified_count: qualified.length,
      rejected_count: rejected.length,
      avg_score: qualified.length > 0
        ? Math.round(qualified.reduce((sum, l) => sum + l.qualification_score, 0) / qualified.length)
        : 0,
      _decision: {
        reasoning: `Scored ${leadsToScore.length} leads. ${qualified.length} qualified. ${newBusinessCount} new/small businesses prioritised. ${chainCount} chains deprioritised. Top verticals: ${[...new Set(qualified.map((q) => q.vertical_category))].join(", ")}`,
        alternatives: ["Could train scoring weights from close-rate data", "Could add foot-traffic estimates"],
        confidence: qualified.length > 0 ? 0.8 : 0.4,
        tags: [`qualified:${qualified.length}`, `new:${newBusinessCount}`],
      },
    },
  };
};

// ---------------------------------------------------------------------------
// Scoring model
// ---------------------------------------------------------------------------

function scoreLead(lead: LeadWithProfile): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const reviews = lead.google_review_count ?? 0;

  // ── WEBSITE OPPORTUNITY ──
  // Note: websites with quality > 70 are hard-rejected before reaching scoring
  if (!lead.has_website || lead.has_website === 0) {
    score += 40;
    reasons.push("No website — prime candidate");
  } else if (lead.website_quality_score != null && lead.website_quality_score < 40) {
    score += 30;
    reasons.push(`Poor website (quality ${lead.website_quality_score}/100)`);
  } else if (lead.website_quality_score != null && lead.website_quality_score < 60) {
    score += 15;
    reasons.push(`Below-average website (${lead.website_quality_score}/100)`);
  } else if (lead.website_quality_score != null && lead.website_quality_score <= 70) {
    score += 5;
    reasons.push(`Decent website but could be better (${lead.website_quality_score}/100)`);
  }

  // ── NEW BUSINESS SIGNALS (high priority) ──
  if (reviews > 0 && reviews < 10) {
    score += 20;
    reasons.push(`Just opened — only ${reviews} reviews`);
  } else if (reviews >= 10 && reviews < 30 && (lead.google_rating ?? 0) >= 3.5) {
    score += 25;
    reasons.push(`New & growing — ${reviews} reviews, ${lead.google_rating}★`);
  } else if (reviews >= 30 && reviews < 100) {
    score += 10;
    reasons.push(`Established local (${reviews} reviews)`);
  } else if (reviews >= 100 && reviews < 500) {
    score += 5;
    reasons.push(`Well-known (${reviews} reviews)`);
  } else if (reviews >= 500) {
    score -= 20;
    reasons.push(`Very established (${reviews} reviews) — less likely to need us`);
  }

  // ── RATING ──
  if (lead.google_rating != null && lead.google_rating >= 4.0) {
    score += 5;
    reasons.push(`Good reputation (${lead.google_rating}★)`);
  }

  // ── PREMISES ──
  if (lead.has_premises) {
    score += 15;
    reasons.push("Physical premises — walk-in friendly");
  }

  // ── PRICE LEVEL ──
  if (lead.price_level !== undefined) {
    if (lead.price_level <= 2) {
      score += 10;
      reasons.push(`Budget/mid-range (level ${lead.price_level}) — price-sensitive, sees value`);
    } else if (lead.price_level === 3) {
      score += 5;
      reasons.push("Upper mid-range");
    } else if (lead.price_level >= 4) {
      score -= 10;
      reasons.push("Luxury — corporate decisions, harder sell");
    }
  }

  // ── CONTACT ──
  if (lead.phone) {
    score += 10;
    reasons.push("Phone number available");
  }

  // ── CHAIN DETECTION ──
  // Note: known chains and high-follower accounts are hard-rejected before scoring.
  // This only catches edge cases where is_chain wasn't strong enough for hard reject.

  // ── SOCIAL PRESENCE ──
  if (lead.has_social_links) {
    score += 5;
    reasons.push("Social media present — marketing-aware");
  }

  // ── GOOGLE PHOTOS ──
  if ((lead.google_photos_downloaded ?? 0) === 0) {
    score += 10;
    reasons.push("No Google photos — not investing in online presence");
  }

  // ── NO WEBSITE + FEW REVIEWS COMBO ──
  if ((!lead.has_website || lead.has_website === 0) && reviews < 50 && reviews > 0) {
    score += 15;
    reasons.push("No website + low reviews = not getting discovered online");
  }

  // ── BUSINESS STATUS ──
  // Note: closed businesses are hard-rejected before scoring
  if (lead.business_status === "OPERATIONAL") {
    score += 5;
    reasons.push("Confirmed operational");
  }

  // ── PAIN POINTS ──
  if (lead.pain_points_json) {
    try {
      const painPoints = JSON.parse(lead.pain_points_json as string) as string[];
      if (painPoints.length >= 3) {
        score += 10;
        reasons.push(`${painPoints.length} pain points identified`);
      } else if (painPoints.length >= 1) {
        score += 5;
      }
    } catch { /* ignore */ }
  }

  return { score, reasons };
}
