import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { applyProductionPragmas } from "../lib/sqliteDefaults.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("strategic-store");

export type StrategyStatus = "new" | "testing" | "active" | "champion" | "deprecated";

export interface Strategy {
  id: string;
  vertical: string;
  region?: string;
  strategy_type: string;
  /** Design choices identifying this strategy: hero, palette, cta, etc. */
  parameters: Record<string, string>;
  sample_size: number;
  close_rate: number | null;
  confidence_lower: number | null;
  confidence_upper: number | null;
  status: StrategyStatus;
  last_evaluated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertStrategyInput {
  vertical: string;
  region?: string;
  strategy_type: string;
  parameters: Record<string, string>;
  sample_size: number;
  close_rate: number | null;
  confidence_lower: number | null;
  confidence_upper: number | null;
  status?: StrategyStatus;
}

export class StrategicStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const parent = path.dirname(dbPath);
    mkdirSync(parent, { recursive: true });
    this.db = new Database(dbPath);
    applyProductionPragmas(this.db);
    this.createSchema();
  }

  /**
   * Create-or-update a strategy keyed on (vertical, region, parameters).
   * Returns the post-write Strategy.
   */
  upsert(input: UpsertStrategyInput): Strategy {
    const paramsJson = JSON.stringify(input.parameters);
    const existing = this.findByKey(input.vertical, input.region, paramsJson);
    const now = new Date().toISOString();

    if (existing) {
      const newStatus = input.status ?? this.transition(existing, input);
      this.db
        .prepare(
          `UPDATE strategies SET sample_size = ?, close_rate = ?,
                  confidence_lower = ?, confidence_upper = ?,
                  status = ?, last_evaluated_at = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          input.sample_size,
          input.close_rate,
          input.confidence_lower,
          input.confidence_upper,
          newStatus,
          now,
          now,
          existing.id,
        );
      return { ...existing, ...input, status: newStatus, last_evaluated_at: now, updated_at: now };
    }

    const id = randomUUID();
    // Apply lifecycle policy on first insert too — a fresh row with sample_size=20
    // and decent close_rate should not be stuck at "new".
    const synthetic: Strategy = {
      id,
      vertical: input.vertical,
      region: input.region,
      strategy_type: input.strategy_type,
      parameters: input.parameters,
      sample_size: 0,
      close_rate: null,
      confidence_lower: null,
      confidence_upper: null,
      status: "new",
      created_at: now,
      updated_at: now,
    };
    const status = input.status ?? this.transition(synthetic, input);
    this.db
      .prepare(
        `INSERT INTO strategies (
          id, vertical, region, strategy_type, parameters_json,
          sample_size, close_rate, confidence_lower, confidence_upper,
          status, last_evaluated_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.vertical,
        input.region ?? null,
        input.strategy_type,
        paramsJson,
        input.sample_size,
        input.close_rate,
        input.confidence_lower,
        input.confidence_upper,
        status,
        now,
        now,
        now,
      );
    return {
      id,
      vertical: input.vertical,
      region: input.region,
      strategy_type: input.strategy_type,
      parameters: input.parameters,
      sample_size: input.sample_size,
      close_rate: input.close_rate,
      confidence_lower: input.confidence_lower,
      confidence_upper: input.confidence_upper,
      status,
      last_evaluated_at: now,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Strategies relevant to a run: matched on (vertical, region) with a
   * preference for active/champion. Returns at most `limit` strategies.
   */
  getRelevant(vertical: string, region?: string, limit = 10): Strategy[] {
    // Active/champion strategies first; then testing; then new. Filter on region
    // if provided, otherwise return any region for the vertical.
    const where = region
      ? "WHERE vertical = ? AND (region = ? OR region IS NULL) AND status != 'deprecated'"
      : "WHERE vertical = ? AND status != 'deprecated'";
    const params = region ? [vertical, region] : [vertical];
    const rows = this.db
      .prepare(
        `SELECT * FROM strategies ${where}
            ORDER BY
              CASE status
                WHEN 'champion' THEN 0
                WHEN 'active' THEN 1
                WHEN 'testing' THEN 2
                WHEN 'new' THEN 3
                ELSE 4
              END,
              close_rate DESC NULLS LAST,
              sample_size DESC
            LIMIT ?`,
      )
      .all(...params, limit) as StrategyRow[];
    return rows.map((r) => this.toStrategy(r));
  }

  list(filter: { vertical?: string; status?: StrategyStatus } = {}): Strategy[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.vertical) {
      clauses.push("vertical = ?");
      params.push(filter.vertical);
    }
    if (filter.status) {
      clauses.push("status = ?");
      params.push(filter.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM strategies ${where} ORDER BY updated_at DESC`)
      .all(...params) as StrategyRow[];
    return rows.map((r) => this.toStrategy(r));
  }

  /** Replace strategy status manually — used by ops or for tests. */
  setStatus(id: string, status: StrategyStatus): void {
    this.db
      .prepare("UPDATE strategies SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, new Date().toISOString(), id);
  }

  close(): void {
    this.db.close();
  }

  // ── Lifecycle policy ──

  private transition(existing: Strategy, update: UpsertStrategyInput): StrategyStatus {
    const n = update.sample_size;
    const rate = update.close_rate ?? 0;
    const lower = update.confidence_lower ?? 0;

    // Always-deprecate floor: large sample with terrible rate.
    if (n >= 20 && rate < 0.15) return "deprecated";

    // Champion floor: huge sample with strong lower bound.
    if (n >= 50 && lower >= 0.4) return "champion";

    // Active: meaningful sample with positive lower bound.
    if (n >= 20 && lower >= 0.2) return "active";

    // Testing: enough data to stop being purely speculative.
    if (n >= 5) return "testing";

    return existing.status === "deprecated" ? "deprecated" : "new";
  }

  // ── Internal ──

  private findByKey(
    vertical: string,
    region: string | undefined,
    paramsJson: string,
  ): Strategy | undefined {
    const sql = region
      ? "SELECT * FROM strategies WHERE vertical = ? AND region = ? AND parameters_json = ? LIMIT 1"
      : "SELECT * FROM strategies WHERE vertical = ? AND region IS NULL AND parameters_json = ? LIMIT 1";
    const args = region ? [vertical, region, paramsJson] : [vertical, paramsJson];
    const row = this.db.prepare(sql).get(...args) as StrategyRow | undefined;
    return row ? this.toStrategy(row) : undefined;
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS strategies (
        id TEXT PRIMARY KEY,
        vertical TEXT NOT NULL,
        region TEXT,
        strategy_type TEXT NOT NULL,
        parameters_json TEXT NOT NULL,
        sample_size INTEGER NOT NULL DEFAULT 0,
        close_rate REAL,
        confidence_lower REAL,
        confidence_upper REAL,
        status TEXT NOT NULL DEFAULT 'new',
        last_evaluated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_strategies_vertical_status
        ON strategies(vertical, status, close_rate DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_strategies_key
        ON strategies(vertical, COALESCE(region, ''), parameters_json);
    `);
  }

  private toStrategy(row: StrategyRow): Strategy {
    return {
      id: row.id,
      vertical: row.vertical,
      region: row.region ?? undefined,
      strategy_type: row.strategy_type,
      parameters: JSON.parse(row.parameters_json),
      sample_size: row.sample_size,
      close_rate: row.close_rate ?? null,
      confidence_lower: row.confidence_lower ?? null,
      confidence_upper: row.confidence_upper ?? null,
      status: row.status as StrategyStatus,
      last_evaluated_at: row.last_evaluated_at ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

interface StrategyRow {
  id: string;
  vertical: string;
  region: string | null;
  strategy_type: string;
  parameters_json: string;
  sample_size: number;
  close_rate: number | null;
  confidence_lower: number | null;
  confidence_upper: number | null;
  status: string;
  last_evaluated_at: string | null;
  created_at: string;
  updated_at: string;
}
