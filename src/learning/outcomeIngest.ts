import { createHmac, timingSafeEqual } from "node:crypto";
import { createLogger } from "../lib/logger.js";
import { DecisionStore } from "./decisionStore.js";
import type { EpisodicStore, Episode } from "../memory/episodicStore.js";

const log = createLogger("outcome-ingest");

// ── Types ──

export type OutcomeSource =
  | "nerve_webhook"
  | "supabase_poll"
  | "manual_skill"
  | "test";

export type OutcomeKind =
  | "pitch_closed"
  | "pitch_rejected"
  | "pitch_followup"
  | "demo_viewed"
  | "no_outcome";

export interface OutcomeIngestPayload {
  source: OutcomeSource;
  /** Stable idempotency key. NERVE: pitchLog.id. Supabase: `${assignment_id}:${status}`. */
  external_id: string;
  /** Preferred matching key — agents that emit `_decision.lead_id` are queryable here. */
  lead_id?: string;
  /** Fallback matching key when lead_id is unknown. */
  business_name?: string;
  outcome_type: OutcomeKind;
  result: "positive" | "negative" | "neutral";
  agreed_price_gbp?: number;
  interest_level?: "cold" | "warm" | "hot";
  demo_reaction?: "loved" | "liked" | "neutral" | "unimpressed";
  objections?: string[];
  notes?: string;
  /** ISO timestamp when the outcome occurred (pitch date / status flip date). */
  occurred_at: string;
  /** NERVE PitchLog id, if applicable. */
  pitch_log_id?: string;
  /** Supabase lead_assignments id, if applicable. */
  assignment_id?: string;
}

export interface OutcomeIngestResult {
  external_id: string;
  matched_decisions: number;
  matched_lead_id?: string;
  match_strategy: "lead_id" | "business_name_date" | "none";
  skipped_reason?: "duplicate" | "no_match";
}

// ── Idempotency / kv schema ──

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS outcome_ingest_log (
    external_id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    matched_decisions INTEGER NOT NULL DEFAULT 0,
    match_strategy TEXT NOT NULL,
    episode_id TEXT,
    ingested_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_outcome_ingest_log_source
  ON outcome_ingest_log(source, ingested_at DESC);

  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

// ── HMAC helpers (exported for NERVE webhook helper to share) ──

/** Build the canonical body string used for HMAC signing. */
export function canonicalBody(payload: OutcomeIngestPayload): string {
  // Stable key order ensures signer and verifier produce identical bytes.
  return JSON.stringify(payload, Object.keys(payload).sort());
}

export function signBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const candidate = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (candidate.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ── Ingester ──

export class OutcomeIngester {
  constructor(
    private readonly decisionStore: DecisionStore,
    private readonly episodicStore?: EpisodicStore,
  ) {
    // Reach into the underlying database to install ingest tables alongside
    // decisions/outcomes/learning_insights. We avoid a parallel SQLite handle.
    (this.decisionStore as unknown as { db: { exec(sql: string): void } }).db.exec(SCHEMA_SQL);
  }

  /** Has this external_id already been ingested? */
  alreadySeen(externalId: string): boolean {
    const row = (this.decisionStore as unknown as {
      db: { prepare(sql: string): { get(...params: unknown[]): unknown } };
    }).db
      .prepare("SELECT 1 FROM outcome_ingest_log WHERE external_id = ?")
      .get(externalId);
    return row !== undefined;
  }

  /**
   * Idempotent ingest. Records the payload, matches decisions, attaches an
   * outcome row to each. Returns a summary. Safe to call multiple times with
   * the same external_id — the second call is a no-op.
   */
  ingest(payload: OutcomeIngestPayload): OutcomeIngestResult {
    if (this.alreadySeen(payload.external_id)) {
      log.info("duplicate ingest, skipping", {
        external_id: payload.external_id,
        source: payload.source,
      });
      return {
        external_id: payload.external_id,
        matched_decisions: 0,
        match_strategy: "none",
        skipped_reason: "duplicate",
      };
    }

    let decisions: Array<{ id: string; run_id: string; created_at: string }>;
    let matchStrategy: OutcomeIngestResult["match_strategy"];

    if (payload.lead_id) {
      decisions = this.decisionStore
        .listDecisionsByLeadId(payload.lead_id)
        .map((d) => ({ id: d.id, run_id: d.run_id, created_at: d.created_at }));
      matchStrategy = decisions.length > 0 ? "lead_id" : "none";
    } else if (payload.business_name) {
      decisions = this.matchByBusinessNameAndDate(payload.business_name, payload.occurred_at);
      matchStrategy = decisions.length > 0 ? "business_name_date" : "none";
    } else {
      decisions = [];
      matchStrategy = "none";
    }

    const matchedLeadId = payload.lead_id ?? this.inferLeadIdFromDecisions(decisions);

    // Attach an outcome row to each matched decision. Lag is computed against
    // the outcome's occurred_at timestamp. Track episode_ids so we can stamp
    // the audit log row in a single INSERT below.
    const occurredAtMs = Date.parse(payload.occurred_at);
    const episodeIdsTouched = new Set<string>();
    let firstEpisodeId: string | undefined;
    for (const d of decisions) {
      const lagHours = Number.isFinite(occurredAtMs)
        ? Math.max(0, (occurredAtMs - Date.parse(d.created_at)) / 3_600_000)
        : undefined;
      this.decisionStore.recordOutcome({
        decision_id: d.id,
        outcome_type: payload.outcome_type,
        result: payload.result,
        metric_value: payload.agreed_price_gbp,
        metric_name: payload.agreed_price_gbp != null ? "agreed_price_gbp" : undefined,
        notes: this.formatNotes(payload),
        lag_hours: lagHours,
      });

      // Mirror onto the episode for that decision's run, once per run_id.
      if (this.episodicStore && d.run_id && !episodeIdsTouched.has(d.run_id)) {
        episodeIdsTouched.add(d.run_id);
        const updated = this.episodicStore.attachOutcome(d.run_id, {
          pitch_outcome: mapOutcomeKindToEpisode(payload.outcome_type),
          close_amount_gbp: payload.agreed_price_gbp,
          outcome_notes: this.formatNotes(payload),
        });
        if (updated && !firstEpisodeId) firstEpisodeId = updated.id;
      }
    }

    // Persist the ingest log row regardless of match outcome. Multi-episode
    // ingests record only the first episode_id; full back-pointers live on
    // the episodes themselves.
    (this.decisionStore as unknown as {
      db: { prepare(sql: string): { run(...params: unknown[]): unknown } };
    }).db
      .prepare(
        `INSERT INTO outcome_ingest_log (
           external_id, source, payload_json, matched_decisions,
           match_strategy, episode_id, ingested_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        payload.external_id,
        payload.source,
        JSON.stringify(payload),
        decisions.length,
        matchStrategy,
        firstEpisodeId ?? null,
        new Date().toISOString(),
      );

    log.info("ingested outcome", {
      external_id: payload.external_id,
      source: payload.source,
      matched_decisions: decisions.length,
      match_strategy: matchStrategy,
    });

    return {
      external_id: payload.external_id,
      matched_decisions: decisions.length,
      matched_lead_id: matchedLeadId,
      match_strategy: matchStrategy,
      skipped_reason: decisions.length === 0 ? "no_match" : undefined,
    };
  }

  /** Recent ingest log entries — for the /api/outcomes/recent endpoint. */
  listRecent(limit = 50): IngestLogEntry[] {
    const rows = (this.decisionStore as unknown as {
      db: { prepare(sql: string): { all(...params: unknown[]): unknown[] } };
    }).db
      .prepare(
        `SELECT external_id, source, payload_json, matched_decisions,
                match_strategy, episode_id, ingested_at
         FROM outcome_ingest_log
         ORDER BY ingested_at DESC
         LIMIT ?`,
      )
      .all(limit) as IngestLogRow[];
    return rows.map((r) => ({
      external_id: r.external_id,
      source: r.source as OutcomeSource,
      payload: JSON.parse(r.payload_json) as OutcomeIngestPayload,
      matched_decisions: r.matched_decisions,
      match_strategy: r.match_strategy as OutcomeIngestResult["match_strategy"],
      episode_id: r.episode_id ?? undefined,
      ingested_at: r.ingested_at,
    }));
  }

  // ── Internal ──

  private matchByBusinessNameAndDate(
    businessName: string,
    occurredAt: string,
  ): Array<{ id: string; run_id: string; created_at: string }> {
    // Decisions emitted by the manual /build-demo skill embed the slug as
    // lead_id. Here we widen to LIKE-match the business name in tags or
    // inputs_summary as a fallback. At n=50 this is fine; flagged for
    // tightening once iOS threads lead_id end-to-end.
    const slug = businessName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const occurred = Date.parse(occurredAt);
    const windowMs = 30 * 24 * 60 * 60 * 1000; // 30 days either side

    const candidates = (this.decisionStore as unknown as {
      db: { prepare(sql: string): { all(...params: unknown[]): unknown[] } };
    }).db
      .prepare(
        `SELECT id, run_id, created_at, tags_json, inputs_summary
         FROM decisions
         WHERE tags_json LIKE ? OR inputs_summary LIKE ?
         ORDER BY created_at DESC
         LIMIT 100`,
      )
      .all(`%${slug}%`, `%${businessName}%`) as Array<{
        id: string;
        run_id: string;
        created_at: string;
        tags_json: string;
        inputs_summary: string;
      }>;

    return candidates.filter((c) => {
      const created = Date.parse(c.created_at);
      return Number.isFinite(created) && Math.abs(occurred - created) <= windowMs;
    });
  }

  private inferLeadIdFromDecisions(
    decisions: Array<{ id: string; run_id: string; created_at: string }>,
  ): string | undefined {
    if (decisions.length === 0) return undefined;
    const first = this.decisionStore.getDecision(decisions[0].id);
    const tag = first?.tags.find((t) => t.startsWith("lead_id:"));
    return tag ? tag.slice("lead_id:".length) : undefined;
  }

  private formatNotes(payload: OutcomeIngestPayload): string {
    const parts: string[] = [];
    if (payload.demo_reaction) parts.push(`reaction: ${payload.demo_reaction}`);
    if (payload.interest_level) parts.push(`interest: ${payload.interest_level}`);
    if (payload.objections?.length) parts.push(`objections: ${payload.objections.join(", ")}`);
    if (payload.notes) parts.push(payload.notes);
    return parts.join(" | ") || `${payload.source}:${payload.outcome_type}`;
  }
}

export interface IngestLogEntry {
  external_id: string;
  source: OutcomeSource;
  payload: OutcomeIngestPayload;
  matched_decisions: number;
  match_strategy: OutcomeIngestResult["match_strategy"];
  episode_id?: string;
  ingested_at: string;
}

interface IngestLogRow {
  external_id: string;
  source: string;
  payload_json: string;
  matched_decisions: number;
  match_strategy: string;
  episode_id: string | null;
  ingested_at: string;
}

function mapOutcomeKindToEpisode(
  kind: OutcomeKind,
): NonNullable<Episode["pitch_outcome"]> {
  switch (kind) {
    case "pitch_closed":
      return "closed";
    case "pitch_rejected":
      return "rejected";
    case "pitch_followup":
      return "follow_up";
    default:
      return "no_outcome";
  }
}
