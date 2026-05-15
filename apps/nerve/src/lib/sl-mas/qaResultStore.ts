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

  /**
   * Score histogram bucketed by pitch outcome.
   *
   * Closes the loop opened by the QA producer in /build-demo and the
   * outcome stream in `lead_assignment_events`: do high-QA demos close
   * better than low-QA demos?
   *
   * Methodology:
   *   - One QA row per artefact (latest by ranAt) — re-runs don't get
   *     double-counted.
   *   - One outcome per lead (latest by occurredAt). Leads with no
   *     assignment event roll into `no_visit`.
   *   - Outcome status normalised into five buckets matching the
   *     funnel's terminal states.
   *   - Vertical filter joins through `demo_artefacts.vertical` because
   *     QaResult doesn't carry vertical directly.
   *
   * `sample_size_warning` fires when no bucket reaches n>=10. Until then
   * the means are noise.
   */
  async byOutcome(vertical?: string): Promise<QaByOutcomeSummary> {
    const rows = await prisma.$queryRaw<
      Array<{ score: number; outcome_status: string | null }>
    >`
      WITH latest_qa AS (
        SELECT DISTINCT ON (qr.artefact_id)
          qr.artefact_id,
          qr.lead_id,
          qr.score
        FROM qa_results qr
        ORDER BY qr.artefact_id, qr.ran_at DESC
      ),
      latest_event AS (
        SELECT DISTINCT ON (lae.lead_id)
          lae.lead_id,
          lae.status
        FROM lead_assignment_events lae
        ORDER BY lae.lead_id, lae.occurred_at DESC
      )
      SELECT
        lq.score,
        le.status AS outcome_status
      FROM latest_qa lq
      LEFT JOIN demo_artefacts da ON da.artefact_id = lq.artefact_id
      LEFT JOIN latest_event le ON le.lead_id = lq.lead_id
      WHERE ${vertical ?? null}::text IS NULL OR da.vertical = ${vertical ?? null}
    `;

    const byBucket: Record<string, number[]> = {
      closed: [],
      rejected: [],
      pitched_pending: [],
      visited_no_pitch: [],
      no_visit: [],
    };

    for (const r of rows) {
      byBucket[mapStatusToBucket(r.outcome_status)].push(r.score);
    }

    const buckets: QaByOutcomeSummary["buckets"] = {
      closed: scoreStats(byBucket.closed),
      rejected: scoreStats(byBucket.rejected),
      pitched_pending: scoreStats(byBucket.pitched_pending),
      visited_no_pitch: scoreStats(byBucket.visited_no_pitch),
      no_visit: scoreStats(byBucket.no_visit),
    };

    const meaningful = Object.values(buckets).some((b) => b.n >= 10);

    return {
      vertical: vertical ?? null,
      buckets,
      sample_size_warning: meaningful
        ? null
        : "n<10 for every bucket; results not statistically meaningful yet",
      generated_at: new Date().toISOString(),
    };
  },
};

// ── Outcome bucketing ────────────────────────────────────────────────────
//
// LeadAssignmentEvent.status uses the AssignmentStatus enum (knowledge/
// contracts/shared-enums.md): new | visited | pitched | sold | rejected.
// We normalise into five buckets that match the closed-rate question:
//
//   sold        → closed            (the win)
//   rejected    → rejected
//   pitched     → pitched_pending   (pitched, no terminal flip yet)
//   visited     → visited_no_pitch  (visited but never pitched)
//   new / null  → no_visit          (assignment exists but not visited,
//                                    or no assignment events at all)
function mapStatusToBucket(status: string | null): string {
  switch (status) {
    case "sold":
      return "closed";
    case "rejected":
      return "rejected";
    case "pitched":
      return "pitched_pending";
    case "visited":
      return "visited_no_pitch";
    case "new":
    case null:
    default:
      return "no_visit";
  }
}

function scoreStats(
  scores: number[],
): { n: number; score_mean: number | null; score_p50: number | null } {
  if (scores.length === 0) {
    return { n: 0, score_mean: null, score_p50: null };
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const p50 =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return {
    n: sorted.length,
    score_mean: Math.round(mean * 100) / 100,
    score_p50: Math.round(p50 * 100) / 100,
  };
}

export interface QaByOutcomeSummary {
  vertical: string | null;
  buckets: {
    closed: { n: number; score_mean: number | null; score_p50: number | null };
    rejected: { n: number; score_mean: number | null; score_p50: number | null };
    pitched_pending: { n: number; score_mean: number | null; score_p50: number | null };
    visited_no_pitch: { n: number; score_mean: number | null; score_p50: number | null };
    no_visit: { n: number; score_mean: number | null; score_p50: number | null };
  };
  sample_size_warning: string | null;
  generated_at: string;
}

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
