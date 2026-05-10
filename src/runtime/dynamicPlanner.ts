import { createLogger } from "../lib/logger.js";
import type { AgentCapabilityRegistry, AgentCapability } from "./agentRegistry.js";
import type { FailureClass } from "./failureClassifier.js";

const log = createLogger("dynamic-planner");

const DEFAULT_MODEL = process.env.PLANNER_MODEL ?? "anthropic/claude-sonnet-4";
const DEFAULT_BASE_URL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = Number(process.env.PLANNER_TIMEOUT_MS ?? "20000");

export interface ReplanInput {
  failingNodeId: string;
  failingAgentId: string;
  failureClass: FailureClass;
  errorSummary: string;
  /** Capability requirements derived from the failing agent. */
  requiredCapabilities: string[];
  /** Replans already attempted on this run (caller-side counter). */
  attempts: number;
}

export type PlanRevision =
  | {
      kind: "swap_agent";
      newAgentId: string;
      reasoning: string;
      confidence: number;
    }
  | {
      kind: "skip_with_fallback";
      fallbackAgentId: string;
      reasoning: string;
      confidence: number;
    }
  | {
      kind: "abort";
      reasoning: string;
      confidence: number;
    };

export interface DynamicPlannerOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Inject a mock fetcher for tests. */
  fetcher?: typeof fetch;
  /** Hard cap on replans per run. Engine enforces; planner advises. */
  maxReplansPerRun?: number;
  /** Disable the LLM call entirely; the planner uses registry rules only. */
  offline?: boolean;
}

/**
 * Dynamic Planner — given a retryable failure, picks a replacement strategy.
 *
 * Two-tier logic:
 *   1. Registry-only fast path. If the failing capability has a `fallback_agent_id`
 *      that's still registered, swap to it without calling Claude.
 *   2. LLM path. Send the failure + available capabilities to Claude; expect a
 *      structured PlanRevision JSON. Validates the proposed agent exists in the
 *      registry before returning it; otherwise falls back to abort.
 *
 * The planner deliberately does NOT change the DAG topology. It only swaps the
 * agent_id of the failing node or aborts the run. Multi-step plan rewriting is
 * deferred until we have failure signal at scale (autumn 2026+).
 */
export class DynamicPlanner {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;
  private readonly offline: boolean;
  readonly maxReplansPerRun: number;

  constructor(
    private readonly registry: AgentCapabilityRegistry,
    options: DynamicPlannerOptions = {},
  ) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? fetch;
    this.offline = options.offline ?? !this.apiKey;
    this.maxReplansPerRun = options.maxReplansPerRun ??
      Number(process.env.REPLAN_MAX_ATTEMPTS ?? "2");
  }

  async replan(input: ReplanInput): Promise<PlanRevision> {
    if (input.attempts >= this.maxReplansPerRun) {
      return {
        kind: "abort",
        reasoning: `replan budget exhausted (${input.attempts}/${this.maxReplansPerRun})`,
        confidence: 1.0,
      };
    }

    // Registry fast-path: explicit fallback_agent_id wins.
    const failingCap = this.registry.get(input.failingAgentId);
    if (failingCap?.fallback_agent_id) {
      const fallback = this.registry.get(failingCap.fallback_agent_id);
      if (fallback) {
        return {
          kind: "swap_agent",
          newAgentId: fallback.id,
          reasoning: `registry fallback: ${input.failingAgentId} → ${fallback.id}`,
          confidence: 0.9,
        };
      }
    }

    // Capability-match fast-path: pick another agent with matching capabilities.
    const candidates = this.registry
      .findByCapability(input.requiredCapabilities)
      .filter((c) => c.id !== input.failingAgentId);

    if (this.offline) {
      return this.bestRegistryGuess(candidates, input);
    }

    if (candidates.length === 0) {
      return {
        kind: "abort",
        reasoning: "no agent in registry matches required capabilities",
        confidence: 0.95,
      };
    }

    return this.askClaude(input, candidates);
  }

  // ── Registry-only path (offline or as a fallback) ──

  private bestRegistryGuess(
    candidates: AgentCapability[],
    input: ReplanInput,
  ): PlanRevision {
    if (candidates.length === 0) {
      return {
        kind: "abort",
        reasoning: "offline planner: no candidate agent",
        confidence: 0.7,
      };
    }
    // Prefer cheapest, then highest reflection_enabled (best critic coverage).
    const sorted = [...candidates].sort((a, b) => {
      if (a.cost_per_run_estimate_usd !== b.cost_per_run_estimate_usd) {
        return a.cost_per_run_estimate_usd - b.cost_per_run_estimate_usd;
      }
      return Number(b.reflection_enabled) - Number(a.reflection_enabled);
    });
    return {
      kind: "swap_agent",
      newAgentId: sorted[0].id,
      reasoning: `offline planner: cheapest matching capability for ${input.requiredCapabilities.join("+")}`,
      confidence: 0.6,
    };
  }

  // ── LLM path ──

  private async askClaude(
    input: ReplanInput,
    candidates: AgentCapability[],
  ): Promise<PlanRevision> {
    const systemPrompt = `You are the dynamic planner for a multi-agent pipeline. An agent has failed; pick the best recovery action.

Respond with strict JSON matching one of:
  { "kind": "swap_agent", "newAgentId": "<id>", "reasoning": "...", "confidence": 0..1 }
  { "kind": "skip_with_fallback", "fallbackAgentId": "<id>", "reasoning": "...", "confidence": 0..1 }
  { "kind": "abort", "reasoning": "...", "confidence": 0..1 }

newAgentId / fallbackAgentId MUST be one of the listed candidates.
"swap_agent" replaces the failing agent in this node; "skip_with_fallback" runs a different agent and accepts its output; "abort" gives up.`;

    const userPrompt = `Failing agent: ${input.failingAgentId}
Failure class: ${input.failureClass}
Error summary: ${input.errorSummary}
Required capabilities: ${input.requiredCapabilities.join(", ")}
Replan attempts so far: ${input.attempts}

Candidate agents (id — capabilities — cost):
${candidates.map((c) => `  - ${c.id}: [${c.capabilities.join(", ")}] ($${c.cost_per_run_estimate_usd})`).join("\n")}

Decide the recovery action. Return strict JSON.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://localhost",
          "X-Title": process.env.OPENROUTER_APP_NAME ?? "openclaw-planner",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 800,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        log.warn("planner non-2xx, falling back to registry guess", { status: res.status });
        return this.bestRegistryGuess(candidates, input);
      }
      const payload = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content ?? "";
      const parsed = this.parseRevision(content, candidates);
      return parsed ?? this.bestRegistryGuess(candidates, input);
    } catch (e) {
      log.warn("planner failed, falling back to registry guess", { error: String(e) });
      return this.bestRegistryGuess(candidates, input);
    } finally {
      clearTimeout(timer);
    }
  }

  private parseRevision(
    content: string,
    candidates: AgentCapability[],
  ): PlanRevision | null {
    try {
      const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
      const obj = JSON.parse(trimmed) as {
        kind?: string;
        newAgentId?: string;
        fallbackAgentId?: string;
        reasoning?: string;
        confidence?: number;
      };
      const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";
      const confidence =
        typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0.5;

      if (obj.kind === "swap_agent" && typeof obj.newAgentId === "string") {
        if (!candidates.some((c) => c.id === obj.newAgentId)) {
          log.warn("planner returned unknown agent", { newAgentId: obj.newAgentId });
          return null;
        }
        return { kind: "swap_agent", newAgentId: obj.newAgentId, reasoning, confidence };
      }
      if (obj.kind === "skip_with_fallback" && typeof obj.fallbackAgentId === "string") {
        if (!candidates.some((c) => c.id === obj.fallbackAgentId)) return null;
        return {
          kind: "skip_with_fallback",
          fallbackAgentId: obj.fallbackAgentId,
          reasoning,
          confidence,
        };
      }
      if (obj.kind === "abort") {
        return { kind: "abort", reasoning, confidence };
      }
      return null;
    } catch (e) {
      log.warn("planner parse failed", { error: String(e) });
      return null;
    }
  }
}
