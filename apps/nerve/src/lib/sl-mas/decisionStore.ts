import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export interface DecisionInput {
  agent_id: string;
  run_id: string;
  node_id: string;
  action: string;
  reasoning: string;
  alternatives: string[];
  confidence: number;
  inputs_summary: string;
  output_summary: string;
  tags: string[];
}

export interface DecisionRow {
  id: string;
  agent_id: string;
  run_id: string;
  node_id: string;
  action: string;
  reasoning: string;
  alternatives: string[];
  confidence: number;
  inputs_summary: string;
  output_summary: string;
  tags: string[];
  created_at: string;
}

export interface OutcomeRow {
  id: string;
  decision_id: string;
  outcome_type: string;
  result: "positive" | "negative" | "neutral";
  metric_value?: number;
  metric_name?: string;
  notes: string;
  lag_hours?: number;
  recorded_at: string;
}

/**
 * NERVE-side replacement for src/learning/decisionStore.ts. Same API shape;
 * Prisma instead of better-sqlite3. Singleton — backed by the shared
 * `prisma` client.
 *
 * Ported from runtime decisionStore + the recordOutcome path on the runtime
 * side. recordAttribution is also here so AttributionEngine can update
 * outcome rows without a separate store.
 */
export const decisionStore = {
  async logDecision(input: DecisionInput): Promise<DecisionRow> {
    const row = await prisma.decision.create({
      data: {
        agentId: input.agent_id,
        runId: input.run_id,
        nodeId: input.node_id,
        action: input.action,
        reasoning: input.reasoning,
        alternatives: input.alternatives as unknown as Prisma.InputJsonValue,
        confidence: input.confidence,
        inputsSummary: input.inputs_summary,
        outputSummary: input.output_summary,
        tags: input.tags,
      },
    });
    return rowToDecision(row);
  },

  async getDecision(id: string): Promise<DecisionRow | null> {
    const row = await prisma.decision.findUnique({ where: { id } });
    return row ? rowToDecision(row) : null;
  },

  async listDecisionsByAgent(agentId: string, limit = 50): Promise<DecisionRow[]> {
    const rows = await prisma.decision.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(rowToDecision);
  },

  async listDecisionsByRun(runId: string): Promise<DecisionRow[]> {
    const rows = await prisma.decision.findMany({
      where: { runId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(rowToDecision);
  },

  async listDecisionsByTag(tag: string, limit = 50): Promise<DecisionRow[]> {
    // GIN index on tags makes this fast.
    const rows = await prisma.decision.findMany({
      where: { tags: { has: tag } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(rowToDecision);
  },

  async listDecisionsByLeadId(leadId: string, limit = 50): Promise<DecisionRow[]> {
    return decisionStore.listDecisionsByTag(`lead_id:${leadId}`, limit);
  },

  async recordOutcome(input: {
    decision_id: string;
    outcome_type: string;
    result: "positive" | "negative" | "neutral";
    metric_value?: number;
    metric_name?: string;
    notes: string;
    lag_hours?: number;
  }): Promise<OutcomeRow> {
    const row = await prisma.outcome.create({
      data: {
        decisionId: input.decision_id,
        outcomeType: input.outcome_type,
        result: input.result,
        metricValue: input.metric_value ?? null,
        metricName: input.metric_name ?? null,
        notes: input.notes,
        lagHours: input.lag_hours ?? null,
      },
    });
    return rowToOutcome(row);
  },

  async listOutcomesForDecision(decisionId: string): Promise<OutcomeRow[]> {
    const rows = await prisma.outcome.findMany({
      where: { decisionId },
      orderBy: { recordedAt: "asc" },
    });
    return rows.map(rowToOutcome);
  },

  async recordAttribution(
    outcomeId: string,
    weight: number,
    reasoning: string,
  ): Promise<void> {
    await prisma.outcome.update({
      where: { id: outcomeId },
      data: { attributionWeight: weight, attributionReasoning: reasoning },
    });
  },

  /** Pending = outcome rows missing attribution_weight. */
  async listPendingAttributions(): Promise<
    Array<{
      outcome_id: string;
      decision_id: string;
      result: string;
      recorded_at: string;
      agent_id: string;
      node_id: string;
      run_id: string;
    }>
  > {
    const rows = await prisma.outcome.findMany({
      where: { attributionWeight: null },
      orderBy: { recordedAt: "asc" },
      include: {
        decision: { select: { id: true, agentId: true, nodeId: true, runId: true } },
      },
    });
    return rows.map((r) => ({
      outcome_id: r.id,
      decision_id: r.decisionId,
      result: r.result,
      recorded_at: r.recordedAt.toISOString(),
      agent_id: r.decision.agentId,
      node_id: r.decision.nodeId,
      run_id: r.decision.runId,
    }));
  },

  async rollupAttributionByAgent(sinceIso?: string): Promise<
    Array<{
      agent_id: string;
      n: number;
      avg_weight: number;
      positive_count: number;
      negative_count: number;
    }>
  > {
    const sinceFilter = sinceIso ? { recordedAt: { gte: new Date(sinceIso) } } : {};
    // Prisma doesn't support GROUP BY across joins cleanly; raw query is concise.
    const rows = await prisma.$queryRaw<
      Array<{
        agent_id: string;
        n: bigint;
        avg_weight: number;
        positive_count: bigint;
        negative_count: bigint;
      }>
    >(
      sinceIso
        ? Prisma.sql`
            SELECT d.agent_id,
                   COUNT(*) AS n,
                   AVG(o.attribution_weight) AS avg_weight,
                   SUM(CASE WHEN o.attribution_weight > 0 THEN 1 ELSE 0 END) AS positive_count,
                   SUM(CASE WHEN o.attribution_weight < 0 THEN 1 ELSE 0 END) AS negative_count
            FROM outcomes o
            JOIN decisions d ON d.id = o.decision_id
            WHERE o.attribution_weight IS NOT NULL
              AND o.recorded_at >= ${new Date(sinceIso)}
            GROUP BY d.agent_id
            ORDER BY avg_weight DESC
          `
        : Prisma.sql`
            SELECT d.agent_id,
                   COUNT(*) AS n,
                   AVG(o.attribution_weight) AS avg_weight,
                   SUM(CASE WHEN o.attribution_weight > 0 THEN 1 ELSE 0 END) AS positive_count,
                   SUM(CASE WHEN o.attribution_weight < 0 THEN 1 ELSE 0 END) AS negative_count
            FROM outcomes o
            JOIN decisions d ON d.id = o.decision_id
            WHERE o.attribution_weight IS NOT NULL
            GROUP BY d.agent_id
            ORDER BY avg_weight DESC
          `,
    );
    void sinceFilter; // keep as documentation; raw query handles the predicate
    return rows.map((r) => ({
      agent_id: r.agent_id,
      n: Number(r.n),
      avg_weight: Number(r.avg_weight ?? 0),
      positive_count: Number(r.positive_count),
      negative_count: Number(r.negative_count),
    }));
  },
};

// ── Row mappers ──

type DecisionDb = Awaited<ReturnType<typeof prisma.decision.findUnique>>;
type OutcomeDb = Awaited<ReturnType<typeof prisma.outcome.findUnique>>;

function rowToDecision(row: NonNullable<DecisionDb>): DecisionRow {
  return {
    id: row.id,
    agent_id: row.agentId,
    run_id: row.runId,
    node_id: row.nodeId,
    action: row.action,
    reasoning: row.reasoning,
    alternatives: row.alternatives as string[],
    confidence: row.confidence,
    inputs_summary: row.inputsSummary,
    output_summary: row.outputSummary,
    tags: row.tags,
    created_at: row.createdAt.toISOString(),
  };
}

function rowToOutcome(row: NonNullable<OutcomeDb>): OutcomeRow {
  return {
    id: row.id,
    decision_id: row.decisionId,
    outcome_type: row.outcomeType,
    result: row.result as "positive" | "negative" | "neutral",
    metric_value: row.metricValue ?? undefined,
    metric_name: row.metricName ?? undefined,
    notes: row.notes,
    lag_hours: row.lagHours ?? undefined,
    recorded_at: row.recordedAt.toISOString(),
  };
}
