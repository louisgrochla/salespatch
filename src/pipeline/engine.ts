import { randomUUID } from "node:crypto";
import { NotificationStore } from "../notifications/notificationStore.js";
import { MultiAgentRuntime } from "./agentRuntime.js";
import { DispatchReasonCode, PostDispatchAdapter } from "./postDispatch.js";
import { SQLitePipelineStore } from "./sqlitePipelineStore.js";
import { PipelineBudgetPolicy, PipelineNodeRun, PipelineRun } from "./types.js";
import type { EpisodicStore } from "../memory/episodicStore.js";
import type { ReflectionLoop } from "../evaluation/reflectionLoop.js";
import type { DecisionStore } from "../learning/decisionStore.js";
import { InMemoryWorkingMemory } from "../runtime/workingMemory.js";
import type { WorkingMemory } from "../runtime/types.js";

export class PipelineEngine {
  /** WorkingMemory instances keyed by runId — shared across nodes of one run. */
  private readonly workingMemories = new Map<string, WorkingMemory>();

  constructor(
    private readonly store: SQLitePipelineStore,
    private readonly runtime: MultiAgentRuntime,
    private readonly notificationStore?: NotificationStore,
    private readonly budgetPolicy: PipelineBudgetPolicy = {
      max_cost_per_task_usd: Number(process.env.HIGGSFIELD_MAX_COST_PER_TASK_USD ?? "10"),
      max_cost_per_day_usd: Number(process.env.HIGGSFIELD_MAX_COST_PER_DAY_USD ?? "50"),
    },
    private readonly dispatchAdapters?: Map<string, PostDispatchAdapter>,
    private readonly episodicStore?: EpisodicStore,
    private readonly reflectionLoop?: ReflectionLoop,
    private readonly decisionStore?: DecisionStore,
  ) {}

  private getOrCreateWorkingMemory(runId: string): WorkingMemory {
    let wm = this.workingMemories.get(runId);
    if (!wm) {
      wm = new InMemoryWorkingMemory(runId);
      this.workingMemories.set(runId, wm);
    }
    return wm;
  }

  createLeadGenerationDefinition(): ReturnType<SQLitePipelineStore["upsertDefinition"]> {
    return this.store.upsertDefinition({
      id: "lead-generation-v1",
      name: "Lead Generation Pipeline",
      enabled: true,
      schedule_rrule: "FREQ=DAILY;INTERVAL=1",
      max_retries: 1,
      nodes: [
        { id: "scout", agent_id: "lead-scout-agent", depends_on: [], config: {
          verticals: ["restaurant", "cafe", "barber", "salon", "bakery", "pub"],
          location: "Manchester",
          max_results_per_vertical: 5,
        } },
        {
          id: "profile",
          agent_id: "lead-profiler-agent",
          depends_on: ["scout"],
        },
        {
          id: "brand-analyse",
          agent_id: "brand-analyser-agent",
          depends_on: ["profile"],
        },
        {
          id: "brand-intelligence",
          agent_id: "brand-intelligence-agent",
          depends_on: ["brand-analyse"],
        },
        {
          id: "qualify",
          agent_id: "lead-qualifier-agent",
          depends_on: ["brand-intelligence"],
        },
        {
          id: "assign",
          agent_id: "lead-assigner-agent",
          depends_on: ["qualify"],
        },
      ],
      config: {},
    });
  }

  createSiteGenerationDefinition(): ReturnType<SQLitePipelineStore["upsertDefinition"]> {
    return this.store.upsertDefinition({
      id: "site-generation-v1",
      name: "Site Generation Pipeline",
      enabled: true,
      schedule_rrule: "",
      max_retries: 1,
      nodes: [
        { id: "brief", agent_id: "brief-generator-agent", depends_on: [] },
        {
          id: "compose",
          agent_id: "site-composer-agent",
          depends_on: ["brief"],
        },
        {
          id: "qa",
          agent_id: "site-qa-agent",
          depends_on: ["compose"],
        },
      ],
      config: {},
    });
  }

  /** Mark any runs left in 'running' state as failed (crash recovery) */
  recoverStaleRuns(): void {
    const runs = this.store.listRuns(200);
    let recovered = 0;
    for (const run of runs) {
      if (run.status === "running") {
        this.store.setRunStatus(run.id, "failed", "interrupted by restart");
        recovered++;
      }
    }
    if (recovered > 0) {
      this.notificationStore?.append({
        event_id: randomUUID(),
        created_at: new Date().toISOString(),
        channel: "notify_user",
        reason: "pipeline_recovery",
        message: `Recovered ${recovered} stale pipeline run(s) after restart`,
        severity: "warning",
        session_id: "system",
        user_id: "system",
      });
    }
  }

  async startRun(input: {
    definitionId: string;
    trigger: PipelineRun["trigger"];
    approval_token?: string;
  }): Promise<PipelineRun> {
    const definition = this.store.getDefinition(input.definitionId);
    if (!definition) {
      throw new Error(`pipeline definition not found: ${input.definitionId}`);
    }
    const run = this.store.createRun({
      definition,
      trigger: input.trigger,
      approval_token: input.approval_token,
    });
    await this.executeRun(run.id);
    this.store.bumpNextRunAt(definition.id, new Date().toISOString());
    const updated = this.store.getRun(run.id);
    if (!updated) {
      throw new Error(`pipeline run not found: ${run.id}`);
    }
    return updated;
  }

  async executeRun(runId: string): Promise<void> {
    this.store.setRunStatus(runId, "running");

    // Idempotently begin an episode for this run. Only on the first call —
    // re-entry from retryNode shouldn't re-create the episode row.
    if (this.episodicStore && !this.episodicStore.getByPipelineRun(runId)) {
      const run = this.store.getRun(runId);
      if (run) {
        this.episodicStore.start({
          pipeline_run_id: runId,
          pipeline_definition_id: run.pipeline_definition_id,
          trigger: run.trigger,
        });
      }
    }

    let safety = 0;
    while (safety < 200) {
      safety += 1;
      const runnable = this.store.listRunnableNodes(runId);
      if (runnable.length === 0) {
        break;
      }
      for (const node of runnable) {
        const done = await this.executeNode(runId, node);
        if (!done) {
          this.store.setRunStatus(runId, "blocked", `blocked at ${node.node_id}`);
          this.completeEpisode(runId, "blocked");
          return;
        }
      }
      this.store.recomputeBlockedNodes(runId);
    }
    this.finalizeRun(runId);
  }

  async retryNode(runId: string, nodeId: string): Promise<void> {
    const node = this.store.getNodeRun(runId, nodeId);
    if (!node) {
      throw new Error(`node not found: ${runId}/${nodeId}`);
    }
    this.store.setNodeStatus({
      runId,
      nodeId,
      status: "pending",
      error: undefined,
    });
    this.store.recomputeBlockedNodes(runId);
    await this.executeRun(runId);
  }

  async overrideNode(runId: string, nodeId: string, reason: string): Promise<void> {
    this.store.setNodeStatus({
      runId,
      nodeId,
      status: "completed",
      error: `manually overridden: ${reason}`,
      ended: true,
      started: true,
    });
    this.store.recomputeBlockedNodes(runId);
    await this.executeRun(runId);
  }

  private async executeNode(runId: string, node: PipelineNodeRun): Promise<boolean> {
    const run = this.store.getRun(runId);
    if (!run) {
      throw new Error(`pipeline run not found: ${runId}`);
    }
    if (node.paid_action && !run.approval_token) {
      this.store.setNodeStatus({
        runId,
        nodeId: node.node_id,
        status: "awaiting_approval",
        error: "approval token required for paid node",
      });
      this.notify({
        session_id: runId,
        user_id: "mission-control",
        reason: "approval_required",
        severity: "warning",
        message: `Run ${runId} blocked at ${node.node_id}: approval token required.`,
      });
      this.store.blockDependents(runId, node.node_id, "awaiting approval");
      return false;
    }

    const maxRetries = this.store.getDefinition(run.pipeline_definition_id)?.max_retries ?? 1;
    let attempt = node.attempts;
    while (attempt <= maxRetries) {
      attempt += 1;
      this.store.setNodeStatus({
        runId,
        nodeId: node.node_id,
        status: "running",
        attempts: attempt,
        started: true,
      });
      const upstreamArtifacts = this.collectUpstreamArtifacts(runId, node.depends_on);
      const task = this.store.appendAgentTask({
        run_id: runId,
        node_id: node.node_id,
        agent_id: node.agent_id,
        status: "running",
        started_at: new Date().toISOString(),
        input_json: {
          config: node.config ?? {},
          upstream: upstreamArtifacts,
        },
      });
      try {
        const workingMemory = this.getOrCreateWorkingMemory(runId);
        const baseInput = {
          run_id: runId,
          node_id: node.node_id,
          agent_id: node.agent_id,
          config: node.config,
          upstreamArtifacts,
          workingMemory,
          strategyContext: [],
        };
        let settled;
        if (this.reflectionLoop?.isEnabled(node.agent_id)) {
          // Route through reflection. The wrapped handler from the runtime
          // (which already includes withLearning) is what reflection retries.
          const wrappedHandler = this.runtime.getHandler(node.agent_id);
          if (!wrappedHandler) {
            throw new Error(`No handler for ${node.agent_id} despite registration`);
          }
          const reflection = await this.reflectionLoop.execute(wrappedHandler, baseInput);
          settled = reflection.output;
        } else {
          settled = await this.runtime.execute(baseInput);
        }
        this.episodicStore?.recordAgentSummary(runId, node.node_id, settled.summary);
        this.store.appendAgentTask({
          run_id: runId,
          node_id: node.node_id,
          agent_id: node.agent_id,
          status: "completed",
          started_at: task.started_at,
          completed_at: new Date().toISOString(),
          input_json: task.input_json,
          output_json: settled.artifacts,
        });
        this.store.appendArtifact({
          run_id: runId,
          node_id: node.node_id,
          kind: "agent.output",
          value_json: settled.artifacts,
        });
        if (settled.cost_usd && settled.cost_usd > 0) {
          if (!this.withinBudget(runId, settled.cost_usd)) {
            this.store.setNodeStatus({
              runId,
              nodeId: node.node_id,
              status: "failed",
              error: "budget cap exceeded",
              ended: true,
            });
            this.store.blockDependents(runId, node.node_id, "budget cap exceeded");
            this.notify({
              session_id: runId,
              user_id: "mission-control",
              reason: "budget_exceeded",
              severity: "critical",
              message: `Run ${runId} exceeded budget at ${node.node_id}.`,
            });
            return false;
          }
          this.store.appendSpendLedger({
            timestamp: new Date().toISOString(),
            scope: "task",
            reference_id: runId,
            provider: "higgsfield",
            amount_usd: settled.cost_usd,
          });
        }
        if (node.agent_id === "media-generator-agent") {
          this.store.createMediaJob({
            run_id: runId,
            node_id: node.node_id,
            provider: "higgsfield",
            status: "completed",
            input_json: task.input_json,
            output_json: settled.artifacts,
            cost_usd: settled.cost_usd,
            approved_by_token: run.approval_token,
          });
        }
        if (node.agent_id === "publisher-agent" && settled.post_payloads) {
          for (const payload of settled.post_payloads) {
            this.store.enqueuePost({
              run_id: runId,
              platform: payload.platform,
              status: "pending_approval",
              payload_json: payload.payload,
            });
          }
        }
        this.store.setNodeStatus({
          runId,
          nodeId: node.node_id,
          status: "completed",
          attempts: attempt,
          ended: true,
        });
        return true;
      } catch (error) {
        if (attempt <= maxRetries) {
          continue;
        }
        this.store.setNodeStatus({
          runId,
          nodeId: node.node_id,
          status: "failed",
          attempts: attempt,
          error: String(error),
          ended: true,
        });
        this.store.blockDependents(runId, node.node_id, String(error));
        this.notify({
          session_id: runId,
          user_id: "mission-control",
          reason: "pipeline_blocked",
          severity: "critical",
          message: `Node ${node.node_id} failed: ${String(error)}`,
        });
        return false;
      }
    }
    return false;
  }

  async dispatchPostQueueItem(input: {
    id: string;
    approvedBy?: string;
  }): Promise<{
    status: string;
    detail: string;
    reason_code:
      | DispatchReasonCode
      | "POLICY_APPROVAL_REQUIRED"
      | "MISSING_ADAPTER"
      | "ALREADY_DEAD_LETTER";
    retry_after_ms?: number;
    attempts: number;
  }> {
    const maxAttempts = 3;
    const retryBackoffMs = [3000, 15000, 60000];

    const queue = this.store.listPostQueue(500).find((item) => item.id === input.id);
    if (!queue) {
      throw new Error("post queue item not found");
    }
    if (queue.status === "dead_letter") {
      return {
        status: "dead_letter",
        detail: "item already in dead-letter",
        reason_code: "ALREADY_DEAD_LETTER",
        attempts: queue.attempts,
      };
    }
    if (queue.status === "pending_approval") {
      if (!input.approvedBy) {
        const attempts = queue.attempts + 1;
        this.store.patchPostQueue(queue.id, {
          status: "dead_letter",
          attempts,
          last_error: JSON.stringify({
            reason_code: "POLICY_APPROVAL_REQUIRED",
            detail: "approved_by is required before delivery",
            retryable: false,
          }),
        });
        return {
          status: "dead_letter",
          detail: "approved_by is required before delivery",
          reason_code: "POLICY_APPROVAL_REQUIRED",
          attempts,
        };
      }
      this.store.patchPostQueue(queue.id, {
        status: "approved",
        approved_by: input.approvedBy ?? "mission-control",
      });
    }
    const active = this.store.listPostQueue(500).find((item) => item.id === input.id);
    if (!active) {
      throw new Error("post queue item missing after approval");
    }
    const adapter = this.dispatchAdapters?.get(active.platform);
    if (!adapter) {
      const attempts = active.attempts + 1;
      const status = attempts >= maxAttempts ? "dead_letter" : "failed";
      this.store.patchPostQueue(active.id, {
        status,
        last_error: JSON.stringify({
          reason_code: "MISSING_ADAPTER",
          detail: `no dispatch adapter configured for ${active.platform}`,
          retryable: attempts < maxAttempts,
        }),
        attempts,
      });
      return {
        status,
        detail: "missing adapter",
        reason_code: "MISSING_ADAPTER",
        retry_after_ms: attempts < maxAttempts ? retryBackoffMs[Math.min(attempts - 1, retryBackoffMs.length - 1)] : undefined,
        attempts,
      };
    }
    const nextAttempt = active.attempts + 1;
    const result = await adapter.dispatch({
      payload: active.payload_json,
      idempotency_key: `post-${active.id}-attempt-${nextAttempt}`,
      queue_id: active.id,
      run_id: active.run_id,
      attempt: nextAttempt,
    });
    if (!result.success) {
      const attempts = nextAttempt;
      const retryAfterMs = result.retryable
        ? retryBackoffMs[Math.min(attempts - 1, retryBackoffMs.length - 1)]
        : undefined;
      const status =
        !result.retryable || attempts >= maxAttempts ? "dead_letter" : "failed";
      this.store.patchPostQueue(active.id, {
        status,
        attempts,
        last_error: JSON.stringify({
          reason_code: result.reason_code,
          detail: result.detail,
          retryable: result.retryable,
          retry_after_ms: retryAfterMs,
          http_status: result.http_status,
        }),
      });
      return {
        status,
        detail: result.detail,
        reason_code: result.reason_code,
        retry_after_ms: retryAfterMs,
        attempts,
      };
    }
    this.store.patchPostQueue(active.id, {
      status: "dispatched",
      attempts: nextAttempt,
      dispatched_at: new Date().toISOString(),
      last_error: undefined,
    });
    return {
      status: "dispatched",
      detail: result.detail,
      reason_code: result.reason_code,
      attempts: nextAttempt,
    };
  }

  private finalizeRun(runId: string): void {
    const nodes = this.store.listNodeRuns(runId);
    const hasFailed = nodes.some((node) => node.status === "failed");
    const hasBlocked = nodes.some(
      (node) => node.status === "blocked" || node.status === "awaiting_approval",
    );
    const allCompleted = nodes.length > 0 && nodes.every((node) => node.status === "completed");
    if (allCompleted) {
      this.store.setRunStatus(runId, "completed");
      this.completeEpisode(runId, "completed");
      return;
    }
    if (hasFailed) {
      this.store.setRunStatus(runId, "failed");
      this.completeEpisode(runId, "failed");
      return;
    }
    if (hasBlocked) {
      this.store.setRunStatus(runId, "blocked");
      this.completeEpisode(runId, "blocked");
      return;
    }
    this.store.setRunStatus(runId, "running");
  }

  /** Persist final episode state, deriving pivot tags from logged decisions. */
  private completeEpisode(runId: string, status: "completed" | "failed" | "blocked"): void {
    if (!this.episodicStore) return;
    const existing = this.episodicStore.getByPipelineRun(runId);
    if (!existing || existing.ended_at) return;

    const decisions = this.decisionStore?.listDecisionsByRun(runId) ?? [];
    const pivotTags = derivePivotTags(decisions.flatMap((d) => d.tags));
    const leadId = findLeadIdFromDecisions(decisions);
    const wm = this.workingMemories.get(runId);

    this.episodicStore.completeRun(runId, {
      status,
      pivot_tags: pivotTags,
      lead_id: leadId,
      working_memory_snapshot: wm?.snapshot(),
    });

    // Free the WM — it's persisted on the episode now.
    this.workingMemories.delete(runId);
  }

  private collectUpstreamArtifacts(
    runId: string,
    dependencyNodeIds: string[],
  ): Record<string, unknown> {
    if (dependencyNodeIds.length === 0) {
      return {};
    }
    const artifacts = this.store
      .listArtifacts(runId)
      .filter((artifact) => dependencyNodeIds.includes(artifact.node_id));
    const merged: Record<string, unknown> = {};
    for (const artifact of artifacts) {
      merged[artifact.node_id] = artifact.value_json;
    }
    return merged;
  }

  private withinBudget(runId: string, nextCostUsd: number): boolean {
    const taskSpend = this.store.taskSpendUsd(runId);
    if (taskSpend + nextCostUsd > this.budgetPolicy.max_cost_per_task_usd) {
      return false;
    }
    const daySpend = this.store.dailySpendUsd(new Date().toISOString());
    return daySpend + nextCostUsd <= this.budgetPolicy.max_cost_per_day_usd;
  }

  private notify(input: {
    session_id: string;
    user_id: string;
    reason:
      | "pipeline_blocked"
      | "budget_exceeded"
      | "approval_required";
    severity: "info" | "warning" | "critical";
    message: string;
  }): void {
    this.notificationStore
      ?.append({
        event_id: randomUUID(),
        created_at: new Date().toISOString(),
        channel: "notify_user",
        reason: input.reason,
        message: input.message,
        severity: input.severity,
        session_id: input.session_id,
        user_id: input.user_id,
      })
      .catch(() => undefined);
  }
}

// ── Pivot tag derivation ──

/** Tag prefixes considered pivot-worthy on episode rollups. */
const PIVOT_PREFIXES = [
  "vertical:",
  "hero:",
  "palette:",
  "cta:",
  "proof:",
  "brand_source:",
  "category:",
  "qa_passed:",
  "section:",
  "component_style:",
  "font_pairing:",
];

function derivePivotTags(allTags: string[]): string[] {
  const seen = new Set<string>();
  for (const tag of allTags) {
    for (const prefix of PIVOT_PREFIXES) {
      if (tag.startsWith(prefix)) {
        seen.add(tag);
        break;
      }
    }
  }
  return [...seen];
}

function findLeadIdFromDecisions(
  decisions: Array<{ tags: string[] }>,
): string | undefined {
  // Most-frequent lead_id wins. At pipeline-level the run is one lead (manual)
  // or many leads (batch). For multi-lead batches we leave lead_id null and
  // attribute via individual decisions.
  const counts = new Map<string, number>();
  for (const d of decisions) {
    for (const tag of d.tags) {
      if (tag.startsWith("lead_id:")) {
        const id = tag.slice("lead_id:".length);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) return undefined;
  if (counts.size === 1) return [...counts.keys()][0];
  // Multi-lead batch — don't pin to a single lead.
  return undefined;
}
