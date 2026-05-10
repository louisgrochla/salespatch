import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { applyProductionPragmas } from "../lib/sqliteDefaults.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("episodic-store");

// ── Types ──

export interface Episode {
  id: string;
  pipeline_run_id: string;
  pipeline_definition_id: string;
  trigger?: string;
  lead_id?: string;
  business_name?: string;
  vertical?: string;
  region?: string;
  started_at: string;
  ended_at?: string;
  status: "running" | "completed" | "failed" | "blocked" | "cancelled";
  total_cost_usd: number;
  reflection_iterations: number;
  agent_outputs_summary: Record<string, string>;
  critic_scores: Record<string, number>;
  working_memory_snapshot: Record<string, unknown>;
  strategies_used: string[];
  pivot_tags: string[];
  pitch_outcome?: "closed" | "rejected" | "follow_up" | "no_outcome";
  outcome_received_at?: string;
  close_amount_gbp?: number;
  days_to_outcome?: number;
  outcome_notes?: string;
  created_at: string;
}

export interface PivotResult {
  group_key: Record<string, string>;
  sample_size: number;
  closed: number;
  rejected: number;
  pending: number;
  close_rate: number;
}

// ── Store ──

export class EpisodicStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const parent = path.dirname(dbPath);
    mkdirSync(parent, { recursive: true });
    this.db = new Database(dbPath);
    applyProductionPragmas(this.db);
    this.createSchema();
  }

  /** Begin a new episode at the start of a pipeline run. */
  start(input: {
    pipeline_run_id: string;
    pipeline_definition_id: string;
    trigger?: string;
  }): Episode {
    const id = randomUUID();
    const startedAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO episodes (
           id, pipeline_run_id, pipeline_definition_id, trigger,
           started_at, status, total_cost_usd, reflection_iterations,
           agent_outputs_summary_json, critic_scores_json,
           working_memory_snapshot_json, strategies_used_json,
           pivot_tags_json, created_at
         ) VALUES (?, ?, ?, ?, ?, 'running', 0, 0, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.pipeline_run_id,
        input.pipeline_definition_id,
        input.trigger ?? null,
        startedAt,
        "{}",
        "{}",
        "{}",
        "[]",
        "[]",
        startedAt,
      );
    return {
      id,
      pipeline_run_id: input.pipeline_run_id,
      pipeline_definition_id: input.pipeline_definition_id,
      trigger: input.trigger,
      started_at: startedAt,
      status: "running",
      total_cost_usd: 0,
      reflection_iterations: 0,
      agent_outputs_summary: {},
      critic_scores: {},
      working_memory_snapshot: {},
      strategies_used: [],
      pivot_tags: [],
      created_at: startedAt,
    };
  }

  /** Record a critic score for a node (called by ReflectionLoop). */
  recordNodeScore(pipelineRunId: string, nodeId: string, score: number): void {
    const ep = this.getByPipelineRun(pipelineRunId);
    if (!ep) return;
    const updated = { ...ep.critic_scores, [nodeId]: score };
    this.db
      .prepare("UPDATE episodes SET critic_scores_json = ? WHERE pipeline_run_id = ?")
      .run(JSON.stringify(updated), pipelineRunId);
  }

  /** Record an agent's output summary. */
  recordAgentSummary(pipelineRunId: string, nodeId: string, summary: string): void {
    const ep = this.getByPipelineRun(pipelineRunId);
    if (!ep) return;
    const updated = { ...ep.agent_outputs_summary, [nodeId]: summary };
    this.db
      .prepare("UPDATE episodes SET agent_outputs_summary_json = ? WHERE pipeline_run_id = ?")
      .run(JSON.stringify(updated), pipelineRunId);
  }

  /** Bump the reflection iteration counter. */
  incrementReflectionIterations(pipelineRunId: string, by = 1): void {
    this.db
      .prepare("UPDATE episodes SET reflection_iterations = reflection_iterations + ? WHERE pipeline_run_id = ?")
      .run(by, pipelineRunId);
  }

  /** Add to total cost. */
  addCost(pipelineRunId: string, costUsd: number): void {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return;
    this.db
      .prepare("UPDATE episodes SET total_cost_usd = total_cost_usd + ? WHERE pipeline_run_id = ?")
      .run(costUsd, pipelineRunId);
  }

  /** Persist final episode state at the end of a pipeline run. */
  completeRun(
    pipelineRunId: string,
    summary: {
      status: Episode["status"];
      working_memory_snapshot?: Record<string, unknown>;
      strategies_used?: string[];
      pivot_tags?: string[];
      lead_id?: string;
      business_name?: string;
      vertical?: string;
      region?: string;
    },
  ): Episode | undefined {
    const ep = this.getByPipelineRun(pipelineRunId);
    if (!ep) return undefined;
    const endedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE episodes
           SET ended_at = ?,
               status = ?,
               working_memory_snapshot_json = COALESCE(?, working_memory_snapshot_json),
               strategies_used_json = COALESCE(?, strategies_used_json),
               pivot_tags_json = COALESCE(?, pivot_tags_json),
               lead_id = COALESCE(?, lead_id),
               business_name = COALESCE(?, business_name),
               vertical = COALESCE(?, vertical),
               region = COALESCE(?, region)
         WHERE pipeline_run_id = ?`,
      )
      .run(
        endedAt,
        summary.status,
        summary.working_memory_snapshot != null
          ? JSON.stringify(summary.working_memory_snapshot)
          : null,
        summary.strategies_used != null
          ? JSON.stringify(summary.strategies_used)
          : null,
        summary.pivot_tags != null ? JSON.stringify(summary.pivot_tags) : null,
        summary.lead_id ?? null,
        summary.business_name ?? null,
        summary.vertical ?? null,
        summary.region ?? null,
        pipelineRunId,
      );
    log.info("episode completed", {
      pipeline_run_id: pipelineRunId,
      status: summary.status,
    });
    return this.getByPipelineRun(pipelineRunId);
  }

  /** Attach an outcome that arrived after completion. */
  attachOutcome(
    pipelineRunId: string,
    outcome: {
      pitch_outcome: NonNullable<Episode["pitch_outcome"]>;
      close_amount_gbp?: number;
      outcome_notes?: string;
    },
  ): Episode | undefined {
    const ep = this.getByPipelineRun(pipelineRunId);
    if (!ep) return undefined;
    const now = new Date().toISOString();
    const startedMs = Date.parse(ep.started_at);
    const days = Number.isFinite(startedMs)
      ? (Date.parse(now) - startedMs) / (24 * 3_600_000)
      : null;
    this.db
      .prepare(
        `UPDATE episodes
           SET pitch_outcome = ?,
               outcome_received_at = ?,
               close_amount_gbp = ?,
               days_to_outcome = ?,
               outcome_notes = COALESCE(?, outcome_notes)
         WHERE pipeline_run_id = ?`,
      )
      .run(
        outcome.pitch_outcome,
        now,
        outcome.close_amount_gbp ?? null,
        days,
        outcome.outcome_notes ?? null,
        pipelineRunId,
      );
    return this.getByPipelineRun(pipelineRunId);
  }

  getByPipelineRun(pipelineRunId: string): Episode | undefined {
    const row = this.db
      .prepare("SELECT * FROM episodes WHERE pipeline_run_id = ?")
      .get(pipelineRunId) as EpisodeRow | undefined;
    return row ? this.toEpisode(row) : undefined;
  }

  getByLeadId(leadId: string): Episode[] {
    const rows = this.db
      .prepare("SELECT * FROM episodes WHERE lead_id = ? ORDER BY started_at DESC")
      .all(leadId) as EpisodeRow[];
    return rows.map((r) => this.toEpisode(r));
  }

  listRecent(limit = 20): Episode[] {
    const rows = this.db
      .prepare("SELECT * FROM episodes ORDER BY started_at DESC LIMIT ?")
      .all(limit) as EpisodeRow[];
    return rows.map((r) => this.toEpisode(r));
  }

  /**
   * Pivot table aggregator. Filters by tags, groups by tag prefixes
   * (e.g., ["vertical:", "hero:"]), returns close-rate per group.
   *
   * Matching is naïve — substring on the JSON-encoded tags array. At
   * scale (n>10k episodes) this would benefit from a proper tags table;
   * not an issue at solo-founder volumes.
   */
  pivotByTags(filterTags: string[], groupByTagPrefixes: string[]): PivotResult[] {
    let query = `SELECT pivot_tags_json, pitch_outcome FROM episodes WHERE 1=1`;
    const params: unknown[] = [];
    for (const tag of filterTags) {
      query += ` AND pivot_tags_json LIKE ?`;
      params.push(`%"${tag}"%`);
    }
    const rows = this.db.prepare(query).all(...params) as Array<{
      pivot_tags_json: string;
      pitch_outcome: string | null;
    }>;

    const groups = new Map<string, PivotResult>();
    for (const row of rows) {
      const tags = JSON.parse(row.pivot_tags_json) as string[];
      const key: Record<string, string> = {};
      for (const prefix of groupByTagPrefixes) {
        const found = tags.find((t) => t.startsWith(prefix));
        key[prefix.replace(/:$/, "")] = found ? found.slice(prefix.length) : "_";
      }
      const keyStr = JSON.stringify(key);
      const cur =
        groups.get(keyStr) ??
        ({
          group_key: key,
          sample_size: 0,
          closed: 0,
          rejected: 0,
          pending: 0,
          close_rate: 0,
        } satisfies PivotResult);
      cur.sample_size += 1;
      if (row.pitch_outcome === "closed") cur.closed += 1;
      else if (row.pitch_outcome === "rejected") cur.rejected += 1;
      else cur.pending += 1;
      cur.close_rate = cur.sample_size > 0 ? cur.closed / cur.sample_size : 0;
      groups.set(keyStr, cur);
    }
    return [...groups.values()].sort((a, b) => b.sample_size - a.sample_size);
  }

  close(): void {
    this.db.close();
  }

  // ── Schema ──

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        pipeline_run_id TEXT NOT NULL UNIQUE,
        pipeline_definition_id TEXT NOT NULL,
        trigger TEXT,
        lead_id TEXT,
        business_name TEXT,
        vertical TEXT,
        region TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        total_cost_usd REAL NOT NULL DEFAULT 0,
        reflection_iterations INTEGER NOT NULL DEFAULT 0,
        agent_outputs_summary_json TEXT NOT NULL DEFAULT '{}',
        critic_scores_json TEXT NOT NULL DEFAULT '{}',
        working_memory_snapshot_json TEXT NOT NULL DEFAULT '{}',
        strategies_used_json TEXT NOT NULL DEFAULT '[]',
        pivot_tags_json TEXT NOT NULL DEFAULT '[]',
        pitch_outcome TEXT,
        outcome_received_at TEXT,
        close_amount_gbp REAL,
        days_to_outcome REAL,
        outcome_notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_episodes_lead ON episodes(lead_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_episodes_outcome ON episodes(pitch_outcome, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_episodes_vertical ON episodes(vertical, started_at DESC);
    `);
  }

  private toEpisode(row: EpisodeRow): Episode {
    return {
      id: row.id,
      pipeline_run_id: row.pipeline_run_id,
      pipeline_definition_id: row.pipeline_definition_id,
      trigger: row.trigger ?? undefined,
      lead_id: row.lead_id ?? undefined,
      business_name: row.business_name ?? undefined,
      vertical: row.vertical ?? undefined,
      region: row.region ?? undefined,
      started_at: row.started_at,
      ended_at: row.ended_at ?? undefined,
      status: row.status as Episode["status"],
      total_cost_usd: row.total_cost_usd,
      reflection_iterations: row.reflection_iterations,
      agent_outputs_summary: JSON.parse(row.agent_outputs_summary_json),
      critic_scores: JSON.parse(row.critic_scores_json),
      working_memory_snapshot: JSON.parse(row.working_memory_snapshot_json),
      strategies_used: JSON.parse(row.strategies_used_json),
      pivot_tags: JSON.parse(row.pivot_tags_json),
      pitch_outcome: (row.pitch_outcome as Episode["pitch_outcome"]) ?? undefined,
      outcome_received_at: row.outcome_received_at ?? undefined,
      close_amount_gbp: row.close_amount_gbp ?? undefined,
      days_to_outcome: row.days_to_outcome ?? undefined,
      outcome_notes: row.outcome_notes ?? undefined,
      created_at: row.created_at,
    };
  }
}

interface EpisodeRow {
  id: string;
  pipeline_run_id: string;
  pipeline_definition_id: string;
  trigger: string | null;
  lead_id: string | null;
  business_name: string | null;
  vertical: string | null;
  region: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  total_cost_usd: number;
  reflection_iterations: number;
  agent_outputs_summary_json: string;
  critic_scores_json: string;
  working_memory_snapshot_json: string;
  strategies_used_json: string;
  pivot_tags_json: string;
  pitch_outcome: string | null;
  outcome_received_at: string | null;
  close_amount_gbp: number | null;
  days_to_outcome: number | null;
  outcome_notes: string | null;
  created_at: string;
}
