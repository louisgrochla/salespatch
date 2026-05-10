import { createHmac } from "node:crypto";
import { createLogger } from "../lib/logger.js";
import type { Decision, LearningInsight, Outcome } from "./decisionStore.js";
import {
  formatLearningContextForPrompt,
  type DecisionContext,
} from "./contextFormat.js";

const log = createLogger("nerve-learning-client");

// D2 — read side of the self-learning loop, sourced from NERVE Postgres
// instead of local Pi SQLite. Implements the same surface DecisionStore
// exposes for reads: `buildLearningContext` + `formatContextForPrompt`. Pair
// with the local DecisionStore (or a SinkOnly variant) for writes via
// CompositeLearningStore — that's the autumn-swap pattern.
//
// Wire format: GET /api/read/decisions/learning-context?agent_id=X[&limit=N]
// signed with HMAC-SHA256 over the sorted canonical query string in the
// X-Read-Signature header. Same OUTCOME_INGEST_SECRET as the other
// /api/read/* endpoints.

export interface NerveLearningClientOptions {
  baseUrl: string;
  secret: string;
  /** Override fetch for testing. Defaults to global `fetch`. */
  fetcher?: typeof fetch;
  /** Per-request timeout in ms. Defaults to 5000. */
  timeoutMs?: number;
}

interface WireDecision {
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
  outcomes: WireOutcome[];
}

interface WireOutcome {
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

interface WireInsight {
  agent_id: string;
  pattern: string;
  sample_size: number;
  avg_metric?: number;
  recommendation: string;
  generated_at: string;
}

interface WireLearningContext {
  agent_id: string;
  recent_decisions: WireDecision[];
  insights: WireInsight[];
  success_rate: number;
  total_decisions: number;
  generated_at: string;
}

export class NerveLearningClient {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: NerveLearningClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.secret = opts.secret;
    this.fetcher = opts.fetcher ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
  }

  /**
   * Drop-in for `DecisionStore.buildLearningContext`. Fetches from NERVE
   * Postgres via the read endpoint and maps the wire payload back to the
   * Pi-side shape. Throws on HTTP failure — caller is responsible for
   * deciding whether to fall back to local reads or fail the run.
   */
  async buildLearningContext(
    agentId: string,
    limit = 10,
  ): Promise<DecisionContext> {
    const queryParams = new URLSearchParams({
      agent_id: agentId,
      limit: String(limit),
    });
    const canonical = canonicalQuery(queryParams);
    const signature = `sha256=${createHmac("sha256", this.secret)
      .update(canonical)
      .digest("hex")}`;

    const url = `${this.baseUrl}/api/read/decisions/learning-context?${canonical}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetcher(url, {
        method: "GET",
        headers: { "X-Read-Signature": signature },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `NERVE learning-context fetch failed: HTTP ${res.status} ${body.slice(0, 200)}`,
      );
    }

    const wire = (await res.json()) as WireLearningContext;
    log.debug("fetched learning context", {
      agent: agentId,
      total: wire.total_decisions,
      recent: wire.recent_decisions.length,
      insights: wire.insights.length,
    });
    return wireToDecisionContext(wire);
  }

  /**
   * Delegates to the shared pure formatter so the prompt section matches
   * what the local DecisionStore would have produced bit-for-bit.
   */
  formatContextForPrompt(context: DecisionContext): string {
    return formatLearningContextForPrompt(context);
  }
}

function wireToDecisionContext(wire: WireLearningContext): DecisionContext {
  return {
    totalDecisions: wire.total_decisions,
    successRate: wire.success_rate,
    insights: wire.insights.map(
      (i): LearningInsight => ({
        agent_id: i.agent_id,
        pattern: i.pattern,
        sample_size: i.sample_size,
        avg_metric: i.avg_metric,
        recommendation: i.recommendation,
        generated_at: i.generated_at,
      }),
    ),
    recentDecisions: wire.recent_decisions.map((d) => {
      const decision: Decision = {
        id: d.id,
        agent_id: d.agent_id,
        run_id: d.run_id,
        node_id: d.node_id,
        action: d.action,
        reasoning: d.reasoning,
        alternatives: d.alternatives,
        confidence: d.confidence,
        inputs_summary: d.inputs_summary,
        output_summary: d.output_summary,
        tags: d.tags,
        created_at: d.created_at,
      };
      const outcomes: Outcome[] = d.outcomes.map((o) => ({
        id: o.id,
        decision_id: o.decision_id,
        outcome_type: o.outcome_type,
        result: o.result,
        metric_value: o.metric_value,
        metric_name: o.metric_name,
        notes: o.notes,
        lag_hours: o.lag_hours,
        recorded_at: o.recorded_at,
      }));
      return { ...decision, outcomes };
    }),
  };
}

function canonicalQuery(params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}
