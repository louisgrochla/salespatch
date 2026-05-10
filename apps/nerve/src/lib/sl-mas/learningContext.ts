import { prisma } from "@/lib/db";

// Server-side equivalent of src/learning/decisionStore.ts:buildLearningContext.
// Shape matches verbatim so the autumn Pi `withLearning(...)` wrapper can drop
// in a NerveLearningClient and the prompt-injection step continues to work
// without touching agent code. The fields are snake_case on the wire (the
// Pi runtime side is snake_case throughout — Prisma's camelCase is mapped at
// the row reader, not exposed beyond it).
//
// The Pi-side DecisionStore reads from local SQLite. This module reads the
// same logical data from NERVE Postgres, where the SL-MAS Phase 1 outcome
// bridge has been mirroring it since 2026-05-08. When the autumn pipeline
// restarts, the read side switches over with one line of wiring.

export interface OutcomeShape {
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

export interface DecisionWithOutcomes {
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
  outcomes: OutcomeShape[];
}

export interface LearningInsightShape {
  agent_id: string;
  pattern: string;
  sample_size: number;
  avg_metric?: number;
  recommendation: string;
  generated_at: string;
}

export interface LearningContext {
  agent_id: string;
  recent_decisions: DecisionWithOutcomes[];
  insights: LearningInsightShape[];
  success_rate: number;
  total_decisions: number;
  generated_at: string;
}

export async function buildLearningContextForAgent(
  agentId: string,
  limit = 10,
): Promise<LearningContext> {
  // Mirror the Pi-side buildLearningContext: fetch N most recent decisions,
  // attach their outcomes, count positives across the agent's full history
  // for the success rate, then layer insights.
  //
  // Two round-trips: (1) decisions+outcomes via include, (2) two scalar
  // counts in one raw query. Cheaper than three separate prisma queries on
  // larger datasets and keeps the function call sequence predictable.

  const [decisions, insights, counts] = await Promise.all([
    prisma.decision.findMany({
      where: { agentId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        outcomes: { orderBy: { recordedAt: "asc" } },
      },
    }),
    prisma.learningInsight.findMany({
      where: { agentId },
      orderBy: { generatedAt: "desc" },
      take: 5,
    }),
    prisma.$queryRaw<Array<{ total: bigint; positive: bigint }>>`
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT CASE WHEN o.result = 'positive' THEN d.id END) AS positive
      FROM decisions d
      LEFT JOIN outcomes o ON o.decision_id = d.id
      WHERE d.agent_id = ${agentId}
    `,
  ]);

  const totalRow = counts[0] ?? { total: 0n, positive: 0n };
  const totalDecisions = Number(totalRow.total);
  const positiveDecisions = Number(totalRow.positive);
  const successRate = totalDecisions > 0 ? positiveDecisions / totalDecisions : 0;

  return {
    agent_id: agentId,
    recent_decisions: decisions.map((d) => ({
      id: d.id,
      agent_id: d.agentId,
      run_id: d.runId,
      node_id: d.nodeId,
      action: d.action,
      reasoning: d.reasoning,
      alternatives: d.alternatives as string[],
      confidence: d.confidence,
      inputs_summary: d.inputsSummary,
      output_summary: d.outputSummary,
      tags: d.tags,
      created_at: d.createdAt.toISOString(),
      outcomes: d.outcomes.map((o) => ({
        id: o.id,
        decision_id: o.decisionId,
        outcome_type: o.outcomeType,
        result: o.result as OutcomeShape["result"],
        metric_value: o.metricValue ?? undefined,
        metric_name: o.metricName ?? undefined,
        notes: o.notes,
        lag_hours: o.lagHours ?? undefined,
        recorded_at: o.recordedAt.toISOString(),
      })),
    })),
    insights: insights.map((i) => ({
      agent_id: i.agentId,
      pattern: i.pattern,
      sample_size: i.sampleSize,
      avg_metric: i.avgMetric ?? undefined,
      recommendation: i.recommendation,
      generated_at: i.generatedAt.toISOString(),
    })),
    success_rate: successRate,
    total_decisions: totalDecisions,
    generated_at: new Date().toISOString(),
  };
}
