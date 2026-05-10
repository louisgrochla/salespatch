import { PipelineAgentId } from "./types.js";
import type {
  CriticEvaluation,
  StrategyEntry,
  WorkingMemory,
} from "../runtime/types.js";

export interface AgentExecutionInput {
  run_id: string;
  node_id: string;
  agent_id: PipelineAgentId;
  config?: Record<string, unknown>;
  upstreamArtifacts: Record<string, unknown>;
  /**
   * Per-run scratchpad shared across agents. Optional — agents that don't
   * use it ignore it. Defaults to undefined until ReflectionLoop / engine
   * provides one in later phases.
   */
  workingMemory?: WorkingMemory;
  /**
   * Strategies relevant to this run. Empty until Phase 7 lands the ranker.
   * Agents reference these as guidance, never as forced choices.
   */
  strategyContext?: StrategyEntry[];
  /**
   * Set by ReflectionLoop on retry attempts. Agents that opt in regenerate
   * with the critique's specific_suggestions injected into their prompt.
   */
  critiqueFeedback?: { critique: CriticEvaluation; iteration: number };
}

export interface AgentExecutionOutput {
  summary: string;
  artifacts: Record<string, unknown>;
  cost_usd?: number;
  post_payloads?: Array<{
    platform: "tiktok" | "reels" | "shorts";
    payload: Record<string, unknown>;
  }>;
}

export type AgentHandler = (
  input: AgentExecutionInput,
) => Promise<AgentExecutionOutput>;

export class MultiAgentRuntime {
  private handlers = new Map<string, AgentHandler>();

  register(agentId: string, handler: AgentHandler): void {
    this.handlers.set(agentId, handler);
  }

  unregister(agentId: string): void {
    this.handlers.delete(agentId);
  }

  has(agentId: string): boolean {
    return this.handlers.has(agentId);
  }

  getHandler(agentId: string): AgentHandler | undefined {
    return this.handlers.get(agentId);
  }

  listRegistered(): string[] {
    return Array.from(this.handlers.keys());
  }

  async execute(input: AgentExecutionInput): Promise<AgentExecutionOutput> {
    const handler = this.handlers.get(input.agent_id);
    if (!handler) {
      throw new Error(
        `No handler registered for agent "${input.agent_id}". ` +
        `Registered: ${this.listRegistered().join(", ") || "(none)"}`,
      );
    }
    return handler(input);
  }
}
