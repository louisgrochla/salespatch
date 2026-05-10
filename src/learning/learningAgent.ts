import { createLogger } from "../lib/logger.js";
import { AgentExecutionInput, AgentExecutionOutput, AgentHandler } from "../pipeline/agentRuntime.js";
import { DecisionStore } from "./decisionStore.js";
import type { DecisionContext } from "./contextFormat.js";

const log = createLogger("learning-agent");

/**
 * Read-side surface withLearning consults before invoking the wrapped
 * handler. Both the local `DecisionStore` and `NerveLearningClient`
 * satisfy this; the latter sources the data from NERVE Postgres for the
 * autumn pipeline swap (D2). Async return so HTTP-backed implementations
 * work; sync `DecisionStore` resolves the await immediately.
 */
export interface LearningContextSource {
  buildLearningContext(
    agentId: string,
    limit?: number,
  ): DecisionContext | Promise<DecisionContext>;
  formatContextForPrompt(context: DecisionContext): string;
}

export interface LearningAgentOptions {
  /** Tags to add to every decision from this agent */
  defaultTags?: string[];
  /**
   * Override the read source for learning context. When set, the wrapper
   * fetches prior decisions+outcomes from this source instead of the
   * write-side decisionStore. Writes still flow to decisionStore — D2
   * keeps the write path on the Pi while moving reads to NERVE.
   */
  contextSource?: LearningContextSource;
}

/**
 * Wraps any AgentHandler with self-learning capabilities:
 * 1. Before execution: injects learning context from past decisions into upstreamArtifacts
 * 2. After execution: logs the decision with reasoning extracted from the output
 *
 * The wrapped agent receives `_learningContext` in its upstreamArtifacts,
 * which contains formatted past decisions + outcomes as a prompt section.
 *
 * The output artifacts should include `_decision` with:
 *   - reasoning: why the agent made its choices
 *   - alternatives: what other approaches were considered
 *   - confidence: 0.0-1.0
 *   - tags: additional tags for this decision
 */
export function withLearning(
  agentId: string,
  handler: AgentHandler,
  decisionStore: DecisionStore,
  options: LearningAgentOptions = {},
): AgentHandler {
  const reader: LearningContextSource = options.contextSource ?? decisionStore;
  return async (input: AgentExecutionInput): Promise<AgentExecutionOutput> => {
    // 1. Build learning context from past decisions. Read source may be the
    // local DecisionStore (sync) or a remote NerveLearningClient (async) —
    // await unifies both. Read failure must not break the pipeline: fall
    // back to the local store if the remote source threw.
    let context: DecisionContext;
    try {
      context = await Promise.resolve(reader.buildLearningContext(agentId, 10));
    } catch (err) {
      log.warn("learning-context read failed, falling back to local store", {
        agent: agentId,
        error: String(err),
      });
      context = decisionStore.buildLearningContext(agentId, 10);
    }
    // Format via the local store — it delegates to the shared pure formatter,
    // and we want consistent output even when the remote reader is what
    // failed above.
    const contextPrompt = decisionStore.formatContextForPrompt(context);

    // Inject into upstream artifacts so the agent can use it
    const enrichedInput: AgentExecutionInput = {
      ...input,
      upstreamArtifacts: {
        ...input.upstreamArtifacts,
        _learningContext: contextPrompt,
        _learningStats: {
          totalDecisions: context.totalDecisions,
          successRate: context.successRate,
          insightCount: context.insights.length,
        },
      },
    };

    // 2. Execute the actual agent
    const output = await handler(enrichedInput);

    // 3. Extract decision metadata. Agents may emit either:
    //    - `_decision`  (singular) — one summary decision for the run
    //    - `_decisions` (plural)   — per-lead decisions, each with `lead_id`
    //
    // When both are present, plural wins (more granular attribution).
    const plural = output.artifacts._decisions as DecisionMeta[] | undefined;
    const singular = output.artifacts._decision as DecisionMeta | undefined;

    const decisionsToLog: DecisionMeta[] = Array.isArray(plural) && plural.length > 0
      ? plural
      : singular
        ? [singular]
        : [{}]; // log a bare decision so the run is still represented

    // 4. Log each decision
    try {
      for (const d of decisionsToLog) {
        const tags = [
          ...(options.defaultTags ?? []),
          ...(d.tags ?? []),
          `agent:${agentId}`,
        ];
        if (d.lead_id) tags.push(`lead_id:${d.lead_id}`);
        decisionStore.logDecision({
          agent_id: agentId,
          run_id: input.run_id,
          node_id: input.node_id,
          action: d.action ?? output.summary,
          reasoning: d.reasoning ?? "No reasoning provided",
          alternatives: d.alternatives ?? [],
          confidence: d.confidence ?? 0.5,
          inputs_summary: summarizeInputs(input),
          output_summary: d.output_summary ?? summarizeOutput(output),
          tags,
        });
      }

      log.debug("decisions logged", {
        agent: agentId,
        run: input.run_id,
        count: decisionsToLog.length,
        priorDecisions: context.totalDecisions,
      });
    } catch (err) {
      // Decision logging should never break the pipeline
      log.warn("failed to log decision", { agent: agentId, error: String(err) });
    }

    // Remove internal learning metadata from output artifacts
    const { _decision, _decisions, ...cleanArtifacts } = output.artifacts;

    return {
      ...output,
      artifacts: cleanArtifacts,
    };
  };
}

interface DecisionMeta {
  reasoning?: string;
  alternatives?: string[];
  confidence?: number;
  tags?: string[];
  /** Lead identifier (slug). When present, `lead_id:<id>` is added to tags. */
  lead_id?: string;
  /** Optional override for the decision's action / output_summary. */
  action?: string;
  output_summary?: string;
}

function summarizeInputs(input: AgentExecutionInput): string {
  const keys = Object.keys(input.upstreamArtifacts).filter(
    (k) => !k.startsWith("_"),
  );
  return `upstream: [${keys.join(", ")}], config: ${JSON.stringify(input.config ?? {}).slice(0, 200)}`;
}

function summarizeOutput(output: AgentExecutionOutput): string {
  const keys = Object.keys(output.artifacts).filter(
    (k) => !k.startsWith("_"),
  );
  return `artifacts: [${keys.join(", ")}], cost: ${output.cost_usd ?? 0}, posts: ${output.post_payloads?.length ?? 0}`;
}
