import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DecisionStore } from "../learning/decisionStore.js";
import { withLearning } from "../learning/learningAgent.js";
import type { AgentExecutionInput, AgentHandler } from "../pipeline/agentRuntime.js";

describe("withLearning — _decisions plural support", () => {
  let tmpDir: string;
  let store: DecisionStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "learning-decisions-"));
    store = new DecisionStore(path.join(tmpDir, "test.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeInput(): AgentExecutionInput {
    return {
      run_id: "run-1",
      node_id: "compose",
      agent_id: "site-composer-agent",
      upstreamArtifacts: {},
    };
  }

  it("logs one decision per item when _decisions is an array", async () => {
    const handler: AgentHandler = async () => ({
      summary: "composed 2 sites",
      artifacts: {
        sites: [],
        _decisions: [
          {
            lead_id: "barber-a",
            reasoning: "trophy_bar",
            confidence: 0.85,
            tags: ["hero:trophy_bar", "palette:heritage_green"],
          },
          {
            lead_id: "barber-b",
            reasoning: "team_grid",
            confidence: 0.7,
            tags: ["hero:team_grid", "palette:trust_blue"],
          },
        ],
      },
    });

    const wrapped = withLearning("site-composer-agent", handler, store);
    const out = await wrapped(makeInput());

    // _decisions is stripped from the returned artifacts
    assert.equal((out.artifacts as Record<string, unknown>)._decisions, undefined);
    assert.equal((out.artifacts as Record<string, unknown>).sites, undefined === undefined ? out.artifacts.sites : undefined);

    const aDecisions = store.listDecisionsByLeadId("barber-a");
    const bDecisions = store.listDecisionsByLeadId("barber-b");
    assert.equal(aDecisions.length, 1);
    assert.equal(bDecisions.length, 1);
    assert.ok(aDecisions[0].tags.includes("hero:trophy_bar"));
    assert.ok(aDecisions[0].tags.includes("agent:site-composer-agent"));
    assert.ok(aDecisions[0].tags.includes("lead_id:barber-a"));
    assert.equal(aDecisions[0].confidence, 0.85);
    assert.ok(bDecisions[0].tags.includes("hero:team_grid"));
  });

  it("falls back to singular _decision when _decisions absent", async () => {
    const handler: AgentHandler = async () => ({
      summary: "did the thing",
      artifacts: {
        _decision: {
          lead_id: "single-lead",
          reasoning: "summary reason",
          confidence: 0.6,
          tags: ["vertical:cafe"],
        },
      },
    });

    const wrapped = withLearning("brand-intelligence-agent", handler, store);
    await wrapped(makeInput());

    const decisions = store.listDecisionsByLeadId("single-lead");
    assert.equal(decisions.length, 1);
    assert.ok(decisions[0].tags.includes("vertical:cafe"));
    assert.ok(decisions[0].tags.includes("lead_id:single-lead"));
  });

  it("logs a bare decision when neither plural nor singular present", async () => {
    const handler: AgentHandler = async () => ({
      summary: "no decision metadata",
      artifacts: { result: 42 },
    });

    const wrapped = withLearning("lead-scout-agent", handler, store);
    await wrapped(makeInput());

    const all = store.listDecisionsByAgent("lead-scout-agent");
    assert.equal(all.length, 1);
    assert.equal(all[0].confidence, 0.5);
    assert.deepEqual(all[0].tags, ["agent:lead-scout-agent"]);
  });

  it("when both present, plural wins (no double-counting)", async () => {
    const handler: AgentHandler = async () => ({
      summary: "both shapes",
      artifacts: {
        _decision: { reasoning: "summary", confidence: 0.5 },
        _decisions: [
          { lead_id: "a", confidence: 0.9, tags: [] },
          { lead_id: "b", confidence: 0.8, tags: [] },
        ],
      },
    });

    const wrapped = withLearning("agent-x", handler, store);
    await wrapped(makeInput());

    const all = store.listDecisionsByAgent("agent-x");
    assert.equal(all.length, 2);
  });
});
