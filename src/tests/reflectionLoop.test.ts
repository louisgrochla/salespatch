import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ReflectionLoop } from "../evaluation/reflectionLoop.js";
import type {
  CriticEvaluation,
  CriticInput,
  CriticModel,
} from "../evaluation/heuristicCritic.js";
import type {
  AgentExecutionInput,
  AgentExecutionOutput,
  AgentHandler,
} from "../pipeline/agentRuntime.js";

class StubCritic implements CriticModel {
  constructor(private readonly scores: number[]) {}
  private idx = 0;
  getActiveModelVersion(): string {
    return "stub-v1";
  }
  async evaluate(_input: CriticInput): Promise<CriticEvaluation> {
    const score = this.scores[Math.min(this.idx, this.scores.length - 1)];
    this.idx += 1;
    return {
      score,
      prediction: score >= 0.7 ? "likely_close" : "unlikely_close",
      critique: {
        strengths: [],
        weaknesses: [`score=${score}`],
        specific_suggestions: ["try harder"],
      },
      confidence: 0.5,
      model_version: "stub-v1",
    };
  }
}

describe("ReflectionLoop", () => {
  function input(): AgentExecutionInput {
    return {
      run_id: "run-x",
      node_id: "compose",
      agent_id: "site-composer-agent",
      upstreamArtifacts: {},
    };
  }

  it("bypasses non-enabled agents", async () => {
    const handler: AgentHandler = async () => ({ summary: "x", artifacts: {} });
    const loop = new ReflectionLoop(new StubCritic([0.1]), {
      threshold: 0.7,
      maxRetries: 3,
      enabledAgents: new Set(["other-agent"]),
    });
    const result = await loop.execute(handler, input());
    assert.equal(result.iterations.length, 0);
    assert.equal(result.accepted, true);
    assert.equal(result.finalScore, 1.0);
  });

  it("accepts on first try when score >= threshold", async () => {
    const handler: AgentHandler = async () => ({ summary: "ok", artifacts: {} });
    const loop = new ReflectionLoop(new StubCritic([0.85]), {
      threshold: 0.7,
      maxRetries: 1,
      enabledAgents: new Set(["site-composer-agent"]),
    });
    const result = await loop.execute(handler, input());
    assert.equal(result.iterations.length, 1);
    assert.equal(result.accepted, true);
    assert.equal(result.finalScore, 0.85);
  });

  it("retries with critique injected when below threshold", async () => {
    let lastInput: AgentExecutionInput | undefined;
    const handler: AgentHandler = async (i): Promise<AgentExecutionOutput> => {
      lastInput = i;
      return { summary: "x", artifacts: {} };
    };
    const loop = new ReflectionLoop(new StubCritic([0.4, 0.85]), {
      threshold: 0.7,
      maxRetries: 1,
      enabledAgents: new Set(["site-composer-agent"]),
    });
    const result = await loop.execute(handler, input());
    assert.equal(result.iterations.length, 2);
    assert.equal(result.accepted, true);
    // The second call must include critiqueFeedback.
    assert.ok(lastInput?.critiqueFeedback);
    assert.equal(lastInput.critiqueFeedback.iteration, 1);
  });

  it("forces best output and reports accepted=false when budget exhausts", async () => {
    const handler: AgentHandler = async () => ({ summary: "x", artifacts: {} });
    const loop = new ReflectionLoop(new StubCritic([0.3, 0.5]), {
      threshold: 0.7,
      maxRetries: 1,
      enabledAgents: new Set(["site-composer-agent"]),
    });
    const result = await loop.execute(handler, input());
    assert.equal(result.iterations.length, 2);
    assert.equal(result.accepted, false);
    assert.equal(result.finalScore, 0.5);
  });

  it("reports score to score sink", async () => {
    const recorded: Array<{ runId: string; nodeId: string; score: number }> = [];
    const sink = {
      recordNodeScore: (runId: string, nodeId: string, score: number) => {
        recorded.push({ runId, nodeId, score });
      },
      incrementReflectionIterations: () => undefined,
    };
    const handler: AgentHandler = async () => ({ summary: "x", artifacts: {} });
    const loop = new ReflectionLoop(
      new StubCritic([0.85]),
      {
        threshold: 0.7,
        maxRetries: 0,
        enabledAgents: new Set(["site-composer-agent"]),
      },
      sink,
    );
    await loop.execute(handler, input());
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].score, 0.85);
    assert.equal(recorded[0].nodeId, "compose");
  });
});
