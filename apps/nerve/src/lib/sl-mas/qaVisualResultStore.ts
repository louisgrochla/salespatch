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
};

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
