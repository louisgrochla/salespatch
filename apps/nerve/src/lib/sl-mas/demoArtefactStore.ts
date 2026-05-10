import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────

export interface DemoArtefactInput {
  artefact_id: string; // caller-supplied natural key, eg "<lead_slug>-demo-<iso_no_colons>"
  lead_id: string;
  brief_id?: string; // soft FK to SiteBrief.brief_id
  composer_iteration_id?: string; // soft FK to ComposerIteration.iteration_id
  business_name: string;
  vertical?: string;
  html_inline: string; // full self-contained demo.html
  photo_count?: number; // count of inline <img data:...> embeds
  aesthetic_positioning?: string; // mirrored from BrandAnalysis for join-free queries
  dominant_hex?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  generated_at?: string; // ISO timestamp
}

export interface DemoArtefactRow {
  id: string;
  artefact_id: string;
  lead_id: string;
  brief_id?: string;
  composer_iteration_id?: string;
  business_name: string;
  vertical?: string;
  html_inline: string;
  html_size_bytes: number;
  photo_count: number;
  aesthetic_positioning?: string;
  dominant_hex?: string;
  source: string;
  metadata: Record<string, unknown>;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface DemoArtefactIngestResult {
  artefact_id: string;
  inserted: boolean; // false = duplicate replay, row returned unchanged
  row: DemoArtefactRow;
}

// Lighter row shape for list endpoints — drops the heavy html_inline blob.
export type DemoArtefactSummary = Omit<DemoArtefactRow, "html_inline">;

/**
 * NERVE-side store for `demo_artefacts`. Idempotent on `artefact_id` so the
 * build-demo skill / Pi composer can retry on transient network failure
 * without inserting duplicate rows. Re-rendering the same lead with a
 * different artefact_id (next iteration) creates a new row, and the
 * (lead_id, generated_at DESC) index makes "latest demo for X" a single
 * query.
 *
 * List helpers return the summary shape (no html_inline) by default to
 * keep payloads sane — the AI layer pulls the html on demand via getById.
 */
export const demoArtefactStore = {
  async ingest(input: DemoArtefactInput): Promise<DemoArtefactIngestResult> {
    const existing = await prisma.demoArtefact.findUnique({
      where: { artefactId: input.artefact_id },
    });
    if (existing) {
      return {
        artefact_id: existing.artefactId,
        inserted: false,
        row: rowToArtefact(existing),
      };
    }
    const row = await prisma.demoArtefact.create({
      data: inputToCreate(input),
    });
    return {
      artefact_id: row.artefactId,
      inserted: true,
      row: rowToArtefact(row),
    };
  },

  async getById(artefactId: string): Promise<DemoArtefactRow | null> {
    const row = await prisma.demoArtefact.findUnique({
      where: { artefactId },
    });
    return row ? rowToArtefact(row) : null;
  },

  async latestForLead(leadId: string): Promise<DemoArtefactRow | null> {
    const row = await prisma.demoArtefact.findFirst({
      where: { leadId },
      orderBy: { generatedAt: "desc" },
    });
    return row ? rowToArtefact(row) : null;
  },

  async listForLead(
    leadId: string,
    limit = 20,
  ): Promise<DemoArtefactSummary[]> {
    const rows = await prisma.demoArtefact.findMany({
      where: { leadId },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToSummary);
  },

  async listByVertical(
    vertical: string,
    limit = 50,
  ): Promise<DemoArtefactSummary[]> {
    const rows = await prisma.demoArtefact.findMany({
      where: { vertical },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToSummary);
  },

  async listByPositioning(
    aestheticPositioning: string,
    limit = 50,
  ): Promise<DemoArtefactSummary[]> {
    const rows = await prisma.demoArtefact.findMany({
      where: { aestheticPositioning },
      orderBy: { generatedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToSummary);
  },

  async getByBriefId(briefId: string): Promise<DemoArtefactRow | null> {
    const row = await prisma.demoArtefact.findFirst({
      where: { briefId },
      orderBy: { generatedAt: "desc" },
    });
    return row ? rowToArtefact(row) : null;
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type DemoArtefactDb = Awaited<ReturnType<typeof prisma.demoArtefact.findUnique>>;

function inputToCreate(input: DemoArtefactInput): Prisma.DemoArtefactCreateInput {
  const generatedAt = input.generated_at ? new Date(input.generated_at) : new Date();
  // Compute size from the actual byte length, not the caller's claim.
  const htmlSizeBytes = Buffer.byteLength(input.html_inline, "utf8");
  return {
    artefactId: input.artefact_id,
    leadId: input.lead_id,
    briefId: input.brief_id ?? null,
    composerIterationId: input.composer_iteration_id ?? null,
    businessName: input.business_name,
    vertical: input.vertical ?? null,
    htmlInline: input.html_inline,
    htmlSizeBytes,
    photoCount: input.photo_count ?? 0,
    aestheticPositioning: input.aesthetic_positioning ?? null,
    dominantHex: input.dominant_hex ?? null,
    source: input.source ?? "manual_skill",
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    generatedAt,
  };
}

function rowToArtefact(row: NonNullable<DemoArtefactDb>): DemoArtefactRow {
  return {
    id: row.id,
    artefact_id: row.artefactId,
    lead_id: row.leadId,
    brief_id: row.briefId ?? undefined,
    composer_iteration_id: row.composerIterationId ?? undefined,
    business_name: row.businessName,
    vertical: row.vertical ?? undefined,
    html_inline: row.htmlInline,
    html_size_bytes: row.htmlSizeBytes,
    photo_count: row.photoCount,
    aesthetic_positioning: row.aestheticPositioning ?? undefined,
    dominant_hex: row.dominantHex ?? undefined,
    source: row.source,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    generated_at: row.generatedAt.toISOString(),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function rowToSummary(row: NonNullable<DemoArtefactDb>): DemoArtefactSummary {
  const full = rowToArtefact(row);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { html_inline: _drop, ...summary } = full;
  return summary;
}
