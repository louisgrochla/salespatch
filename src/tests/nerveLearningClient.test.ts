import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { NerveLearningClient } from "../learning/nerveLearningClient.js";
import { DecisionStore } from "../learning/decisionStore.js";
import { withLearning } from "../learning/learningAgent.js";
import type { AgentExecutionInput, AgentHandler } from "../pipeline/agentRuntime.js";

const SECRET = "test-secret-for-d2";

function expectedSignature(canonical: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(canonical).digest("hex")}`;
}

describe("NerveLearningClient — buildLearningContext", () => {
  it("signs the canonical query string and maps the wire payload", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, headers });
      return new Response(
        JSON.stringify({
          agent_id: "lead-scout-agent",
          recent_decisions: [
            {
              id: "dec-1",
              agent_id: "lead-scout-agent",
              run_id: "run-1",
              node_id: "scout",
              action: "shortlist 3 leads",
              reasoning: "high-density street, established awnings",
              alternatives: ["wider radius", "different postcode"],
              confidence: 0.8,
              inputs_summary: "config={radius:200}",
              output_summary: "3 leads",
              tags: ["agent:lead-scout-agent", "vertical:barber"],
              created_at: "2026-05-09T12:00:00.000Z",
              outcomes: [
                {
                  id: "out-1",
                  decision_id: "dec-1",
                  outcome_type: "lead_converted",
                  result: "positive",
                  metric_value: 1,
                  metric_name: "closed",
                  notes: "ok",
                  recorded_at: "2026-05-10T08:00:00.000Z",
                },
              ],
            },
          ],
          insights: [],
          success_rate: 0.5,
          total_decisions: 4,
          generated_at: "2026-05-10T20:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const client = new NerveLearningClient({
      baseUrl: "https://nerve.example.invalid",
      secret: SECRET,
      fetcher,
    });

    const ctx = await client.buildLearningContext("lead-scout-agent", 10);

    assert.equal(calls.length, 1);
    const expectedUrl =
      "https://nerve.example.invalid/api/read/decisions/learning-context?agent_id=lead-scout-agent&limit=10";
    assert.equal(calls[0].url, expectedUrl);
    assert.equal(
      calls[0].headers["X-Read-Signature"],
      expectedSignature("agent_id=lead-scout-agent&limit=10"),
    );

    assert.equal(ctx.totalDecisions, 4);
    assert.equal(ctx.successRate, 0.5);
    assert.equal(ctx.recentDecisions.length, 1);
    assert.equal(ctx.recentDecisions[0].outcomes.length, 1);
    assert.equal(ctx.recentDecisions[0].outcomes[0].result, "positive");
  });

  it("throws on non-2xx without retrying", async () => {
    let attempts = 0;
    const fetcher = (async () => {
      attempts++;
      return new Response("upstream error", { status: 503 });
    }) as typeof fetch;

    const client = new NerveLearningClient({
      baseUrl: "https://nerve.example.invalid",
      secret: SECRET,
      fetcher,
    });

    await assert.rejects(
      () => client.buildLearningContext("any-agent"),
      /HTTP 503/,
    );
    assert.equal(attempts, 1);
  });
});

describe("withLearning — contextSource override falls back to decisionStore on failure", () => {
  it("logs decisions to the local store even when the remote read fails", async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), "d2-fallback-"));
    const store = new DecisionStore(path.join(tmpDir, "test.sqlite"));
    try {
      const failingSource = {
        buildLearningContext: async () => {
          throw new Error("simulated network failure");
        },
        formatContextForPrompt: () => {
          throw new Error("should not be called when read failed");
        },
      };

      const handler: AgentHandler = async () => ({
        summary: "scouted 1 lead",
        artifacts: {
          leads: [],
          _decision: {
            reasoning: "manual probe",
            confidence: 0.6,
          },
        },
      });

      const wrapped = withLearning("lead-scout-agent", handler, store, {
        contextSource: failingSource,
      });

      const input: AgentExecutionInput = {
        run_id: "run-x",
        node_id: "scout",
        agent_id: "lead-scout-agent",
        upstreamArtifacts: {},
      };

      const out = await wrapped(input);
      assert.equal(out.summary, "scouted 1 lead");

      // Even though the remote source failed, the run is represented in the
      // local store — write-side never depends on read success.
      const logged = store.listDecisionsByAgent("lead-scout-agent");
      assert.equal(logged.length, 1);
      assert.equal(logged[0].reasoning, "manual probe");
    } finally {
      store.close();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
