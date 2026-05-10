import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────

export type QaIssueSeverity = "error" | "warning" | "info" | (string & {});

export interface QaIssue {
  severity: QaIssueSeverity;
  area: string; // e.g. "html", "a11y", "contrast", "performance"
  message: string;
  line?: number;
}

export interface QaResultInput {
  qa_id: string; // caller-supplied natural key, eg "<artefact_id>-qa-<iso_no_colons>"
  artefact_id: string; // soft FK to DemoArtefact.artefact_id
  lead_id: string;
  score: number; // 0-100 overall
  passed: boolean; // agent-decided (typically score >= 70)
  html_valid?: boolean;
  html_warnings?: number;
  html_errors?: number;
  accessibility_score?: number;
  contrast_score?: number;
  performance_score?: number;
  issues?: QaIssue[];
  notes?: string;
  agent_id?: string;
  agent_version?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  ran_at?: string; // ISO
}

export interface QaResultRow {
  id: string;
  qa_id: string;
  artefact_id: string;
  lead_id: string;
  score: number;
  passed: boolean;
  html_valid?: boolean;
  html_warnings: number;
  html_errors: number;
  accessibility_score?: number;
  contrast_score?: number;
  performance_score?: number;
  issues: QaIssue[];
  notes?: string;
  agent_id?: string;
  agent_version?: string;
  source: string;
  metadata: Record<string, unknown>;
  ran_at: string;
  created_at: string;
  updated_at: string;
}

export interface QaResultIngestResult {
  qa_id: string;
  inserted: boolean;
  row: QaResultRow;
}

/**
 * NERVE-side store for `qa_results`. Idempotent on `qa_id` so a flaky Pi
 * siteQaAgent retry doesn't double-insert. Soft FK to DemoArtefact via
 * `artefact_id` — not enforced at the DB level so a QA pass can land
 * even if the artefact ingest failed (data still useful for triage).
 *
 * Re-running QA on the same artefact (eg after a fix) creates a new row
 * with a fresh qa_id; latest-for-artefact lookups use the (artefactId,
 * ranAt DESC) index.
 */
export const qaResultStore = {
  async ingest(input: QaResultInput): Promise<QaResultIngestResult> {
    const existing = await prisma.qaResult.findUnique({
      where: { qaId: input.qa_id },
    });
    if (existing) {
      return {
        qa_id: existing.qaId,
        inserted: false,
        row: rowToQa(existing),
      };
    }
    const row = await prisma.qaResult.create({
      data: inputToCreate(input),
    });
    return {
      qa_id: row.qaId,
      inserted: true,
      row: rowToQa(row),
    };
  },

  async getById(qaId: string): Promise<QaResultRow | null> {
    const row = await prisma.qaResult.findUnique({ where: { qaId } });
    return row ? rowToQa(row) : null;
  },

  async latestForArtefact(artefactId: string): Promise<QaResultRow | null> {
    const row = await prisma.qaResult.findFirst({
      where: { artefactId },
      orderBy: { ranAt: "desc" },
    });
    return row ? rowToQa(row) : null;
  },

  async listForArtefact(
    artefactId: string,
    limit = 20,
  ): Promise<QaResultRow[]> {
    const rows = await prisma.qaResult.findMany({
      where: { artefactId },
      orderBy: { ranAt: "desc" },
      take: limit,
    });
    return rows.map(rowToQa);
  },

  async listForLead(leadId: string, limit = 50): Promise<QaResultRow[]> {
    const rows = await prisma.qaResult.findMany({
      where: { leadId },
      orderBy: { ranAt: "desc" },
      take: limit,
    });
    return rows.map(rowToQa);
  },

  async listPassed(limit = 50): Promise<QaResultRow[]> {
    const rows = await prisma.qaResult.findMany({
      where: { passed: true },
      orderBy: { score: "desc" },
      take: limit,
    });
    return rows.map(rowToQa);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type QaResultDb = Awaited<ReturnType<typeof prisma.qaResult.findUnique>>;

function inputToCreate(input: QaResultInput): Prisma.QaResultCreateInput {
  const ranAt = input.ran_at ? new Date(input.ran_at) : new Date();
  return {
    qaId: input.qa_id,
    artefactId: input.artefact_id,
    leadId: input.lead_id,
    score: input.score,
    passed: input.passed,
    htmlValid: input.html_valid ?? null,
    htmlWarnings: input.html_warnings ?? 0,
    htmlErrors: input.html_errors ?? 0,
    accessibilityScore: input.accessibility_score ?? null,
    contrastScore: input.contrast_score ?? null,
    performanceScore: input.performance_score ?? null,
    issues: (input.issues ?? []) as unknown as Prisma.InputJsonValue,
    notes: input.notes ?? null,
    agentId: input.agent_id ?? null,
    agentVersion: input.agent_version ?? null,
    source: input.source ?? "manual_skill",
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    ranAt,
  };
}

function rowToQa(row: NonNullable<QaResultDb>): QaResultRow {
  return {
    id: row.id,
    qa_id: row.qaId,
    artefact_id: row.artefactId,
    lead_id: row.leadId,
    score: row.score,
    passed: row.passed,
    html_valid: row.htmlValid ?? undefined,
    html_warnings: row.htmlWarnings,
    html_errors: row.htmlErrors,
    accessibility_score: row.accessibilityScore ?? undefined,
    contrast_score: row.contrastScore ?? undefined,
    performance_score: row.performanceScore ?? undefined,
    issues: (row.issues ?? []) as unknown as QaIssue[],
    notes: row.notes ?? undefined,
    agent_id: row.agentId ?? undefined,
    agent_version: row.agentVersion ?? undefined,
    source: row.source,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    ran_at: row.ranAt.toISOString(),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
