import type { Decision, LearningInsight, Outcome } from "./decisionStore.js";

// Pure formatter for the learning-context prompt section. Extracted so both
// the Pi-side DecisionStore (SQLite) and the NerveLearningClient (HTTP) can
// produce identical strings — agents see the same prompt regardless of read
// source. Keep this file dependency-free (no DB, no fetch) so it stays cheap
// to import and trivial to test.

export interface DecisionContext {
  recentDecisions: Array<Decision & { outcomes: Outcome[] }>;
  insights: LearningInsight[];
  successRate: number;
  totalDecisions: number;
}

export function formatLearningContextForPrompt(context: DecisionContext): string {
  if (context.totalDecisions === 0) {
    return "No prior decisions recorded. This is the first run.";
  }

  const parts: string[] = [];
  parts.push(
    `## Learning Context (${context.totalDecisions} prior decisions, ${(context.successRate * 100).toFixed(0)}% success rate)`,
  );

  if (context.insights.length > 0) {
    parts.push("\n### Key Insights:");
    for (const insight of context.insights) {
      parts.push(
        `- ${insight.pattern} → ${insight.recommendation} (based on ${insight.sample_size} decisions)`,
      );
    }
  }

  const withOutcomes = context.recentDecisions.filter((d) => d.outcomes.length > 0);
  if (withOutcomes.length > 0) {
    parts.push("\n### Recent Decisions & Outcomes:");
    for (const d of withOutcomes.slice(0, 5)) {
      const outcomeStr = d.outcomes
        .map(
          (o) =>
            `${o.result}${o.metric_value ? ` (${o.metric_name}: ${o.metric_value})` : ""}`,
        )
        .join(", ");
      parts.push(
        `- Decision: ${d.action} (confidence: ${d.confidence})\n  Reasoning: ${d.reasoning}\n  Outcome: ${outcomeStr}`,
      );
    }
  }

  return parts.join("\n");
}
