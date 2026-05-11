import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────
//
// snake_case to match the /lead-json skill output and on-the-wire ingest
// payload. Prisma client is camelCase internally; mappers below translate.

export interface PitchObjection {
  objection: string;
  response: string;
}

export interface PitchBriefInput {
  pitch_brief_id: string; // <slug>-pitch-<iso_no_colons>
  lead_id: string;
  brief_id?: string | null;
  business_name: string;
  vertical?: string | null;
  business_type?: string | null;
  postcode?: string | null;
  address?: string | null;
  description?: string | null;
  hero_headline?: string | null;
  cta_text?: string | null;
  services?: string[];
  pain_points?: string[];
  opening_hours?: string[];
  trust_badges?: string[];
  avoid_topics?: string[];
  contact_name?: string | null;
  contact_role?: string | null;
  brand_primary_hex?: string | null;
  brand_accent_hex?: string | null;
  demo_site_domain?: string | null;
  hook?: string | null;
  opener?: string | null;
  demo_moments?: string[];
  close_script?: string | null;
  next_visit_reason?: string | null;
  specific_objections?: PitchObjection[];
  source?: string;
  metadata?: Record<string, unknown>;
  generated_at?: string;
}

export interface PitchBriefRow {
  id: string;
  pitch_brief_id: string;
  lead_id: string;
  brief_id: string | null;
  business_name: string;
  vertical: string | null;
  business_type: string | null;
  postcode: string | null;
  address: string | null;
  description: string | null;
  hero_headline: string | null;
  cta_text: string | null;
  services: string[];
  pain_points: string[];
  opening_hours: string[];
  trust_badges: string[];
  avoid_topics: string[];
  contact_name: string | null;
  contact_role: string | null;
  brand_primary_hex: string | null;
  brand_accent_hex: string | null;
  demo_site_domain: string | null;
  hook: string | null;
  opener: string | null;
  demo_moments: string[];
  close_script: string | null;
  next_visit_reason: string | null;
  specific_objections: PitchObjection[];
  source: string;
  metadata: Record<string, unknown>;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface PitchBriefIngestResult {
  pitch_brief_id: string;
  inserted: boolean; // false = duplicate replay, row returned unchanged
  row: PitchBriefRow;
}

/**
 * NERVE-side store for `pitch_briefs`. Idempotent on `pitch_brief_id` so
 * skill retries collapse to a single row. Re-running with a fresh
 * pitch_brief_id (new iso ts) creates a new history row — same shape as
 * site_briefs.
 */
export const pitchBriefStore = {
  async ingest(input: PitchBriefInput): Promise<PitchBriefIngestResult> {
    const existing = await prisma.pitchBrief.findUnique({
      where: { pitchBriefId: input.pitch_brief_id },
    });
    if (existing) {
      return {
        pitch_brief_id: existing.pitchBriefId,
        inserted: false,
        row: rowToOut(existing),
      };
    }
    const row = await prisma.pitchBrief.create({
      data: inputToCreate(input),
    });
    return {
      pitch_brief_id: row.pitchBriefId,
      inserted: true,
      row: rowToOut(row),
    };
  },

  async getById(pitchBriefId: string): Promise<PitchBriefRow | null> {
    const row = await prisma.pitchBrief.findUnique({
      where: { pitchBriefId },
    });
    return row ? rowToOut(row) : null;
  },

  async latestForLead(leadId: string): Promise<PitchBriefRow | null> {
    const row = await prisma.pitchBrief.findFirst({
      where: { leadId },
      orderBy: { generatedAt: "desc" },
    });
    return row ? rowToOut(row) : null;
  },

  async listForLead(leadId: string, limit = 10): Promise<PitchBriefRow[]> {
    const rows = await prisma.pitchBrief.findMany({
      where: { leadId },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToOut);
  },

  async listByVertical(vertical: string, limit = 50): Promise<PitchBriefRow[]> {
    const rows = await prisma.pitchBrief.findMany({
      where: { vertical },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToOut);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type Db = Awaited<ReturnType<typeof prisma.pitchBrief.findUnique>>;

function inputToCreate(input: PitchBriefInput): Prisma.PitchBriefCreateInput {
  const generatedAt = input.generated_at
    ? new Date(input.generated_at)
    : new Date();
  return {
    pitchBriefId: input.pitch_brief_id,
    leadId: input.lead_id,
    briefId: input.brief_id ?? null,
    businessName: input.business_name,
    vertical: input.vertical ?? null,
    businessType: input.business_type ?? null,
    postcode: input.postcode ?? null,
    address: input.address ?? null,
    description: input.description ?? null,
    heroHeadline: input.hero_headline ?? null,
    ctaText: input.cta_text ?? null,
    services: input.services ?? [],
    painPoints: input.pain_points ?? [],
    openingHours: input.opening_hours ?? [],
    trustBadges: input.trust_badges ?? [],
    avoidTopics: input.avoid_topics ?? [],
    contactName: input.contact_name ?? null,
    contactRole: input.contact_role ?? null,
    brandPrimaryHex: input.brand_primary_hex ?? null,
    brandAccentHex: input.brand_accent_hex ?? null,
    demoSiteDomain: input.demo_site_domain ?? null,
    hook: input.hook ?? null,
    opener: input.opener ?? null,
    demoMoments: input.demo_moments ?? [],
    closeScript: input.close_script ?? null,
    nextVisitReason: input.next_visit_reason ?? null,
    specificObjections: (input.specific_objections ??
      []) as unknown as Prisma.InputJsonValue,
    source: input.source ?? "manual_skill",
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    generatedAt,
  };
}

function rowToOut(row: NonNullable<Db>): PitchBriefRow {
  return {
    id: row.id,
    pitch_brief_id: row.pitchBriefId,
    lead_id: row.leadId,
    brief_id: row.briefId ?? null,
    business_name: row.businessName,
    vertical: row.vertical ?? null,
    business_type: row.businessType ?? null,
    postcode: row.postcode ?? null,
    address: row.address ?? null,
    description: row.description ?? null,
    hero_headline: row.heroHeadline ?? null,
    cta_text: row.ctaText ?? null,
    services: row.services,
    pain_points: row.painPoints,
    opening_hours: row.openingHours,
    trust_badges: row.trustBadges,
    avoid_topics: row.avoidTopics,
    contact_name: row.contactName ?? null,
    contact_role: row.contactRole ?? null,
    brand_primary_hex: row.brandPrimaryHex ?? null,
    brand_accent_hex: row.brandAccentHex ?? null,
    demo_site_domain: row.demoSiteDomain ?? null,
    hook: row.hook ?? null,
    opener: row.opener ?? null,
    demo_moments: row.demoMoments,
    close_script: row.closeScript ?? null,
    next_visit_reason: row.nextVisitReason ?? null,
    specific_objections: (row.specificObjections ??
      []) as unknown as PitchObjection[],
    source: row.source,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    generated_at: row.generatedAt.toISOString(),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
