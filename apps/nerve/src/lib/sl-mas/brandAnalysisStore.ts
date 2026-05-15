import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────

export type LogoKind = "clean_vector" | "hand_imperfect" | "asset_only" | (string & {});

export interface BrandAnalysisInput {
  analysis_id: string; // caller-supplied natural key
  lead_id: string;
  brief_id?: string; // soft FK to SiteBrief.brief_id
  dominant_hex?: string;
  dominant_pct?: number; // 0-100
  neutral_hex?: string;
  neutral_pct?: number;
  accent_hex?: string;
  accent_pct?: number;
  display_font?: string;
  display_fallback?: string;
  body_font?: string;
  body_fallback?: string;
  mono_font?: string;
  mono_fallback?: string;
  logo_description?: string;
  logo_kind?: LogoKind;
  voice_adjectives?: string[];
  voice_quotes?: string[];
  positioning_reference?: string;
  positioning_rationale?: string;
  asset_notes?: string[];
  photo_roles?: Record<string, string>; // filename → role; Phase 2 commits placement defaults so /build-demo doesn't re-classify
  analysis_markdown?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  analyzed_at?: string; // ISO
}

export interface BrandAnalysisRow {
  id: string;
  analysis_id: string;
  lead_id: string;
  brief_id?: string;
  dominant_hex?: string;
  dominant_pct?: number;
  neutral_hex?: string;
  neutral_pct?: number;
  accent_hex?: string;
  accent_pct?: number;
  display_font?: string;
  display_fallback?: string;
  body_font?: string;
  body_fallback?: string;
  mono_font?: string;
  mono_fallback?: string;
  logo_description?: string;
  logo_kind?: string;
  voice_adjectives: string[];
  voice_quotes: string[];
  positioning_reference?: string;
  positioning_rationale?: string;
  asset_notes: string[];
  photo_roles: Record<string, string>;
  analysis_markdown?: string;
  source: string;
  metadata: Record<string, unknown>;
  analyzed_at: string;
  created_at: string;
  updated_at: string;
}

export interface BrandAnalysisIngestResult {
  analysis_id: string;
  inserted: boolean;
  row: BrandAnalysisRow;
}

/**
 * NERVE-side store for `brand_analyses`. Same idempotent-on-natural-key
 * pattern as siteBriefStore — caller supplies `analysis_id`, replays are
 * a no-op. Soft FK to `site_briefs.brief_id` so analyses without a parent
 * brief are still valid.
 */
export const brandAnalysisStore = {
  async ingest(input: BrandAnalysisInput): Promise<BrandAnalysisIngestResult> {
    const existing = await prisma.brandAnalysis.findUnique({
      where: { analysisId: input.analysis_id },
    });
    if (existing) {
      return {
        analysis_id: existing.analysisId,
        inserted: false,
        row: rowToAnalysis(existing),
      };
    }
    const row = await prisma.brandAnalysis.create({
      data: inputToCreate(input),
    });
    return {
      analysis_id: row.analysisId,
      inserted: true,
      row: rowToAnalysis(row),
    };
  },

  async getById(analysisId: string): Promise<BrandAnalysisRow | null> {
    const row = await prisma.brandAnalysis.findUnique({
      where: { analysisId },
    });
    return row ? rowToAnalysis(row) : null;
  },

  async latestForLead(leadId: string): Promise<BrandAnalysisRow | null> {
    const row = await prisma.brandAnalysis.findFirst({
      where: { leadId },
      orderBy: { analyzedAt: "desc" },
    });
    return row ? rowToAnalysis(row) : null;
  },

  async getByBriefId(briefId: string): Promise<BrandAnalysisRow | null> {
    const row = await prisma.brandAnalysis.findFirst({
      where: { briefId },
      orderBy: { analyzedAt: "desc" },
    });
    return row ? rowToAnalysis(row) : null;
  },

  async listByPositioning(
    positioningReference: string,
    limit = 50,
  ): Promise<BrandAnalysisRow[]> {
    const rows = await prisma.brandAnalysis.findMany({
      where: { positioningReference },
      orderBy: { analyzedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToAnalysis);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type BrandAnalysisDb = Awaited<ReturnType<typeof prisma.brandAnalysis.findUnique>>;

function inputToCreate(input: BrandAnalysisInput): Prisma.BrandAnalysisCreateInput {
  const analyzedAt = input.analyzed_at ? new Date(input.analyzed_at) : new Date();
  return {
    analysisId: input.analysis_id,
    leadId: input.lead_id,
    briefId: input.brief_id ?? null,
    dominantHex: input.dominant_hex ?? null,
    dominantPct: input.dominant_pct ?? null,
    neutralHex: input.neutral_hex ?? null,
    neutralPct: input.neutral_pct ?? null,
    accentHex: input.accent_hex ?? null,
    accentPct: input.accent_pct ?? null,
    displayFont: input.display_font ?? null,
    displayFallback: input.display_fallback ?? null,
    bodyFont: input.body_font ?? null,
    bodyFallback: input.body_fallback ?? null,
    monoFont: input.mono_font ?? null,
    monoFallback: input.mono_fallback ?? null,
    logoDescription: input.logo_description ?? null,
    logoKind: input.logo_kind ?? null,
    voiceAdjectives: input.voice_adjectives ?? [],
    voiceQuotes: input.voice_quotes ?? [],
    positioningReference: input.positioning_reference ?? null,
    positioningRationale: input.positioning_rationale ?? null,
    assetNotes: input.asset_notes ?? [],
    photoRoles: (input.photo_roles ?? {}) as Prisma.InputJsonValue,
    analysisMarkdown: input.analysis_markdown ?? null,
    source: input.source ?? "manual_skill",
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    analyzedAt,
  };
}

function rowToAnalysis(row: NonNullable<BrandAnalysisDb>): BrandAnalysisRow {
  return {
    id: row.id,
    analysis_id: row.analysisId,
    lead_id: row.leadId,
    brief_id: row.briefId ?? undefined,
    dominant_hex: row.dominantHex ?? undefined,
    dominant_pct: row.dominantPct ?? undefined,
    neutral_hex: row.neutralHex ?? undefined,
    neutral_pct: row.neutralPct ?? undefined,
    accent_hex: row.accentHex ?? undefined,
    accent_pct: row.accentPct ?? undefined,
    display_font: row.displayFont ?? undefined,
    display_fallback: row.displayFallback ?? undefined,
    body_font: row.bodyFont ?? undefined,
    body_fallback: row.bodyFallback ?? undefined,
    mono_font: row.monoFont ?? undefined,
    mono_fallback: row.monoFallback ?? undefined,
    logo_description: row.logoDescription ?? undefined,
    logo_kind: row.logoKind ?? undefined,
    voice_adjectives: row.voiceAdjectives,
    voice_quotes: row.voiceQuotes,
    positioning_reference: row.positioningReference ?? undefined,
    positioning_rationale: row.positioningRationale ?? undefined,
    asset_notes: row.assetNotes,
    photo_roles: (row.photoRoles ?? {}) as Record<string, string>,
    analysis_markdown: row.analysisMarkdown ?? undefined,
    source: row.source,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    analyzed_at: row.analyzedAt.toISOString(),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
