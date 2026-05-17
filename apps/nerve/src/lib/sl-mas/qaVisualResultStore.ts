import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────
//
// Mirror of `VisualQaResult` defined in
// `apps/nerve/scripts/qa-visual-prompts.ts`. We intentionally redefine the
// shape here (rather than import from `apps/nerve/scripts/`) so the
// Next.js build doesn't pull tsx-only scripts into the bundle. The Zod
// validator at the producer side enforces the contract before POST; this
// store accepts any payload that matches the structural type below.
//
// PR-D: every gradable layer field is nullable. failed_layers MUST list
// every layer name whose field is null, and no others. Producer-side
// Zod refine enforces; we trust it here.

export type LayerName =
  | "bugs"
  | "brand_fidelity"
  | "owner_reaction"
  | "voice_consistency"
  | "customer_reaction"
  | "section_grades";

export interface QaVisualResultInput {
  qa_visual_id: string; // caller-supplied natural key
  artefact_id: string | null;
  lead_id: string;
  demo_path: string | null;
  viewport: { width: number; height: number };
  ran_at: string; // ISO 8601
  producer: "manual_skill" | "sdk_runner";
  model: string;

  bugs: unknown[] | null;
  has_critical: boolean | null;
  bug_count: number | null;

  brand_fidelity: Record<string, unknown> | null;
  owner_reaction: Record<string, unknown> | null;
  voice_consistency: Record<string, unknown> | null;
  customer_reaction: Record<string, unknown> | null;
  section_grades: unknown[] | null;

  failed_layers?: LayerName[];
  notes?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface QaVisualResultRow {
  id: string;
  qa_visual_id: string;
  artefact_id: string | null;
  lead_id: string;
  demo_path: string | null;
  viewport: { width: number; height: number };
  ran_at: string;
  producer: string;
  model: string;
  bugs: unknown[] | null;
  has_critical: boolean | null;
  bug_count: number | null;
  brand_fidelity: Record<string, unknown> | null;
  owner_reaction: Record<string, unknown> | null;
  voice_consistency: Record<string, unknown> | null;
  customer_reaction: Record<string, unknown> | null;
  section_grades: unknown[] | null;
  failed_layers: LayerName[];
  notes: string | null;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface QaVisualResultIngestResult {
  qa_visual_id: string;
  inserted: boolean;
  row: QaVisualResultRow;
}

/**
 * NERVE-side store for `qa_visual_results`. Idempotent on
 * `qa_visual_id` so a producer retry doesn't double-insert. Soft FK to
 * `demo_artefacts.artefact_id` (not enforced at the DB level) so a
 * visual-QA pass can land even if the demo-artefact ingest hasn't
 * arrived yet.
 *
 * Re-running visual QA on the same artefact (eg after a fix) creates a
 * new row with a fresh qa_visual_id; latest-for-artefact lookups use
 * the (artefact_id, ran_at DESC) index.
 */
export const qaVisualResultStore = {
  async ingest(input: QaVisualResultInput): Promise<QaVisualResultIngestResult> {
    const existing = await prisma.qaVisualResult.findUnique({
      where: { qaVisualId: input.qa_visual_id },
    });
    if (existing) {
      return {
        qa_visual_id: existing.qaVisualId,
        inserted: false,
        row: rowToWire(existing),
      };
    }
    const row = await prisma.qaVisualResult.create({
      data: inputToCreate(input),
    });
    return {
      qa_visual_id: row.qaVisualId,
      inserted: true,
      row: rowToWire(row),
    };
  },

  async getById(qaVisualId: string): Promise<QaVisualResultRow | null> {
    const row = await prisma.qaVisualResult.findUnique({
      where: { qaVisualId },
    });
    return row ? rowToWire(row) : null;
  },

  async latestForArtefact(artefactId: string): Promise<QaVisualResultRow | null> {
    const row = await prisma.qaVisualResult.findFirst({
      where: { artefactId },
      orderBy: { ranAt: "desc" },
    });
    return row ? rowToWire(row) : null;
  },

  async listForLead(leadId: string, limit = 50): Promise<QaVisualResultRow[]> {
    const rows = await prisma.qaVisualResult.findMany({
      where: { leadId },
      orderBy: { ranAt: "desc" },
      take: limit,
    });
    return rows.map(rowToWire);
  },

  async listWithCritical(limit = 50): Promise<QaVisualResultRow[]> {
    const rows = await prisma.qaVisualResult.findMany({
      where: { hasCritical: true },
      orderBy: { ranAt: "desc" },
      take: limit,
    });
    return rows.map(rowToWire);
  },

  /**
   * PR-G: cohort baselines for a vertical (or vertical-agnostic when
   * `vertical` is null). Aggregates median grades for numeric
   * dimensions (brand_fidelity / voice_consistency / mean section
   * grade) plus pass-rate percentages for the qualitative layers.
   *
   * Single Postgres query — uses `percentile_cont(0.5)` for medians
   * and `FILTER (WHERE ...)` for the rate counters. The JOIN to
   * `demo_artefacts` is needed because `vertical` lives on the
   * artefact, not on `qa_visual_results` (same pattern as
   * `qaResultStore.byOutcome`).
   *
   * Returns `baselines_available: false` when n < 10 — below that
   * the medians are noise. Producers should still attach a
   * `baseline_comparison` with empty `dimensions` and null
   * `cohort_rates` so downstream queries can distinguish "no cohort
   * yet" from "pre-PR-G producer".
   */
  async computeBaselines(vertical: string | null): Promise<BaselineSummary> {
    interface BaselineRow {
      total_n: number;
      brand_median: number | null;
      voice_median: number | null;
      section_median: number | null;
      critical_count: number;
      owner_yes_count: number;
      customer_yes_count: number;
      trust_high_count: number;
      test_pass_count: number;
    }

    const rows = await prisma.$queryRaw<BaselineRow[]>`
      WITH joined AS (
        SELECT
          qvr.brand_fidelity,
          qvr.voice_consistency,
          qvr.section_grades,
          qvr.has_critical,
          qvr.owner_reaction,
          qvr.customer_reaction,
          CASE
            WHEN qvr.section_grades IS NULL OR jsonb_array_length(qvr.section_grades) = 0
              THEN NULL
            ELSE (
              SELECT AVG((s->>'grade')::numeric)
              FROM jsonb_array_elements(qvr.section_grades) AS s
            )
          END AS section_mean
        FROM qa_visual_results qvr
        LEFT JOIN demo_artefacts da ON da.artefact_id = qvr.artefact_id
        WHERE (${vertical}::text IS NULL OR da.vertical = ${vertical})
      )
      SELECT
        COUNT(*)::int AS total_n,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY (brand_fidelity->>'overall_grade')::numeric
        ) FILTER (WHERE brand_fidelity IS NOT NULL) AS brand_median,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY (voice_consistency->>'overall_grade')::numeric
        ) FILTER (WHERE voice_consistency IS NOT NULL) AS voice_median,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY section_mean)
          FILTER (WHERE section_mean IS NOT NULL) AS section_median,
        COUNT(*) FILTER (WHERE has_critical = true)::int AS critical_count,
        COUNT(*) FILTER (WHERE owner_reaction->>'would_buy' = 'yes')::int AS owner_yes_count,
        COUNT(*) FILTER (WHERE customer_reaction->>'would_act' = 'yes')::int AS customer_yes_count,
        COUNT(*) FILTER (WHERE customer_reaction->>'trust_at_glance' = 'high')::int AS trust_high_count,
        COUNT(*) FILTER (
          WHERE (owner_reaction->>'test_of_success_passes')::boolean = true
        )::int AS test_pass_count
      FROM joined
    `;
    const r = rows[0] ?? {
      total_n: 0,
      brand_median: null,
      voice_median: null,
      section_median: null,
      critical_count: 0,
      owner_yes_count: 0,
      customer_yes_count: 0,
      trust_high_count: 0,
      test_pass_count: 0,
    };
    const totalN = Number(r.total_n) || 0;
    const baselinesAvailable = totalN >= 10;

    const pct = (count: number): number =>
      totalN > 0 ? Math.round((Number(count) / totalN) * 1000) / 10 : 0;

    return {
      vertical,
      total_n: totalN,
      baselines_available: baselinesAvailable,
      medians: baselinesAvailable
        ? {
            brand_fidelity:
              r.brand_median !== null ? Number(r.brand_median) : null,
            voice_consistency:
              r.voice_median !== null ? Number(r.voice_median) : null,
            section_grades_mean:
              r.section_median !== null ? Number(r.section_median) : null,
          }
        : null,
      cohort_rates: baselinesAvailable
        ? {
            has_critical_pct: pct(r.critical_count),
            would_buy_yes_pct: pct(r.owner_yes_count),
            would_act_yes_pct: pct(r.customer_yes_count),
            trust_high_pct: pct(r.trust_high_count),
            test_passes_pct: pct(r.test_pass_count),
          }
        : null,
      sample_size_warning: baselinesAvailable
        ? null
        : `n=${totalN} < 10 — medians not statistically meaningful yet`,
      generated_at: new Date().toISOString(),
    };
  },
};

// ── PR-G: BaselineSummary returned by computeBaselines ─────────────

export interface BaselineSummary {
  vertical: string | null;
  total_n: number;
  baselines_available: boolean;
  medians: {
    brand_fidelity: number | null;
    voice_consistency: number | null;
    section_grades_mean: number | null;
  } | null;
  cohort_rates: {
    has_critical_pct: number;
    would_buy_yes_pct: number;
    would_act_yes_pct: number;
    trust_high_pct: number;
    test_passes_pct: number;
  } | null;
  sample_size_warning: string | null;
  generated_at: string;
}

// ── Internal converters ────────────────────────────────────────────────

function inputToCreate(input: QaVisualResultInput): Prisma.QaVisualResultCreateInput {
  return {
    qaVisualId: input.qa_visual_id,
    artefactId: input.artefact_id,
    leadId: input.lead_id,
    demoPath: input.demo_path,
    viewportWidth: input.viewport.width,
    viewportHeight: input.viewport.height,
    ranAt: new Date(input.ran_at),
    producer: input.producer,
    model: input.model,
    bugs: input.bugs as Prisma.InputJsonValue,
    hasCritical: input.has_critical,
    bugCount: input.bug_count,
    brandFidelity: input.brand_fidelity as Prisma.InputJsonValue,
    ownerReaction: input.owner_reaction as Prisma.InputJsonValue,
    voiceConsistency: input.voice_consistency as Prisma.InputJsonValue,
    customerReaction: input.customer_reaction as Prisma.InputJsonValue,
    sectionGrades: input.section_grades as Prisma.InputJsonValue,
    failedLayers: (input.failed_layers ?? []) as Prisma.InputJsonValue,
    notes: input.notes ?? null,
    source: input.source ?? "manual_skill",
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
  };
}

type PrismaRow = Prisma.QaVisualResultGetPayload<{}>;

function rowToWire(row: PrismaRow): QaVisualResultRow {
  return {
    id: row.id,
    qa_visual_id: row.qaVisualId,
    artefact_id: row.artefactId,
    lead_id: row.leadId,
    demo_path: row.demoPath,
    viewport: { width: row.viewportWidth, height: row.viewportHeight },
    ran_at: row.ranAt.toISOString(),
    producer: row.producer,
    model: row.model,
    bugs: row.bugs as unknown[] | null,
    has_critical: row.hasCritical,
    bug_count: row.bugCount,
    brand_fidelity: row.brandFidelity as Record<string, unknown> | null,
    owner_reaction: row.ownerReaction as Record<string, unknown> | null,
    voice_consistency: row.voiceConsistency as Record<string, unknown> | null,
    customer_reaction: row.customerReaction as Record<string, unknown> | null,
    section_grades: row.sectionGrades as unknown[] | null,
    failed_layers: (row.failedLayers as LayerName[]) ?? [],
    notes: row.notes,
    source: row.source,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
