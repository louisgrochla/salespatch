import { decisionStore } from "./decisionStore";
import { episodicStore } from "./episodicStore";

export interface AttributionRecord {
  decision_id: string;
  outcome_id: string;
  agent_id: string;
  node_id: string;
  weight: number;
  reasoning: string;
}

/**
 * Computes per-agent credit/blame from outcome × critic_score.
 * Ported from src/evaluation/attributionEngine.ts.
 *
 * Algorithm:
 *   weight = critic_score_or_default × outcome_sign  (clamped -1..1)
 *
 * Defaults to 0.5 critic score when the critic didn't grade that node.
 * Idempotent — already-attributed outcomes are skipped on re-run.
 */
export const attributionEngine = {
  async attributePending(): Promise<AttributionRecord[]> {
    const pending = await decisionStore.listPendingAttributions();
    const written: AttributionRecord[] = [];

    for (const row of pending) {
      const episode = await episodicStore.getByPipelineRun(row.run_id);
      const criticScore = episode?.critic_scores?.[row.node_id] ?? 0.5;
      const sign =
        row.result === "positive" ? 1 : row.result === "negative" ? -1 : 0;
      const weight = clamp(criticScore * sign, -1, 1);
      const reasoning = formatReasoning(row.agent_id, criticScore, sign);

      await decisionStore.recordAttribution(row.outcome_id, weight, reasoning);

      written.push({
        decision_id: row.decision_id,
        outcome_id: row.outcome_id,
        agent_id: row.agent_id,
        node_id: row.node_id,
        weight,
        reasoning,
      });
    }
    return written;
  },

  rollupByAgent: decisionStore.rollupAttributionByAgent,
};

function formatReasoning(
  agentId: string,
  criticScore: number,
  sign: -1 | 0 | 1,
): string {
  if (sign === 0) return `${agentId}: neutral outcome (no signal yet)`;
  const direction = sign > 0 ? "credit" : "blame";
  const scoreNote =
    criticScore >= 0.7
      ? "high critic score (system was confident)"
      : criticScore >= 0.4
        ? "moderate critic score"
        : "low critic score (critic flagged it)";
  return `${agentId}: ${direction} (${scoreNote}, weight=${(criticScore * sign).toFixed(2)})`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
