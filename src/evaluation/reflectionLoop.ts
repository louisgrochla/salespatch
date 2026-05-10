import { createLogger } from "../lib/logger.js";
import type {
  AgentExecutionInput,
  AgentExecutionOutput,
  AgentHandler,
} from "../pipeline/agentRuntime.js";
import type { CriticEvaluation } from "../runtime/types.js";
import type { CriticModel } from "./heuristicCritic.js";

const log = createLogger("reflection-loop");

export interface ReflectionLoopOptions {
  threshold: number;
  maxRetries: number;
  /** Set of agent IDs that participate. Others bypass the loop entirely. */
  enabledAgents: Set<string>;
}

export interface ReflectionIteration {
  iteration: number;
  score: number;
  accepted: boolean;
  critique: CriticEvaluation;
}

export interface ReflectionResult {
  output: AgentExecutionOutput;
  iterations: ReflectionIteration[];
  finalScore: number;
  accepted: boolean;
}

export interface ReflectionScoreSink {
  recordNodeScore(pipelineRunId: string, nodeId: string, score: number): void;
  incrementReflectionIterations(pipelineRunId: string, by?: number): void;
}

export class ReflectionLoop {
  constructor(
    private readonly critic: CriticModel,
    private readonly opts: ReflectionLoopOptions,
    private readonly scoreSink?: ReflectionScoreSink,
  ) {}

  isEnabled(agentId: string): boolean {
    return this.opts.enabledAgents.has(agentId);
  }

  /**
   * Wraps a handler. If the agent isn't in the enabled set, calls handler
   * once and returns. Otherwise: critic-scores each attempt, retries with
   * critique injected if score < threshold. Always returns the highest-
   * scoring output.
   */
  async execute(handler: AgentHandler, input: AgentExecutionInput): Promise<ReflectionResult> {
    if (!this.isEnabled(input.agent_id)) {
      const out = await handler(input);
      return { output: out, iterations: [], finalScore: 1.0, accepted: true };
    }

    const iterations: ReflectionIteration[] = [];
    let bestOutput: AgentExecutionOutput | undefined;
    let bestScore = -Infinity;
    let lastCritique: CriticEvaluation | undefined;

    for (let i = 0; i <= this.opts.maxRetries; i += 1) {
      const augmented: AgentExecutionInput =
        i === 0 || lastCritique == null
          ? input
          : { ...input, critiqueFeedback: { critique: lastCritique, iteration: i } };

      const output = await handler(augmented);
      const evaluation = await this.critic.evaluate({
        agent_id: input.agent_id,
        output,
        upstream: input.upstreamArtifacts,
        config: input.config,
      });

      const accepted = evaluation.score >= this.opts.threshold;
      iterations.push({
        iteration: i,
        score: evaluation.score,
        accepted,
        critique: evaluation,
      });

      if (evaluation.score > bestScore) {
        bestScore = evaluation.score;
        bestOutput = output;
      }
      lastCritique = evaluation;

      if (accepted) break;
      if (i >= this.opts.maxRetries) break;
      log.info("reflection retry", {
        agent: input.agent_id,
        run: input.run_id,
        node: input.node_id,
        iteration: i,
        score: evaluation.score,
      });
    }

    if (this.scoreSink) {
      try {
        this.scoreSink.recordNodeScore(input.run_id, input.node_id, bestScore);
        if (iterations.length > 1) {
          this.scoreSink.incrementReflectionIterations(input.run_id, iterations.length - 1);
        }
      } catch (e) {
        log.warn("score sink failed", { error: String(e) });
      }
    }

    return {
      output: bestOutput ?? (await handler(input)),
      iterations,
      finalScore: bestScore,
      accepted: bestScore >= this.opts.threshold,
    };
  }
}
