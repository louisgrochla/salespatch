import { prisma } from "@/lib/db";

// What a "winning feature" summary looks like for a vertical. Aggregates
// over lead_profiles whose business_name appears in a closed PitchLog
// row — those are the leads the demo actually sold. The skill consults
// this to bias its choices: if winning barbers have 1000+ followers and
// 20+ photos, the demo should foreground the social-proof + gallery
// patterns even when the current lead is sparser.
//
// PitchLog.businessName is the join key (lead_profiles has the slug-form
// lead_id, but PitchLog only knows the human-readable business name from
// the iOS app). Match is case- and whitespace-insensitive.
//
// If the vertical has zero closed pitches, the helper returns a
// `data_available: false` shape so the caller can degrade gracefully
// rather than treating "no data" as "no winners".

export interface WinningFeaturesSummary {
  vertical: string;
  data_available: boolean;
  closed_count: number;
  total_profiled: number;
  // Numeric medians across closed leads. null when sample size < 1.
  median_instagram_followers: number | null;
  median_instagram_post_count: number | null;
  median_google_rating: number | null;
  median_google_review_count: number | null;
  median_photo_count: number | null;
  // Booleans expressed as proportion-true across the sample (0-1).
  has_logo_rate: number | null;
  has_hero_image_rate: number | null;
  // Top categories among closed leads (vertical is coarse; category is
  // finer, e.g. "skin fade specialist" vs the umbrella "barber").
  top_categories: Array<{ category: string; count: number }>;
  // Lightweight examples — business name + a single distinguishing fact.
  // Capped at 5 to keep the response small for the consuming skill.
  example_winners: Array<{
    business_name: string;
    instagram_followers: number | null;
    google_rating: number | null;
    photo_count: number;
  }>;
  generated_at: string;
}

export async function winningFeaturesForVertical(
  vertical: string,
): Promise<WinningFeaturesSummary> {
  // Closed PitchLog business names for the vertical. We match sector OR
  // businessType against the supplied vertical because both columns are
  // used inconsistently across the existing seed data (sector often
  // matches the dissertation taxonomy; businessType is freer).
  const closedPitches = await prisma.pitchLog.findMany({
    where: {
      outcome: "closed",
      OR: [
        { sector: { equals: vertical, mode: "insensitive" } },
        { businessType: { equals: vertical, mode: "insensitive" } },
      ],
    },
    select: { businessName: true },
  });

  const closedNames = new Set(
    closedPitches.map((p) => normaliseBusinessName(p.businessName)),
  );

  // All lead_profiles in the vertical (small table at solo-founder scale).
  const profiles = await prisma.leadProfile.findMany({
    where: { vertical },
  });

  const winners = profiles.filter((p) =>
    closedNames.has(normaliseBusinessName(p.businessName)),
  );

  const now = new Date().toISOString();

  if (winners.length === 0) {
    return {
      vertical,
      data_available: false,
      closed_count: 0,
      total_profiled: profiles.length,
      median_instagram_followers: null,
      median_instagram_post_count: null,
      median_google_rating: null,
      median_google_review_count: null,
      median_photo_count: null,
      has_logo_rate: null,
      has_hero_image_rate: null,
      top_categories: [],
      example_winners: [],
      generated_at: now,
    };
  }

  return {
    vertical,
    data_available: true,
    closed_count: winners.length,
    total_profiled: profiles.length,
    median_instagram_followers: median(
      winners.map((w) => w.instagramFollowers).filter(isNumber),
    ),
    median_instagram_post_count: median(
      winners.map((w) => w.instagramPostCount).filter(isNumber),
    ),
    median_google_rating: median(
      winners.map((w) => w.googleRating).filter(isNumber),
    ),
    median_google_review_count: median(
      winners.map((w) => w.googleReviewCount).filter(isNumber),
    ),
    median_photo_count: median(winners.map((w) => w.photoCount)),
    has_logo_rate: proportion(winners.map((w) => w.hasLogo)),
    has_hero_image_rate: proportion(winners.map((w) => w.hasHeroImage)),
    top_categories: topCategories(winners.map((w) => w.category)),
    example_winners: winners.slice(0, 5).map((w) => ({
      business_name: w.businessName,
      instagram_followers: w.instagramFollowers,
      google_rating: w.googleRating,
      photo_count: w.photoCount,
    })),
    generated_at: now,
  };
}

// ── helpers ──

function normaliseBusinessName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

function isNumber(v: number | null | undefined): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function proportion(values: boolean[]): number | null {
  if (values.length === 0) return null;
  const trues = values.filter(Boolean).length;
  return trues / values.length;
}

function topCategories(
  categories: Array<string | null>,
  limit = 5,
): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const c of categories) {
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, count]) => ({ category, count }));
}
