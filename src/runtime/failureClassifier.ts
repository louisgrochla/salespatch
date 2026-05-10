import type { AgentCapability } from "./agentRegistry.js";

export type FailureClass =
  | "transient_external" // network blip, 5xx, timeout — retry safe
  | "rate_limited" // 429 — backoff + retry
  | "approval_denied" // approval gate rejected — surface to operator
  | "quality_below_threshold" // critic rejected output — handled by ReflectionLoop, not replanner
  | "fatal_input" // bad upstream artifact — re-run won't help
  | "fatal_internal"; // engine bug / unrecoverable

export interface FailureContext {
  error: unknown;
  agentId: string;
  capability?: AgentCapability;
  attempts: number;
  /** Critic score for the most recent attempt, if any. */
  lastCriticScore?: number;
}

/**
 * Pure rule-based failure classification. Order matters — first match wins.
 * The DynamicPlanner uses the result to decide whether to replan or fail.
 */
export function classify(ctx: FailureContext): FailureClass {
  const message = errorMessage(ctx.error).toLowerCase();

  // Critic rejection — reflection loop owns this; planner skips.
  if (
    typeof ctx.lastCriticScore === "number" &&
    ctx.lastCriticScore < 0.4
  ) {
    return "quality_below_threshold";
  }

  // HTTP 429 / rate limit signals.
  if (
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("retry-after")
  ) {
    return "rate_limited";
  }

  // Approval gate explicitly denied.
  if (
    message.includes("approval denied") ||
    message.includes("approval_denied") ||
    message.includes("operator denied")
  ) {
    return "approval_denied";
  }

  // Transient infrastructure: 5xx, timeouts, ECONNRESET, abort, fetch failure.
  if (
    /\b5\d\d\b/.test(message) || // any 5xx
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("openrouter api error 5") ||
    message.includes("apify") && message.includes("temporar")
  ) {
    return "transient_external";
  }

  // Bad upstream artifact — re-run with same input won't help.
  if (
    message.includes("required") ||
    message.includes("missing") ||
    message.includes("validation") ||
    message.includes("schema") ||
    message.includes("zod") ||
    message.includes("must be") ||
    message.includes("invalid input") ||
    message.includes("no candidate")
  ) {
    return "fatal_input";
  }

  // Default — assume internal so we surface it instead of silently retrying.
  return "fatal_internal";
}

/** Whether the planner should attempt a replan for this class. */
export function isRetryable(cls: FailureClass): boolean {
  return cls === "transient_external" || cls === "rate_limited";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
