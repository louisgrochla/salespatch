import type { AgentHandler, MultiAgentRuntime } from "../pipeline/agentRuntime.js";

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  /** Capabilities this agent provides — used for capability-based routing in P9 replanner. */
  capabilities: string[];
  /** Operations this agent can take that require approval (e.g., paid API calls). */
  requires_approval_for: string[];
  model_provider: "claude" | "openrouter" | "local" | "manual" | "rule";
  max_retries: number;
  timeout_ms: number;
  cost_per_run_estimate_usd: number;
  /** Whether ReflectionLoop should wrap this agent's executions. */
  reflection_enabled: boolean;
  /** Critic implementation override. Defaults to global CRITIC_IMPLEMENTATION env. */
  critic_implementation?: "heuristic" | "llm" | "trained";
  /** ID of an agent to swap in if this one fails (used by Phase 9 replanner). */
  fallback_agent_id?: string;
}

/**
 * Decorates `MultiAgentRuntime` with capability metadata. The runtime keeps
 * owning the handler map; the registry is purely about who-can-do-what.
 *
 * Read paths used by:
 *   - ReflectionLoop          → reflectionEnabledIds()
 *   - P8 critic factory        → get(id).critic_implementation
 *   - P9 dynamic planner       → findByCapability(...)
 */
export class AgentCapabilityRegistry {
  private readonly capabilities = new Map<string, AgentCapability>();

  constructor(private readonly runtime?: MultiAgentRuntime) {}

  /**
   * Register an agent's metadata. If a runtime was supplied to the constructor
   * AND a handler is provided, also registers the handler with the runtime
   * (so callers can use the registry as the single registration surface).
   */
  register(capability: AgentCapability, handler?: AgentHandler): void {
    this.capabilities.set(capability.id, capability);
    if (handler && this.runtime) {
      this.runtime.register(capability.id, handler);
    }
  }

  /**
   * Set or update capability metadata for an already-registered handler.
   * Useful when handlers are registered through the runtime directly (e.g.,
   * after withLearning wrapping) and metadata is layered on after.
   */
  setCapability(capability: AgentCapability): void {
    this.capabilities.set(capability.id, capability);
  }

  get(agentId: string): AgentCapability | undefined {
    return this.capabilities.get(agentId);
  }

  list(): AgentCapability[] {
    return [...this.capabilities.values()];
  }

  /** Find agents whose capabilities include all `requirements`. */
  findByCapability(requirements: string[]): AgentCapability[] {
    if (requirements.length === 0) return this.list();
    return this.list().filter((c) =>
      requirements.every((r) => c.capabilities.includes(r)),
    );
  }

  /** IDs of agents with reflection_enabled. Convenience for ReflectionLoop options. */
  reflectionEnabledIds(): Set<string> {
    return new Set(
      this.list()
        .filter((c) => c.reflection_enabled)
        .map((c) => c.id),
    );
  }

  /** True if every registered handler in the runtime has matching metadata. */
  isFullyCovered(runtime: MultiAgentRuntime): boolean {
    return runtime.listRegistered().every((id) => this.capabilities.has(id));
  }
}
