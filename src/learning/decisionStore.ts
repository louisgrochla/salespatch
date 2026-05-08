import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { applyProductionPragmas } from "../lib/sqliteDefaults.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("decision-store");

// ── Types ──

export interface Decision {
  id: string;
  agent_id: string;
  run_id: string;
  node_id: string;
  /** What the agent decided */
  action: string;
  /** Why it decided this (reasoning chain) */
  reasoning: string;
  /** What alternatives were considered */
  alternatives: string[];
  /** Confidence level 0.0-1.0 */
  confidence: number;
  /** Structured inputs that informed the decision */
  inputs_summary: string;
  /** Structured output produced */
  output_summary: string;
  /** Tags for querying (e.g., "vertical:plumber", "platform:tiktok") */
  tags: string[];
  created_at: string;
}

export interface Outcome {
  id: string;
  decision_id: string;
  /** What happened: "lead_converted", "content_engaged", "site_viewed", etc. */
  outcome_type: string;
  /** Positive, negative, or neutral */
  result: "positive" | "negative" | "neutral";
  /** Numeric metric if applicable (conversion rate, engagement rate, etc.) */
  metric_value?: number;
  metric_name?: string;
  /** Freeform notes on why this outcome happened */
  notes: string;
  /** How long after the decision the outcome was recorded */
  lag_hours?: number;
  recorded_at: string;
}

export interface LearningInsight {
  agent_id: string;
  /** Pattern observed across decisions+outcomes */
  pattern: string;
  /** How many decisions this is based on */
  sample_size: number;
  /** Average outcome metric */
  avg_metric?: number;
  /** What the agent should do differently */
  recommendation: string;
  /** When this insight was generated */
  generated_at: string;
}

export interface DecisionContext {
  /** Recent decisions by this agent with their outcomes */
  recentDecisions: Array<Decision & { outcomes: Outcome[] }>;
  /** Aggregated insights */
  insights: LearningInsight[];
  /** Success rate for this agent */
  successRate: number;
  /** Total decisions made */
  totalDecisions: number;
}

// ── Store ──

export class DecisionStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const parent = path.dirname(dbPath);
    mkdirSync(parent, { recursive: true });
    this.db = new Database(dbPath);
    applyProductionPragmas(this.db);
    this.createSchema();
  }

  // ── Decisions ──

  logDecision(input: Omit<Decision, "id" | "created_at">): Decision {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO decisions (
          id, agent_id, run_id, node_id, action, reasoning,
          alternatives_json, confidence, inputs_summary,
          output_summary, tags_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.agent_id,
        input.run_id,
        input.node_id,
        input.action,
        input.reasoning,
        JSON.stringify(input.alternatives),
        input.confidence,
        input.inputs_summary,
        input.output_summary,
        JSON.stringify(input.tags),
        createdAt,
      );

    return { ...input, id, created_at: createdAt };
  }

  getDecision(id: string): Decision | undefined {
    const row = this.db
      .prepare("SELECT * FROM decisions WHERE id = ?")
      .get(id) as DecisionRow | undefined;
    return row ? this.toDecision(row) : undefined;
  }

  listDecisionsByAgent(agentId: string, limit = 50): Decision[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM decisions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(agentId, limit) as DecisionRow[];
    return rows.map((r) => this.toDecision(r));
  }

  listDecisionsByRun(runId: string): Decision[] {
    const rows = this.db
      .prepare("SELECT * FROM decisions WHERE run_id = ? ORDER BY created_at ASC")
      .all(runId) as DecisionRow[];
    return rows.map((r) => this.toDecision(r));
  }

  listDecisionsByTag(tag: string, limit = 50): Decision[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM decisions WHERE tags_json LIKE ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(`%"${tag}"%`, limit) as DecisionRow[];
    return rows.map((r) => this.toDecision(r));
  }

  listDecisionsByLeadId(leadId: string, limit = 50): Decision[] {
    return this.listDecisionsByTag(`lead_id:${leadId}`, limit);
  }

  // ── Outcomes ──

  recordOutcome(input: Omit<Outcome, "id" | "recorded_at">): Outcome {
    const id = randomUUID();
    const recordedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO outcomes (
          id, decision_id, outcome_type, result,
          metric_value, metric_name, notes, lag_hours, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.decision_id,
        input.outcome_type,
        input.result,
        input.metric_value ?? null,
        input.metric_name ?? null,
        input.notes,
        input.lag_hours ?? null,
        recordedAt,
      );

    return { ...input, id, recorded_at: recordedAt };
  }

  listOutcomesForDecision(decisionId: string): Outcome[] {
    const rows = this.db
      .prepare("SELECT * FROM outcomes WHERE decision_id = ? ORDER BY recorded_at ASC")
      .all(decisionId) as OutcomeRow[];
    return rows.map((r) => this.toOutcome(r));
  }

  // ── Learning Insights ──

  saveInsight(input: Omit<LearningInsight, "generated_at">): LearningInsight {
    const generatedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO learning_insights (
          id, agent_id, pattern, sample_size, avg_metric,
          recommendation, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.agent_id,
        input.pattern,
        input.sample_size,
        input.avg_metric ?? null,
        input.recommendation,
        generatedAt,
      );

    return { ...input, generated_at: generatedAt };
  }

  listInsights(agentId: string, limit = 20): LearningInsight[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM learning_insights WHERE agent_id = ? ORDER BY generated_at DESC LIMIT ?",
      )
      .all(agentId, limit) as InsightRow[];
    return rows.map((r) => ({
      agent_id: r.agent_id,
      pattern: r.pattern,
      sample_size: r.sample_size,
      avg_metric: r.avg_metric ?? undefined,
      recommendation: r.recommendation,
      generated_at: r.generated_at,
    }));
  }

  // ── Learning Context (what agents query when running) ──

  buildLearningContext(agentId: string, limit = 10): DecisionContext {
    const decisions = this.listDecisionsByAgent(agentId, limit);
    const withOutcomes = decisions.map((d) => ({
      ...d,
      outcomes: this.listOutcomesForDecision(d.id),
    }));

    const insights = this.listInsights(agentId, 5);

    const total = this.db
      .prepare("SELECT COUNT(*) as count FROM decisions WHERE agent_id = ?")
      .get(agentId) as { count: number };

    const positive = this.db
      .prepare(
        `SELECT COUNT(DISTINCT d.id) as count
         FROM decisions d
         JOIN outcomes o ON o.decision_id = d.id
         WHERE d.agent_id = ? AND o.result = 'positive'`,
      )
      .get(agentId) as { count: number };

    const successRate =
      total.count > 0 ? positive.count / total.count : 0;

    return {
      recentDecisions: withOutcomes,
      insights,
      successRate,
      totalDecisions: total.count,
    };
  }

  /** Format learning context into a prompt section for AI agents */
  formatContextForPrompt(context: DecisionContext): string {
    if (context.totalDecisions === 0) {
      return "No prior decisions recorded. This is the first run.";
    }

    const parts: string[] = [];
    parts.push(
      `## Learning Context (${context.totalDecisions} prior decisions, ${(context.successRate * 100).toFixed(0)}% success rate)`,
    );

    if (context.insights.length > 0) {
      parts.push("\n### Key Insights:");
      for (const insight of context.insights) {
        parts.push(
          `- ${insight.pattern} → ${insight.recommendation} (based on ${insight.sample_size} decisions)`,
        );
      }
    }

    const withOutcomes = context.recentDecisions.filter(
      (d) => d.outcomes.length > 0,
    );
    if (withOutcomes.length > 0) {
      parts.push("\n### Recent Decisions & Outcomes:");
      for (const d of withOutcomes.slice(0, 5)) {
        const outcomeStr = d.outcomes
          .map((o) => `${o.result}${o.metric_value ? ` (${o.metric_name}: ${o.metric_value})` : ""}`)
          .join(", ");
        parts.push(
          `- Decision: ${d.action} (confidence: ${d.confidence})\n  Reasoning: ${d.reasoning}\n  Outcome: ${outcomeStr}`,
        );
      }
    }

    return parts.join("\n");
  }

  close(): void {
    this.db.close();
  }

  // ── Schema ──

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        alternatives_json TEXT NOT NULL,
        confidence REAL NOT NULL,
        inputs_summary TEXT NOT NULL,
        output_summary TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_decisions_agent
      ON decisions(agent_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_decisions_run
      ON decisions(run_id, created_at ASC);

      CREATE TABLE IF NOT EXISTS outcomes (
        id TEXT PRIMARY KEY,
        decision_id TEXT NOT NULL,
        outcome_type TEXT NOT NULL,
        result TEXT NOT NULL,
        metric_value REAL,
        metric_name TEXT,
        notes TEXT NOT NULL,
        lag_hours REAL,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY(decision_id) REFERENCES decisions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_outcomes_decision
      ON outcomes(decision_id);

      CREATE TABLE IF NOT EXISTS learning_insights (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        pattern TEXT NOT NULL,
        sample_size INTEGER NOT NULL,
        avg_metric REAL,
        recommendation TEXT NOT NULL,
        generated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_insights_agent
      ON learning_insights(agent_id, generated_at DESC);
    `);
  }

  // ── Row mappers ──

  private toDecision(row: DecisionRow): Decision {
    return {
      id: row.id,
      agent_id: row.agent_id,
      run_id: row.run_id,
      node_id: row.node_id,
      action: row.action,
      reasoning: row.reasoning,
      alternatives: JSON.parse(row.alternatives_json),
      confidence: row.confidence,
      inputs_summary: row.inputs_summary,
      output_summary: row.output_summary,
      tags: JSON.parse(row.tags_json),
      created_at: row.created_at,
    };
  }

  private toOutcome(row: OutcomeRow): Outcome {
    return {
      id: row.id,
      decision_id: row.decision_id,
      outcome_type: row.outcome_type,
      result: row.result as Outcome["result"],
      metric_value: row.metric_value ?? undefined,
      metric_name: row.metric_name ?? undefined,
      notes: row.notes,
      lag_hours: row.lag_hours ?? undefined,
      recorded_at: row.recorded_at,
    };
  }
}

// ── Row types ──

interface DecisionRow {
  id: string;
  agent_id: string;
  run_id: string;
  node_id: string;
  action: string;
  reasoning: string;
  alternatives_json: string;
  confidence: number;
  inputs_summary: string;
  output_summary: string;
  tags_json: string;
  created_at: string;
}

interface OutcomeRow {
  id: string;
  decision_id: string;
  outcome_type: string;
  result: string;
  metric_value: number | null;
  metric_name: string | null;
  notes: string;
  lag_hours: number | null;
  recorded_at: string;
}

interface InsightRow {
  id: string;
  agent_id: string;
  pattern: string;
  sample_size: number;
  avg_metric: number | null;
  recommendation: string;
  generated_at: string;
}
