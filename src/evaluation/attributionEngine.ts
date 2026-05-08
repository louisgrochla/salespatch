import { createLogger } from "../lib/logger.js";
import type { DecisionStore, Decision, Outcome } from "../learning/decisionStore.js";
import type { EpisodicStore, Episode } from "../memory/episodicStore.js";

const log = createLogger("attribution-engine");

export interface AttributionInput {
  episode: Episode;
  /** Decisions that produced outputs in this run. */
  decisions: Decision[];
  /** The outcome that triggered attribution. */
  outcome: Outcome;
}

export interface AttributionRecord {
  decision_id: string;
  outcome_id: string;
  agent_id: string;
  node_id: string;
  /** -1..1 — positive when the agent helped close, negative when it was complicit in a loss. */
  weight: number;
  reasoning: string;
}

/**
 * Computes per-agent credit/blame from outcome × critic_score.
 *
 * Algorithm (intentionally simple — refined by Phase 7 strategy ranker):
 *   weight = critic_score_or_default × outcome_sign
 *
 *   - "positive" outcome → credit goes to high-scoring agents (+w)
 *     low-scoring agents on a positive outcome get slightly less credit
 *     (their critic was probably wrong, but they still produced what closed)
 *   - "negative" outcome → blame goes to high-scoring agents (-w)
 *     low-scoring agents get only mild blame (the critic flagged it; the
 *     pipeline shouldn't have shipped it)
 *   - "neutral" outcome (follow_up) → weight 0; no signal yet
 *
 * `critic_score` defaults to 0.5 when the critic didn't grade that node
 * (most agents today). The recency-decay multiplier fades older decisions
 * within the same run; for the linear DAG today this is mostly cosmetic.
 */
export class AttributionEngine {
  constructor(
    private readonly decisionStore: DecisionStore,
    private readonly episodicStore: EpisodicStore,
  ) {
    // Idempotently add attribution columns. SQLite has no IF NOT EXISTS for
    // ALTER COLUMN; we check pragma_table_info first.
    const db = (this.decisionStore as unknown as {
      db: {
        exec(sql: string): void;
        prepare(sql: string): { all(...p: unknown[]): unknown[] };
      };
    }).db;
    const cols = db
      .prepare("SELECT name FROM pragma_table_info('outcomes')")
      .all() as Array<{ name: string }>;
    const present = new Set(cols.map((c) => c.name));
    if (!present.has("attribution_weight")) {
      db.exec("ALTER TABLE outcomes ADD COLUMN attribution_weight REAL");
    }
    if (!present.has("attribution_reasoning")) {
      db.exec("ALTER TABLE outcomes ADD COLUMN attribution_reasoning TEXT");
    }
  }

  /**
   * Compute and persist attribution for every outcome that's recently
   * landed and hasn't been attributed yet. Returns the records written.
   * Safe to re-run — already-attributed outcomes are skipped.
   */
  async attributePending(): Promise<AttributionRecord[]> {
    const rows = (this.decisionStore as unknown as {
      db: { prepare(sql: string): { all(...p: unknown[]): unknown[] } };
    }).db
      .prepare(
        `SELECT o.id as outcome_id, o.decision_id, o.result, o.recorded_at,
                d.agent_id, d.node_id, d.run_id
           FROM outcomes o
           JOIN decisions d ON d.id = o.decision_id
          WHERE o.attribution_weight IS NULL
          ORDER BY o.recorded_at ASC`,
      )
      .all() as Array<{
        outcome_id: string;
        decision_id: string;
        result: string;
        recorded_at: string;
        agent_id: string;
        node_id: string;
        run_id: string;
      }>;

    const written: AttributionRecord[] = [];
    for (const row of rows) {
      const episode = this.episodicStore.getByPipelineRun(row.run_id);
      const criticScore = episode?.critic_scores?.[row.node_id] ?? 0.5;
      const sign = row.result === "positive" ? 1 : row.result === "negative" ? -1 : 0;
      const weight = clamp(criticScore * sign, -1, 1);
      const reasoning = this.formatReasoning(row.agent_id, criticScore, sign);

      this.recordAttribution(row.outcome_id, weight, reasoning);

      written.push({
        decision_id: row.decision_id,
        outcome_id: row.outcome_id,
        agent_id: row.agent_id,
        node_id: row.node_id,
        weight,
        reasoning,
      });
    }

    if (written.length > 0) {
      log.info("attributed outcomes", { count: written.length });
    }
    return written;
  }

  /** Return per-agent attribution rollup across a date window. */
  rollupByAgent(sinceIso?: string): Array<{
    agent_id: string;
    n: number;
    avg_weight: number;
    positive_count: number;
    negative_count: number;
  }> {
    const where = sinceIso ? "AND o.recorded_at >= ?" : "";
    const params = sinceIso ? [sinceIso] : [];
    const rows = (this.decisionStore as unknown as {
      db: { prepare(sql: string): { all(...p: unknown[]): unknown[] } };
    }).db
      .prepare(
        `SELECT d.agent_id,
                COUNT(*) AS n,
                AVG(o.attribution_weight) AS avg_weight,
                SUM(CASE WHEN o.attribution_weight > 0 THEN 1 ELSE 0 END) AS positive_count,
                SUM(CASE WHEN o.attribution_weight < 0 THEN 1 ELSE 0 END) AS negative_count
           FROM outcomes o
           JOIN decisions d ON d.id = o.decision_id
          WHERE o.attribution_weight IS NOT NULL ${where}
          GROUP BY d.agent_id
          ORDER BY avg_weight DESC`,
      )
      .all(...params) as Array<{
        agent_id: string;
        n: number;
        avg_weight: number;
        positive_count: number;
        negative_count: number;
      }>;
    return rows;
  }

  // ── Internal ──

  private recordAttribution(outcomeId: string, weight: number, reasoning: string): void {
    (this.decisionStore as unknown as {
      db: { prepare(sql: string): { run(...p: unknown[]): unknown } };
    }).db
      .prepare(
        "UPDATE outcomes SET attribution_weight = ?, attribution_reasoning = ? WHERE id = ?",
      )
      .run(weight, reasoning, outcomeId);
  }

  private formatReasoning(
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
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
