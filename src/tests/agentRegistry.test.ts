import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MultiAgentRuntime } from "../pipeline/agentRuntime.js";
import { AgentCapabilityRegistry, type AgentCapability } from "../runtime/agentRegistry.js";
import { OUTREACH_CAPABILITIES, registerOutreachAgents } from "../agents/outreach/index.js";

const cap: AgentCapability = {
  id: "test-agent",
  name: "Test",
  description: "Test agent",
  capabilities: ["foo", "bar"],
  requires_approval_for: [],
  model_provider: "rule",
  max_retries: 0,
  timeout_ms: 1000,
  cost_per_run_estimate_usd: 0,
  reflection_enabled: false,
};

describe("AgentCapabilityRegistry", () => {
  it("setCapability stores metadata without a runtime", () => {
    const r = new AgentCapabilityRegistry();
    r.setCapability(cap);
    assert.deepEqual(r.get("test-agent"), cap);
    assert.equal(r.list().length, 1);
  });

  it("register with handler also registers in the runtime", () => {
    const runtime = new MultiAgentRuntime();
    const r = new AgentCapabilityRegistry(runtime);
    let called = false;
    r.register(cap, async () => {
      called = true;
      return { summary: "ok", artifacts: {} };
    });
    assert.equal(runtime.has("test-agent"), true);
    return runtime
      .execute({
        run_id: "r",
        node_id: "n",
        agent_id: "test-agent",
        upstreamArtifacts: {},
      })
      .then(() => assert.equal(called, true));
  });

  it("findByCapability filters by required capabilities", () => {
    const r = new AgentCapabilityRegistry();
    r.setCapability(cap);
    r.setCapability({ ...cap, id: "html-only", capabilities: ["html_generation"] });
    r.setCapability({ ...cap, id: "html+css", capabilities: ["html_generation", "css_generation"] });

    assert.equal(r.findByCapability(["html_generation"]).length, 2);
    assert.equal(r.findByCapability(["html_generation", "css_generation"]).length, 1);
    assert.equal(r.findByCapability(["bar"]).length, 1); // only test-agent has "bar"
  });

  it("reflectionEnabledIds returns the right set for outreach", () => {
    const runtime = new MultiAgentRuntime();
    const registry = new AgentCapabilityRegistry(runtime);
    registerOutreachAgents(runtime, registry);
    const enabled = registry.reflectionEnabledIds();
    // Only site-composer-agent participates today
    assert.deepEqual([...enabled], ["site-composer-agent"]);
  });

  it("isFullyCovered is true after registerOutreachAgents", () => {
    const runtime = new MultiAgentRuntime();
    const registry = new AgentCapabilityRegistry(runtime);
    registerOutreachAgents(runtime, registry);
    assert.equal(registry.isFullyCovered(runtime), true);
    // Sanity: every outreach capability has metadata
    assert.equal(registry.list().length, OUTREACH_CAPABILITIES.length);
  });
});
