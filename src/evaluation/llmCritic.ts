import { createHash } from "node:crypto";
import { createLogger } from "../lib/logger.js";
import type {
  CriticInput,
  CriticEvaluation,
  CriticModel,
} from "./heuristicCritic.js";

const log = createLogger("llm-critic");

const DEFAULT_MODEL = process.env.LLM_CRITIC_MODEL ?? "anthropic/claude-sonnet-4";
const DEFAULT_BASE_URL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_CRITIC_TIMEOUT_MS ?? "30000");

// OpenRouter list price for the default model — used for spend estimation only.
const INPUT_COST_PER_M = Number(process.env.LLM_CRITIC_INPUT_COST_PER_M ?? "3.0");
const OUTPUT_COST_PER_M = Number(process.env.LLM_CRITIC_OUTPUT_COST_PER_M ?? "15.0");

export interface LLMCriticOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Inject a mock fetcher for tests. */
  fetcher?: typeof fetch;
  /** Override cache instance. Pass `null` to disable caching. */
  cache?: Map<string, CriticEvaluation> | null;
}

interface OpenRouterChoice {
  message?: { content?: string };
}
interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Claude-based critic. Sends the agent's output + minimal context to a
 * fast Claude model and asks for a structured grade. Caches by content
 * hash so re-running the same output is free.
 *
 * Cost: ~$0.02-0.05 per call at default Sonnet pricing for ~3KB prompts.
 */
export class LLMCritic implements CriticModel {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;
  private readonly cache: Map<string, CriticEvaluation> | null;

  constructor(options: LLMCriticOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    this.model = options.model ?? DEFAULT_MODEL;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? fetch;
    this.cache = options.cache === null ? null : options.cache ?? new Map();
  }

  getActiveModelVersion(): string {
    return `llm:${this.model}`;
  }

  async evaluate(input: CriticInput): Promise<CriticEvaluation> {
    const cacheKey = this.cacheKey(input);
    const cached = this.cache?.get(cacheKey);
    if (cached) return cached;

    if (!this.apiKey) {
      log.warn("OPENROUTER_API_KEY missing; returning neutral score");
      return this.neutralFallback("missing API key");
    }

    const { systemPrompt, userPrompt } = buildPrompts(input);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetcher(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://localhost",
          "X-Title": process.env.OPENROUTER_APP_NAME ?? "openclaw-llm-critic",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1200,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        log.warn("LLM critic non-2xx, falling back", { status: res.status, body: body.slice(0, 200) });
        return this.neutralFallback(`api ${res.status}`);
      }
      const payload = (await res.json()) as OpenRouterResponse;
      const content = payload.choices?.[0]?.message?.content ?? "";
      const evaluation = parseEvaluation(content, this.getActiveModelVersion());

      // Spend logging — advisory.
      const promptTokens = payload.usage?.prompt_tokens ?? 0;
      const completionTokens = payload.usage?.completion_tokens ?? 0;
      const costUsd =
        (promptTokens / 1_000_000) * INPUT_COST_PER_M +
        (completionTokens / 1_000_000) * OUTPUT_COST_PER_M;
      log.debug("LLM critic complete", {
        agent: input.agent_id,
        score: evaluation.score,
        cost_usd: costUsd,
        cached: false,
      });

      this.cache?.set(cacheKey, evaluation);
      return evaluation;
    } catch (e) {
      log.warn("LLM critic failed, falling back", { error: String(e) });
      return this.neutralFallback("network error");
    } finally {
      clearTimeout(timer);
    }
  }

  private cacheKey(input: CriticInput): string {
    const stable = JSON.stringify({
      agent_id: input.agent_id,
      output: input.output.artifacts,
      model: this.model,
    });
    return createHash("sha256").update(stable).digest("hex");
  }

  private neutralFallback(reason: string): CriticEvaluation {
    return {
      score: 0.5,
      prediction: "uncertain",
      critique: { strengths: [], weaknesses: [], specific_suggestions: [] },
      confidence: 0,
      model_version: `${this.getActiveModelVersion()}:fallback:${reason}`,
    };
  }
}

// ── Prompt + parsing ──

function buildPrompts(input: CriticInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are a sales-conversion critic for spec-site demos sold to UK local businesses (cafés, barbers, bakeries, florists, restaurants) at £350. You grade an agent's output on the likelihood it will close a sale when shown to the business owner.

Respond with strict JSON matching this schema:
{
  "score": <number 0..1>,
  "prediction": "likely_close" | "unlikely_close" | "uncertain",
  "strengths": [<string>, ...],
  "weaknesses": [<string>, ...],
  "specific_suggestions": [<string>, ...],
  "confidence": <number 0..1>
}

Score is a forecast of close probability, not a quality grade.
strengths, weaknesses, suggestions: 2-5 concise items each.
Be honest — over-praising bad output makes the system worse.`;

  const summary = summariseOutput(input);
  const userPrompt = `Agent: ${input.agent_id}

Summary:
${summary}

Grade this output's sales-conversion likelihood as JSON.`;
  return { systemPrompt, userPrompt };
}

function summariseOutput(input: CriticInput): string {
  // For site-composer outputs, send the HTML head + first 6KB of body.
  // For everything else, send the artifact summary.
  if (input.agent_id === "site-composer-agent") {
    const sites = input.output.artifacts.sites as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(sites) && sites.length > 0) {
      const s = sites[0];
      const html = (s.html_output as string) ?? "";
      return `Business: ${s.business_name ?? "?"}
Vertical: ${s.vertical ?? "?"}
Hero variant: ${s.hero_variant ?? "?"}
Brief used: ${s.brief_used ?? false}
Brand source: ${s.brand_source ?? "?"}

HTML head + body excerpt (truncated to 6 KB):
${html.slice(0, 6_000)}`;
    }
  }
  return `Summary: ${input.output.summary}\nArtifacts: ${JSON.stringify(input.output.artifacts).slice(0, 4_000)}`;
}

function parseEvaluation(content: string, modelVersion: string): CriticEvaluation {
  try {
    const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    const obj = JSON.parse(trimmed) as {
      score?: number;
      prediction?: string;
      strengths?: string[];
      weaknesses?: string[];
      specific_suggestions?: string[];
      confidence?: number;
    };
    const score = clamp(toNumber(obj.score, 0.5), 0, 1);
    const prediction =
      obj.prediction === "likely_close" || obj.prediction === "unlikely_close"
        ? obj.prediction
        : "uncertain";
    return {
      score,
      prediction,
      critique: {
        strengths: Array.isArray(obj.strengths) ? obj.strengths.slice(0, 8) : [],
        weaknesses: Array.isArray(obj.weaknesses) ? obj.weaknesses.slice(0, 8) : [],
        specific_suggestions: Array.isArray(obj.specific_suggestions)
          ? obj.specific_suggestions.slice(0, 8)
          : [],
      },
      confidence: clamp(toNumber(obj.confidence, 0.5), 0, 1),
      model_version: modelVersion,
    };
  } catch (e) {
    log.warn("LLM critic JSON parse failed", { error: String(e) });
    return {
      score: 0.5,
      prediction: "uncertain",
      critique: { strengths: [], weaknesses: [], specific_suggestions: [] },
      confidence: 0,
      model_version: `${modelVersion}:parse_error`,
    };
  }
}

function toNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
