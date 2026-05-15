import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────
//
// Snake_case to match the Pi runtime side and the on-the-wire ingest
// payload. The Prisma client converts to/from camelCase internally; row
// mappers below do the translation.

export interface BestReview {
  author: string;
  rating: number;
  text: string;
  date?: string;
}

export interface ServiceEntry {
  name: string;
  description?: string;
  isScraped?: boolean;
}

export interface LeadProfileInput {
  lead_id: string;
  business_name: string;
  business_type?: string;
  vertical?: string;
  category?: string;
  address?: string;
  postcode?: string;
  phone?: string;
  email?: string;
  website_url?: string;
  website_quality_score?: number;
  google_rating?: number;
  google_review_count?: number;
  google_last_review_at?: string;
  google_reviews_last_30d?: number;
  google_reviews_last_90d?: number;
  best_reviews?: BestReview[];
  instagram_handle?: string;
  instagram_followers?: number;
  instagram_post_count?: number;
  ig_last_post_at?: string; // ISO 8601 — most recent post timestamp
  ig_posts_last_90d?: number; // count of posts within trailing 90 days; null if scrape window < 90d
  ig_posts_per_month_median?: number; // median posts/month across the scraped window
  instagram_bio?: string;
  photo_count?: number;
  has_logo?: boolean;
  has_hero_image?: boolean;
  opening_hours?: string[];
  services?: ServiceEntry[];
  price_range?: string;
  qualification_score?: number;
  qualification_reasons?: string[];
  qualifier_verdict?: "qualified" | "rejected" | "uncertain";
  latitude?: number;
  longitude?: number;
  raw_scout_data?: unknown;
  raw_profiler_data?: unknown;
  metadata?: Record<string, unknown>;
  profiled_at?: string;
}

export interface LeadProfileRow {
  id: string;
  lead_id: string;
  business_name: string;
  business_type?: string;
  vertical?: string;
  category?: string;
  address?: string;
  postcode?: string;
  phone?: string;
  email?: string;
  website_url?: string;
  website_quality_score?: number;
  google_rating?: number;
  google_review_count?: number;
  google_last_review_at?: string;
  google_reviews_last_30d?: number;
  google_reviews_last_90d?: number;
  best_reviews?: BestReview[];
  instagram_handle?: string;
  instagram_followers?: number;
  instagram_post_count?: number;
  ig_last_post_at?: string;
  ig_posts_last_90d?: number;
  ig_posts_per_month_median?: number;
  instagram_bio?: string;
  photo_count: number;
  has_logo: boolean;
  has_hero_image: boolean;
  opening_hours: string[];
  services?: ServiceEntry[];
  price_range?: string;
  qualification_score?: number;
  qualification_reasons: string[];
  qualifier_verdict?: string;
  latitude?: number;
  longitude?: number;
  raw_scout_data?: unknown;
  raw_profiler_data?: unknown;
  metadata: Record<string, unknown>;
  profiled_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * NERVE-side store for `lead_profiles`. Mirrors the decisionStore style:
 * snake_case row interfaces, idempotent upsert keyed on `lead_id`, plus
 * read helpers for the dashboard and future AI agents.
 *
 * Re-profiling the same lead UPDATES — no error, no row accretion. The
 * raw payloads (`raw_scout_data`, `raw_profiler_data`) are kept verbatim
 * so a future agent can re-derive structured fields without re-scraping.
 */
export const leadProfileStore = {
  /** Idempotent upsert keyed on lead_id. Re-profiling replaces in place. */
  async upsert(input: LeadProfileInput): Promise<LeadProfileRow> {
    const data = inputToData(input);
    const row = await prisma.leadProfile.upsert({
      where: { leadId: input.lead_id },
      create: data.create,
      update: data.update,
    });
    return rowToProfile(row);
  },

  async getByLeadId(leadId: string): Promise<LeadProfileRow | null> {
    const row = await prisma.leadProfile.findUnique({
      where: { leadId },
    });
    return row ? rowToProfile(row) : null;
  },

  async listRecent(limit = 50): Promise<LeadProfileRow[]> {
    const rows = await prisma.leadProfile.findMany({
      orderBy: { profiledAt: "desc" },
      take: limit,
    });
    return rows.map(rowToProfile);
  },

  async listByVertical(vertical: string, limit = 50): Promise<LeadProfileRow[]> {
    const rows = await prisma.leadProfile.findMany({
      where: { vertical },
      orderBy: { profiledAt: "desc" },
      take: limit,
    });
    return rows.map(rowToProfile);
  },

  async listByVerdict(
    verdict: "qualified" | "rejected" | "uncertain",
    limit = 50,
  ): Promise<LeadProfileRow[]> {
    const rows = await prisma.leadProfile.findMany({
      where: { qualifierVerdict: verdict },
      orderBy: { profiledAt: "desc" },
      take: limit,
    });
    return rows.map(rowToProfile);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type LeadProfileDb = Awaited<ReturnType<typeof prisma.leadProfile.findUnique>>;

function inputToData(input: LeadProfileInput): {
  create: Prisma.LeadProfileCreateInput;
  update: Prisma.LeadProfileUpdateInput;
} {
  const profiledAt = input.profiled_at ? new Date(input.profiled_at) : new Date();
  // Shared shape used for both create and update. Prisma's UpdateInput is
  // assignable from CreateInput for plain scalar/Json fields, which is what
  // we have here — no relations.
  const shared = {
    leadId: input.lead_id,
    businessName: input.business_name,
    businessType: input.business_type ?? null,
    vertical: input.vertical ?? null,
    category: input.category ?? null,
    address: input.address ?? null,
    postcode: input.postcode ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    websiteUrl: input.website_url ?? null,
    websiteQualityScore: input.website_quality_score ?? null,
    googleRating: input.google_rating ?? null,
    googleReviewCount: input.google_review_count ?? null,
    googleLastReviewAt: input.google_last_review_at ? new Date(input.google_last_review_at) : null,
    googleReviewsLast30d: input.google_reviews_last_30d ?? null,
    googleReviewsLast90d: input.google_reviews_last_90d ?? null,
    bestReviews:
      input.best_reviews === undefined
        ? Prisma.JsonNull
        : (input.best_reviews as unknown as Prisma.InputJsonValue),
    instagramHandle: input.instagram_handle ?? null,
    instagramFollowers: input.instagram_followers ?? null,
    instagramPostCount: input.instagram_post_count ?? null,
    igLastPostAt: input.ig_last_post_at ? new Date(input.ig_last_post_at) : null,
    igPostsLast90d: input.ig_posts_last_90d ?? null,
    igPostsPerMonthMedian: input.ig_posts_per_month_median ?? null,
    instagramBio: input.instagram_bio ?? null,
    photoCount: input.photo_count ?? 0,
    hasLogo: input.has_logo ?? false,
    hasHeroImage: input.has_hero_image ?? false,
    openingHours: input.opening_hours ?? [],
    services:
      input.services === undefined
        ? Prisma.JsonNull
        : (input.services as unknown as Prisma.InputJsonValue),
    priceRange: input.price_range ?? null,
    qualificationScore: input.qualification_score ?? null,
    qualificationReasons: input.qualification_reasons ?? [],
    qualifierVerdict: input.qualifier_verdict ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    rawScoutData:
      input.raw_scout_data === undefined
        ? Prisma.JsonNull
        : (input.raw_scout_data as Prisma.InputJsonValue),
    rawProfilerData:
      input.raw_profiler_data === undefined
        ? Prisma.JsonNull
        : (input.raw_profiler_data as Prisma.InputJsonValue),
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    profiledAt,
  } satisfies Prisma.LeadProfileCreateInput;

  return { create: shared, update: shared };
}

function rowToProfile(row: NonNullable<LeadProfileDb>): LeadProfileRow {
  return {
    id: row.id,
    lead_id: row.leadId,
    business_name: row.businessName,
    business_type: row.businessType ?? undefined,
    vertical: row.vertical ?? undefined,
    category: row.category ?? undefined,
    address: row.address ?? undefined,
    postcode: row.postcode ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    website_url: row.websiteUrl ?? undefined,
    website_quality_score: row.websiteQualityScore ?? undefined,
    google_rating: row.googleRating ?? undefined,
    google_review_count: row.googleReviewCount ?? undefined,
    google_last_review_at: row.googleLastReviewAt ? row.googleLastReviewAt.toISOString() : undefined,
    google_reviews_last_30d: row.googleReviewsLast30d ?? undefined,
    google_reviews_last_90d: row.googleReviewsLast90d ?? undefined,
    best_reviews: (row.bestReviews ?? undefined) as BestReview[] | undefined,
    instagram_handle: row.instagramHandle ?? undefined,
    instagram_followers: row.instagramFollowers ?? undefined,
    instagram_post_count: row.instagramPostCount ?? undefined,
    ig_last_post_at: row.igLastPostAt ? row.igLastPostAt.toISOString() : undefined,
    ig_posts_last_90d: row.igPostsLast90d ?? undefined,
    ig_posts_per_month_median: row.igPostsPerMonthMedian ?? undefined,
    instagram_bio: row.instagramBio ?? undefined,
    photo_count: row.photoCount,
    has_logo: row.hasLogo,
    has_hero_image: row.hasHeroImage,
    opening_hours: row.openingHours,
    services: (row.services ?? undefined) as ServiceEntry[] | undefined,
    price_range: row.priceRange ?? undefined,
    qualification_score: row.qualificationScore ?? undefined,
    qualification_reasons: row.qualificationReasons,
    qualifier_verdict: row.qualifierVerdict ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    raw_scout_data: row.rawScoutData ?? undefined,
    raw_profiler_data: row.rawProfilerData ?? undefined,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    profiled_at: row.profiledAt.toISOString(),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
