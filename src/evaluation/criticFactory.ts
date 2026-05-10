import { createLogger } from "../lib/logger.js";
import type { CriticInput, CriticEvaluation, CriticModel } from "./heuristicCritic.js";
import { HeuristicCritic } from "./heuristicCritic.js";
import { LLMCritic, type LLMCriticOptions } from "./llmCritic.js";
import type { AgentCapabilityRegistry } from "../runtime/agentRegistry.js";

const log = createLogger("critic-factory");

export type CriticImplementation = "heuristic" | "llm" | "trained";

export interface CriticFactoryOptions {
  /** Default impl when the agent's registry entry has no critic_implementation. */
  defaultImplementation?: CriticImplementation;
  /** Options threaded into LLMCritic. */
  llm?: LLMCriticOptions;
}

/**
 * Wraps multiple critic implementations and dispatches per-agent based on
 * the AgentCapabilityRegistry. Falls back to heuristic when no override is
 * configured.
 */
export class CriticFactory implements CriticModel {
  private readonly heuristic: HeuristicCritic;
  private readonly llm: LLMCritic;
  private readonly defaultImpl: CriticImplementation;

  constructor(
    private readonly registry: AgentCapabilityRegistry,
    options: CriticFactoryOptions = {},
  ) {
    this.heuristic = new HeuristicCritic();
    this.llm = new LLMCritic(options.llm);
    this.defaultImpl = options.defaultImplementation ?? "heuristic";
  }

  getActiveModelVersion(): string {
    return `factory:${this.defaultImpl}`;
  }

  async evaluate(input: CriticInput): Promise<CriticEvaluation> {
    const cap = this.registry.get(input.agent_id);
    const impl = cap?.critic_implementation ?? this.defaultImpl;
    switch (impl) {
      case "llm":
        return this.llm.evaluate(input);
      case "trained":
        log.warn("trained critic not implemented; falling back to heuristic", {
          agent: input.agent_id,
        });
        return this.heuristic.evaluate(input);
      case "heuristic":
      default:
        return this.heuristic.evaluate(input);
    }
  }
}
