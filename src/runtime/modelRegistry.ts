import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { applyProductionPragmas } from "../lib/sqliteDefaults.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger("model-registry");

export type ModelKind = "critic" | "agent";
export type ModelSource = "heuristic" | "llm" | "lora" | "external";

export interface ModelRegistration {
  id: string;
  /** "critic" or "agent". */
  kind: ModelKind;
  /** Optional agent_id this model targets (e.g. "site-composer-agent"). null = global. */
  agent_id: string | null;
  /** Human-readable version, e.g. "heuristic-v1", "claude-sonnet-4", "lora-2026-09-01". */
  version: string;
  source: ModelSource;
  /** External endpoint URL for hosted models, null for local impls. */
  endpoint: string | null;
  /** Local weights path for LoRA / fine-tunes, null when not applicable. */
  weights_path: string | null;
  /** Whether this is the active model for its (kind, agent_id) slot. */
  active: boolean;
  /** Free-form metadata: training run id, base model, evaluation results. */
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RegisterModelInput {
  kind: ModelKind;
  agent_id?: string | null;
  version: string;
  source: ModelSource;
  endpoint?: string;
  weights_path?: string;
  metadata?: Record<string, unknown>;
  /** Mark as active immediately. Default false. */
  activate?: boolean;
}

/**
 * SQLite-backed registry of model versions. The interface is in place so a
 * future LoRA training pipeline drops in cleanly:
 *   - Training cycle finishes → POST /api/models with weights_path + metadata
 *   - A/B harness (or operator) calls swap() to flip the active flag
 *   - CriticFactory queries getActive("critic", agent_id) on every evaluation
 *
 * No model files actually exist today — Phase 10 ships the contract, not
 * trained models.
 */
export class ModelRegistry {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    const parent = path.dirname(dbPath);
    mkdirSync(parent, { recursive: true });
    this.db = new Database(dbPath);
    applyProductionPragmas(this.db);
    this.createSchema();
    this.seedDefaults();
  }

  register(input: RegisterModelInput): ModelRegistration {
    const id = randomUUID();
    const now = new Date().toISOString();
    const agentId = input.agent_id ?? null;

    if (input.activate) {
      // Deactivate any existing active model for this slot.
      this.db
        .prepare(
          `UPDATE model_registrations SET active = 0
            WHERE kind = ? AND COALESCE(agent_id, '') = COALESCE(?, '')`,
        )
        .run(input.kind, agentId);
    }

    this.db
      .prepare(
        `INSERT INTO model_registrations (
          id, kind, agent_id, version, source, endpoint,
          weights_path, active, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.kind,
        agentId,
        input.version,
        input.source,
        input.endpoint ?? null,
        input.weights_path ?? null,
        input.activate ? 1 : 0,
        JSON.stringify(input.metadata ?? {}),
        now,
      );

    log.info("model registered", {
      id,
      kind: input.kind,
      agent_id: agentId,
      version: input.version,
      active: input.activate ?? false,
    });

    return {
      id,
      kind: input.kind,
      agent_id: agentId,
      version: input.version,
      source: input.source,
      endpoint: input.endpoint ?? null,
      weights_path: input.weights_path ?? null,
      active: input.activate ?? false,
      metadata: input.metadata ?? {},
      created_at: now,
    };
  }

  /** Active model for (kind, agent_id) slot. Falls back to global (agent_id=null). */
  getActive(kind: ModelKind, agentId?: string): ModelRegistration | undefined {
    if (agentId) {
      const specific = this.db
        .prepare(
          `SELECT * FROM model_registrations
            WHERE kind = ? AND agent_id = ? AND active = 1
            ORDER BY created_at DESC LIMIT 1`,
        )
        .get(kind, agentId) as ModelRow | undefined;
      if (specific) return this.toRegistration(specific);
    }
    const global = this.db
      .prepare(
        `SELECT * FROM model_registrations
          WHERE kind = ? AND agent_id IS NULL AND active = 1
          ORDER BY created_at DESC LIMIT 1`,
      )
      .get(kind) as ModelRow | undefined;
    return global ? this.toRegistration(global) : undefined;
  }

  /** Swap the active flag — flips one model on, all others in the slot off. */
  swap(id: string): ModelRegistration | undefined {
    const target = this.db
      .prepare("SELECT * FROM model_registrations WHERE id = ?")
      .get(id) as ModelRow | undefined;
    if (!target) return undefined;

    this.db
      .prepare(
        `UPDATE model_registrations SET active = 0
          WHERE kind = ? AND COALESCE(agent_id, '') = COALESCE(?, '')`,
      )
      .run(target.kind, target.agent_id);
    this.db
      .prepare("UPDATE model_registrations SET active = 1 WHERE id = ?")
      .run(id);
    log.info("model swap", { id, kind: target.kind, agent_id: target.agent_id });
    return this.getActive(target.kind as ModelKind, target.agent_id ?? undefined);
  }

  list(filter: { kind?: ModelKind; agent_id?: string } = {}): ModelRegistration[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.kind) {
      clauses.push("kind = ?");
      params.push(filter.kind);
    }
    if (filter.agent_id) {
      clauses.push("agent_id = ?");
      params.push(filter.agent_id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM model_registrations ${where} ORDER BY created_at DESC`)
      .all(...params) as ModelRow[];
    return rows.map((r) => this.toRegistration(r));
  }

  close(): void {
    this.db.close();
  }

  // ── Internal ──

  private seedDefaults(): void {
    // If empty, seed two default critic registrations so the path works
    // out of the box (no actual swap is performed).
    const count = this.db
      .prepare("SELECT COUNT(*) as n FROM model_registrations")
      .get() as { n: number };
    if (count.n > 0) return;
    this.register({
      kind: "critic",
      version: "heuristic-v1",
      source: "heuristic",
      activate: true,
    });
    this.register({
      kind: "critic",
      agent_id: "site-composer-agent",
      version: "heuristic-v1",
      source: "heuristic",
      // Not activated by default — agent inherits global.
    });
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_registrations (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        agent_id TEXT,
        version TEXT NOT NULL,
        source TEXT NOT NULL,
        endpoint TEXT,
        weights_path TEXT,
        active INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_models_active
        ON model_registrations(kind, agent_id, active);
    `);
  }

  private toRegistration(row: ModelRow): ModelRegistration {
    return {
      id: row.id,
      kind: row.kind as ModelKind,
      agent_id: row.agent_id,
      version: row.version,
      source: row.source as ModelSource,
      endpoint: row.endpoint,
      weights_path: row.weights_path,
      active: row.active === 1,
      metadata: JSON.parse(row.metadata_json),
      created_at: row.created_at,
    };
  }
}

interface ModelRow {
  id: string;
  kind: string;
  agent_id: string | null;
  version: string;
  source: string;
  endpoint: string | null;
  weights_path: string | null;
  active: number;
  metadata_json: string;
  created_at: string;
}
