import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MultiAgentRuntime } from "../pipeline/agentRuntime.js";
import { AgentCapabilityRegistry, type AgentCapability } from "../runtime/agentRegistry.js";
import { DynamicPlanner } from "../runtime/dynamicPlanner.js";

const baseCap: Omit<AgentCapability, "id"> = {
  name: "x",
  description: "x",
  capabilities: ["html_generation"],
  requires_approval_for: [],
  model_provider: "openrouter",
  max_retries: 1,
  timeout_ms: 1000,
  cost_per_run_estimate_usd: 0.15,
  reflection_enabled: false,
};

function setupRegistry(): AgentCapabilityRegistry {
  const runtime = new MultiAgentRuntime();
  const registry = new AgentCapabilityRegistry(runtime);
  registry.setCapability({ ...baseCap, id: "primary", capabilities: ["html_generation"] });
  registry.setCapability({
    ...baseCap,
    id: "primary-with-fallback",
    capabilities: ["html_generation"],
    fallback_agent_id: "primary-fallback",
  });
  registry.setCapability({
    ...baseCap,
    id: "primary-fallback",
    capabilities: ["html_generation"],
    cost_per_run_estimate_usd: 0,
  });
  registry.setCapability({ ...baseCap, id: "secondary", capabilities: ["html_generation"] });
  registry.setCapability({ ...baseCap, id: "unrelated", capabilities: ["lead_discovery"] });
  return registry;
}

function fakeFetcher(body: string, status = 200): typeof fetch {
  return (async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe("DynamicPlanner", () => {
  it("uses registry fallback_agent_id without calling Claude", async () => {
    const registry = setupRegistry();
    let calls = 0;
    const planner = new DynamicPlanner(registry, {
      apiKey: "test",
      fetcher: (async () => {
        calls += 1;
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    const rev = await planner.replan({
      failingNodeId: "compose",
      failingAgentId: "primary-with-fallback",
      failureClass: "transient_external",
      errorSummary: "503",
      requiredCapabilities: ["html_generation"],
      attempts: 0,
    });
    assert.equal(rev.kind, "swap_agent");
    if (rev.kind === "swap_agent") assert.equal(rev.newAgentId, "primary-fallback");
    assert.equal(calls, 0, "no LLM call needed when registry fallback exists");
  });

  it("aborts when replan budget exhausted", async () => {
    const registry = setupRegistry();
    const planner = new DynamicPlanner(registry, { offline: true, maxReplansPerRun: 2 });
    const rev = await planner.replan({
      failingNodeId: "compose",
      failingAgentId: "primary",
      failureClass: "transient_external",
      errorSummary: "503",
      requiredCapabilities: ["html_generation"],
      attempts: 2,
    });
    assert.equal(rev.kind, "abort");
  });

  it("offline mode picks cheapest matching capability", async () => {
    const registry = setupRegistry();
    const planner = new DynamicPlanner(registry, { offline: true });
    const rev = await planner.replan({
      failingNodeId: "compose",
      failingAgentId: "primary",
      failureClass: "transient_external",
      errorSummary: "503",
      requiredCapabilities: ["html_generation"],
      attempts: 0,
    });
    assert.equal(rev.kind, "swap_agent");
    if (rev.kind === "swap_agent") {
      // primary-fallback (cost 0) beats primary-with-fallback (0.15) and secondary (0.15)
      assert.equal(rev.newAgentId, "primary-fallback");
    }
  });

  it("offline aborts when no capability match", async () => {
    const registry = setupRegistry();
    const planner = new DynamicPlanner(registry, { offline: true });
    const rev = await planner.replan({
      failingNodeId: "compose",
      failingAgentId: "primary",
      failureClass: "transient_external",
      errorSummary: "503",
      requiredCapabilities: ["dragon_summoning"],
      attempts: 0,
    });
    assert.equal(rev.kind, "abort");
  });

  it("LLM path: parses well-formed swap_agent JSON", async () => {
    const registry = setupRegistry();
    const responseBody = JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              kind: "swap_agent",
              newAgentId: "secondary",
              reasoning: "secondary handles 503s gracefully",
              confidence: 0.7,
            }),
          },
        },
      ],
    });
    const planner = new DynamicPlanner(registry, {
      apiKey: "test",
      fetcher: fakeFetcher(responseBody),
    });
    const rev = await planner.replan({
      failingNodeId: "compose",
      failingAgentId: "primary",
      failureClass: "transient_external",
      errorSummary: "503",
      requiredCapabilities: ["html_generation"],
      attempts: 0,
    });
    assert.equal(rev.kind, "swap_agent");
    if (rev.kind === "swap_agent") assert.equal(rev.newAgentId, "secondary");
  });

  it("LLM path rejects unknown agent id and falls back to registry guess", async () => {
    const registry = setupRegistry();
    const responseBody = JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              kind: "swap_agent",
              newAgentId: "definitely-not-registered",
              reasoning: "...",
              confidence: 0.9,
            }),
          },
        },
      ],
    });
    const planner = new DynamicPlanner(registry, {
      apiKey: "test",
      fetcher: fakeFetcher(responseBody),
    });
    const rev = await planner.replan({
      failingNodeId: "compose",
      failingAgentId: "primary",
      failureClass: "transient_external",
      errorSummary: "503",
      requiredCapabilities: ["html_generation"],
      attempts: 0,
    });
    // Falls back to offline guess (cheapest match).
    assert.equal(rev.kind, "swap_agent");
    if (rev.kind === "swap_agent") assert.equal(rev.newAgentId, "primary-fallback");
  });
});
