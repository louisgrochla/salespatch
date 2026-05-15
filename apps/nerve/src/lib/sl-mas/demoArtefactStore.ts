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

// ── Brief-drift aggregation ──────────────────────────────────────────────
//
// PR #80 introduced the `metadata.photo_classifications` drift shape:
//   { filename: { role, brief_role, drift } }
// Legacy rows (Blackbird v1/v2, Nevermind, The Cult of Coffee) carry the
// old shape:
//   { filename: role_string }
// This summary handles both, treating the legacy shape as "no_brief_role"
// because there was no commitment to drift against.

export interface BriefDriftSummary {
  vertical: string | null;
  total_artefacts: number; // demo_artefacts rows with at least one classified photo
  total_classified_photos: number; // sum of entries across all photo_classifications maps
  drift_count: number; // entries where the build's role differed from the brief's
  drift_rate: number; // drift_count / (total_classified_photos - no_brief_role_count); 0 if denominator is 0
  drift_by_brief_role: Record<
    string,
    { n: number; overrode_to: Record<string, number> }
  >;
  no_brief_role_count: number; // entries with brief_role null OR a legacy string-shaped value
  generated_at: string;
}

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

  /**
   * Aggregate the brief→build drift signal across `demo_artefacts`.
   *
   * Optional `vertical` scopes the rollup. SQL handles both metadata shapes:
   *   legacy { filename: "role_string" } → counted toward no_brief_role
   *   new    { filename: { role, brief_role, drift } } → drift counted
   *           when `drift` is true; `brief_role: null` falls under
   *           no_brief_role too.
   *
   * Returns counts plus a drift-by-brief-role breakdown describing where
   * each rejected brief role was overridden to.
   */
  async briefDriftSummary(
    vertical?: string,
  ): Promise<BriefDriftSummary> {
    // Pull every classification entry as one row, with a flag for legacy
    // shape. CROSS JOIN LATERAL jsonb_each unnests the map. Pre-filter
    // rows that actually have a photo_classifications key — most do, but
    // a missing key is legal and would otherwise return null rows.
    const rows = await prisma.$queryRaw<
      Array<{
        artefact_id: string;
        classification: unknown;
        kind: "object" | "string" | "other";
      }>
    >`
      SELECT
        da.artefact_id,
        e.value AS classification,
        jsonb_typeof(e.value) AS kind
      FROM demo_artefacts da
      CROSS JOIN LATERAL jsonb_each(da.metadata -> 'photo_classifications') AS e
      WHERE da.metadata ? 'photo_classifications'
        AND (${vertical ?? null}::text IS NULL OR da.vertical = ${vertical ?? null})
    `;

    const artefactIds = new Set<string>();
    let totalClassifiedPhotos = 0;
    let driftCount = 0;
    let noBriefRoleCount = 0;
    const driftByBriefRole: Record<
      string,
      { n: number; overrode_to: Record<string, number> }
    > = {};

    for (const r of rows) {
      artefactIds.add(r.artefact_id);
      totalClassifiedPhotos += 1;

      if (r.kind === "string") {
        // Legacy shape — no brief commitment was recorded.
        noBriefRoleCount += 1;
        continue;
      }
      if (r.kind !== "object" || r.classification === null) {
        // Unexpected shape (null, array). Don't count as drift; treat as
        // unparseable and bucket with no_brief_role to keep the
        // denominator honest.
        noBriefRoleCount += 1;
        continue;
      }

      const obj = r.classification as Record<string, unknown>;
      const briefRole = (obj.brief_role ?? null) as string | null;
      const finalRole = (obj.role ?? null) as string | null;
      const drift = obj.drift === true;

      if (briefRole === null) {
        noBriefRoleCount += 1;
        continue;
      }
      if (drift && finalRole) {
        driftCount += 1;
        const bucket =
          driftByBriefRole[briefRole] ??
          (driftByBriefRole[briefRole] = { n: 0, overrode_to: {} });
        bucket.n += 1;
        bucket.overrode_to[finalRole] =
          (bucket.overrode_to[finalRole] ?? 0) + 1;
      }
    }

    const denom = totalClassifiedPhotos - noBriefRoleCount;
    const driftRate = denom > 0 ? driftCount / denom : 0;

    return {
      vertical: vertical ?? null,
      total_artefacts: artefactIds.size,
      total_classified_photos: totalClassifiedPhotos,
      drift_count: driftCount,
      drift_rate: Number(driftRate.toFixed(4)),
      drift_by_brief_role: driftByBriefRole,
      no_brief_role_count: noBriefRoleCount,
      generated_at: new Date().toISOString(),
    };
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
