import { createLogger } from "../lib/logger.js";
import { DecisionStore } from "./decisionStore.js";
import { OutcomeIngester, OutcomeIngestPayload } from "./outcomeIngest.js";

const log = createLogger("supabase-outcome-poller");

const CURSOR_KEY = "supabase_outcome_poller.last_seen_iso";
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface SupabaseAssignmentRow {
  id: string;
  business_name?: string | null;
  status: string;
  rejection_reason?: string | null;
  visited_at?: string | null;
  pitched_at?: string | null;
  sold_at?: string | null;
  rejected_at?: string | null;
  updated_at: string;
  /** Optional — present once iOS threads lead_id through to assignments. */
  lead_id?: string | null;
}

export interface SupabasePollerOptions {
  /** Override fetch for testability. Default uses global fetch + service-role key. */
  fetcher?: (since: string) => Promise<SupabaseAssignmentRow[]>;
  /** Poll interval in milliseconds. Defaults to 6h. */
  intervalMs?: number;
}

export class SupabaseOutcomePoller {
  private timer?: ReturnType<typeof setInterval>;
  private readonly fetcher: (since: string) => Promise<SupabaseAssignmentRow[]>;
  private readonly intervalMs: number;

  constructor(
    private readonly decisionStore: DecisionStore,
    private readonly ingester: OutcomeIngester,
    options: SupabasePollerOptions = {},
  ) {
    this.fetcher = options.fetcher ?? this.defaultFetcher;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /** One scan; returns counts. Safe to call manually for tests / cron. */
  async pollOnce(): Promise<{ scanned: number; ingested: number; skipped: number }> {
    const since = this.getCursor();
    let rows: SupabaseAssignmentRow[];
    try {
      rows = await this.fetcher(since);
    } catch (e) {
      log.error("fetch failed", { error: String(e), since });
      return { scanned: 0, ingested: 0, skipped: 0 };
    }

    let ingested = 0;
    let skipped = 0;
    let maxUpdatedAt = since;

    for (const row of rows) {
      const payload = this.toPayload(row);
      if (!payload) {
        skipped += 1;
        continue;
      }
      const result = await this.ingester.ingest(payload);
      if (result.skipped_reason === "duplicate") skipped += 1;
      else ingested += 1;
      if (row.updated_at > maxUpdatedAt) maxUpdatedAt = row.updated_at;
    }

    if (maxUpdatedAt !== since) this.setCursor(maxUpdatedAt);
    log.info("poll complete", { scanned: rows.length, ingested, skipped, since });
    return { scanned: rows.length, ingested, skipped };
  }

  start(): void {
    if (this.timer) return;
    // Run once immediately, then on interval. Errors are caught inside pollOnce.
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), this.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
    log.info("poller started", { intervalMs: this.intervalMs });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      log.info("poller stopped");
    }
  }

  // ── Internal ──

  private toPayload(row: SupabaseAssignmentRow): OutcomeIngestPayload | undefined {
    // Idempotency key encodes the terminal status so a single assignment
    // moving through (visited → pitched → rejected) produces three distinct
    // ingest records.
    const externalId = `${row.id}:${row.status}`;

    const occurredAt =
      row.status === "sold"
        ? row.sold_at
        : row.status === "rejected"
          ? row.rejected_at
          : row.status === "pitched"
            ? row.pitched_at
            : row.status === "visited"
              ? row.visited_at
              : null;

    if (!occurredAt) return undefined;

    let outcomeType: OutcomeIngestPayload["outcome_type"];
    let result: OutcomeIngestPayload["result"];
    switch (row.status) {
      case "sold":
        outcomeType = "pitch_closed";
        result = "positive";
        break;
      case "rejected":
        outcomeType = "pitch_rejected";
        result = "negative";
        break;
      case "pitched":
        // Pitched but not yet resolved — record as follow-up so attribution
        // can re-attach when the terminal status arrives.
        outcomeType = "pitch_followup";
        result = "neutral";
        break;
      case "visited":
        outcomeType = "demo_viewed";
        result = "neutral";
        break;
      default:
        return undefined;
    }

    return {
      source: "supabase_poll",
      external_id: externalId,
      lead_id: row.lead_id ?? undefined,
      business_name: row.business_name ?? undefined,
      outcome_type: outcomeType,
      result,
      objections: row.rejection_reason ? [row.rejection_reason] : undefined,
      occurred_at: occurredAt,
      assignment_id: row.id,
    };
  }

  private getCursor(): string {
    const row = (this.decisionStore as unknown as {
      db: { prepare(sql: string): { get(...p: unknown[]): unknown } };
    }).db
      .prepare("SELECT value FROM kv WHERE key = ?")
      .get(CURSOR_KEY) as { value: string } | undefined;
    // Default to 30 days ago so first run isn't infinite.
    return row?.value ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  private setCursor(value: string): void {
    (this.decisionStore as unknown as {
      db: { prepare(sql: string): { run(...p: unknown[]): unknown } };
    }).db
      .prepare(
        `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(CURSOR_KEY, value, new Date().toISOString());
  }

  private defaultFetcher = async (since: string): Promise<SupabaseAssignmentRow[]> => {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY_READONLY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      log.warn("supabase env not configured, skipping poll");
      return [];
    }
    const endpoint = `${url.replace(/\/$/, "")}/rest/v1/lead_assignments?updated_at=gt.${encodeURIComponent(
      since,
    )}&order=updated_at.asc&limit=200`;
    const res = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!res.ok) {
      throw new Error(`supabase poll ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as SupabaseAssignmentRow[];
  };
}
