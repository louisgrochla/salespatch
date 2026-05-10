import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────
//
// snake_case to match the runtime / skill side and the on-the-wire ingest
// payload. Prisma client is camelCase internally; mappers below translate.

export interface BlueprintSection {
  /** Numbered section name as it appears in the brief, e.g. "Hero", "Walk-in status today" */
  name: string;
  /** One-sentence intent for the section as written in the brief */
  intent?: string;
}

export interface SiteBriefInput {
  brief_id: string; // caller-supplied natural key, eg "<lead_slug>-<iso_no_colons>"
  lead_id: string;
  business_name: string;
  business_type?: string;
  vertical?: string;
  postcode?: string;
  address?: string;
  owner_name?: string;
  verdict: "PROCEED" | "PASS" | (string & {});
  verdict_reason?: string;
  google_rating?: number;
  google_review_count?: number;
  instagram_handle?: string;
  instagram_followers?: number;
  years_trading?: string;
  awards_press?: string[];
  diagnosis?: string;
  pitch_angle?: string;
  test_of_success?: string;
  blueprint_sections?: BlueprintSection[];
  brief_markdown: string;
  source?: string;
  metadata?: Record<string, unknown>;
  generated_at?: string; // ISO timestamp
}

export interface SiteBriefRow {
  id: string;
  brief_id: string;
  lead_id: string;
  business_name: string;
  business_type?: string;
  vertical?: string;
  postcode?: string;
  address?: string;
  owner_name?: string;
  verdict: string;
  verdict_reason?: string;
  google_rating?: number;
  google_review_count?: number;
  instagram_handle?: string;
  instagram_followers?: number;
  years_trading?: string;
  awards_press: string[];
  diagnosis?: string;
  pitch_angle?: string;
  test_of_success?: string;
  blueprint_sections?: BlueprintSection[];
  brief_markdown: string;
  source: string;
  metadata: Record<string, unknown>;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface SiteBriefIngestResult {
  brief_id: string;
  inserted: boolean; // false = duplicate replay, row returned unchanged
  row: SiteBriefRow;
}

/**
 * NERVE-side store for `site_briefs`. Idempotent on `brief_id` so the
 * skill / Pi can retry on transient network failure without inserting
 * duplicate rows. The natural pattern is `<lead_slug>-<iso_no_colons>`,
 * eg `noose-and-needle-2026-05-10T175554Z`.
 *
 * History is preserved by design — re-running the skill for the same lead
 * with a different `brief_id` (eg next iteration) creates a new row, and
 * the `(lead_id, generated_at DESC)` index makes "latest brief for X" a
 * single query.
 */
export const siteBriefStore = {
  async ingest(input: SiteBriefInput): Promise<SiteBriefIngestResult> {
    const existing = await prisma.siteBrief.findUnique({
      where: { briefId: input.brief_id },
    });
    if (existing) {
      return {
        brief_id: existing.briefId,
        inserted: false,
        row: rowToBrief(existing),
      };
    }
    const row = await prisma.siteBrief.create({
      data: inputToCreate(input),
    });
    return {
      brief_id: row.briefId,
      inserted: true,
      row: rowToBrief(row),
    };
  },

  async getById(briefId: string): Promise<SiteBriefRow | null> {
    const row = await prisma.siteBrief.findUnique({
      where: { briefId },
    });
    return row ? rowToBrief(row) : null;
  },

  async latestForLead(leadId: string): Promise<SiteBriefRow | null> {
    const row = await prisma.siteBrief.findFirst({
      where: { leadId },
      orderBy: { generatedAt: "desc" },
    });
    return row ? rowToBrief(row) : null;
  },

  async listForLead(leadId: string, limit = 20): Promise<SiteBriefRow[]> {
    const rows = await prisma.siteBrief.findMany({
      where: { leadId },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToBrief);
  },

  async listByVertical(vertical: string, limit = 50): Promise<SiteBriefRow[]> {
    const rows = await prisma.siteBrief.findMany({
      where: { vertical },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToBrief);
  },

  async listByVerdict(
    verdict: "PROCEED" | "PASS",
    limit = 50,
  ): Promise<SiteBriefRow[]> {
    const rows = await prisma.siteBrief.findMany({
      where: { verdict },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToBrief);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type SiteBriefDb = Awaited<ReturnType<typeof prisma.siteBrief.findUnique>>;

function inputToCreate(input: SiteBriefInput): Prisma.SiteBriefCreateInput {
  const generatedAt = input.generated_at ? new Date(input.generated_at) : new Date();
  return {
    briefId: input.brief_id,
    leadId: input.lead_id,
    businessName: input.business_name,
    businessType: input.business_type ?? null,
    vertical: input.vertical ?? null,
    postcode: input.postcode ?? null,
    address: input.address ?? null,
    ownerName: input.owner_name ?? null,
    verdict: input.verdict,
    verdictReason: input.verdict_reason ?? null,
    googleRating: input.google_rating ?? null,
    googleReviewCount: input.google_review_count ?? null,
    instagramHandle: input.instagram_handle ?? null,
    instagramFollowers: input.instagram_followers ?? null,
    yearsTrading: input.years_trading ?? null,
    awardsPress: input.awards_press ?? [],
    diagnosis: input.diagnosis ?? null,
    pitchAngle: input.pitch_angle ?? null,
    testOfSuccess: input.test_of_success ?? null,
    blueprintSections:
      input.blueprint_sections === undefined
        ? Prisma.JsonNull
        : (input.blueprint_sections as unknown as Prisma.InputJsonValue),
    briefMarkdown: input.brief_markdown,
    source: input.source ?? "manual_skill",
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    generatedAt,
  };
}

function rowToBrief(row: NonNullable<SiteBriefDb>): SiteBriefRow {
  return {
    id: row.id,
    brief_id: row.briefId,
    lead_id: row.leadId,
    business_name: row.businessName,
    business_type: row.businessType ?? undefined,
    vertical: row.vertical ?? undefined,
    postcode: row.postcode ?? undefined,
    address: row.address ?? undefined,
    owner_name: row.ownerName ?? undefined,
    verdict: row.verdict,
    verdict_reason: row.verdictReason ?? undefined,
    google_rating: row.googleRating ?? undefined,
    google_review_count: row.googleReviewCount ?? undefined,
    instagram_handle: row.instagramHandle ?? undefined,
    instagram_followers: row.instagramFollowers ?? undefined,
    years_trading: row.yearsTrading ?? undefined,
    awards_press: row.awardsPress,
    diagnosis: row.diagnosis ?? undefined,
    pitch_angle: row.pitchAngle ?? undefined,
    test_of_success: row.testOfSuccess ?? undefined,
    blueprint_sections:
      (row.blueprintSections ?? undefined) as BlueprintSection[] | undefined,
    brief_markdown: row.briefMarkdown,
    source: row.source,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    generated_at: row.generatedAt.toISOString(),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
