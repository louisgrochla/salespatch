import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { EpisodicStore } from "../memory/episodicStore.js";

describe("EpisodicStore", () => {
  let tmpDir: string;
  let store: EpisodicStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "episodic-store-"));
    store = new EpisodicStore(path.join(tmpDir, "test.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts an episode and round-trips its state", () => {
    const ep = store.start({
      pipeline_run_id: "run-1",
      pipeline_definition_id: "lead-generation-v1",
      trigger: "manual",
    });
    assert.equal(ep.status, "running");
    assert.equal(ep.total_cost_usd, 0);

    const fetched = store.getByPipelineRun("run-1");
    assert.ok(fetched);
    assert.equal(fetched.id, ep.id);
    assert.equal(fetched.trigger, "manual");
  });

  it("records critic scores and reflection iterations", () => {
    store.start({ pipeline_run_id: "run-2", pipeline_definition_id: "site-generation-v1" });
    store.recordNodeScore("run-2", "compose", 0.85);
    store.recordNodeScore("run-2", "qa", 0.92);
    store.incrementReflectionIterations("run-2", 1);
    store.addCost("run-2", 0.15);

    const ep = store.getByPipelineRun("run-2");
    assert.ok(ep);
    assert.equal(ep.critic_scores.compose, 0.85);
    assert.equal(ep.critic_scores.qa, 0.92);
    assert.equal(ep.reflection_iterations, 1);
    assert.equal(ep.total_cost_usd, 0.15);
  });

  it("completeRun persists pivot tags and lead_id", () => {
    store.start({ pipeline_run_id: "run-3", pipeline_definition_id: "x" });
    store.completeRun("run-3", {
      status: "completed",
      pivot_tags: ["vertical:barber", "hero:trophy_bar", "palette:heritage_green"],
      lead_id: "source-barber",
      vertical: "barber",
      business_name: "Source Barber",
    });

    const ep = store.getByPipelineRun("run-3");
    assert.ok(ep);
    assert.equal(ep.status, "completed");
    assert.equal(ep.lead_id, "source-barber");
    assert.deepEqual(ep.pivot_tags, [
      "vertical:barber",
      "hero:trophy_bar",
      "palette:heritage_green",
    ]);
    assert.ok(ep.ended_at);
  });

  it("attachOutcome populates outcome columns", () => {
    store.start({ pipeline_run_id: "run-4", pipeline_definition_id: "x" });
    store.completeRun("run-4", { status: "completed", lead_id: "lead-1" });

    const updated = store.attachOutcome("run-4", {
      pitch_outcome: "closed",
      close_amount_gbp: 350,
      outcome_notes: "great pitch",
    });
    assert.ok(updated);
    assert.equal(updated.pitch_outcome, "closed");
    assert.equal(updated.close_amount_gbp, 350);
    assert.ok(updated.outcome_received_at);
    assert.ok(updated.days_to_outcome != null && updated.days_to_outcome >= 0);
  });

  it("pivotByTags groups by hero and palette and computes close rate", () => {
    // 4 runs of barber+trophy_bar — 3 closed, 1 rejected → 0.75
    for (let i = 0; i < 4; i += 1) {
      const runId = `run-tt-${i}`;
      store.start({ pipeline_run_id: runId, pipeline_definition_id: "x" });
      store.completeRun(runId, {
        status: "completed",
        pivot_tags: ["vertical:barber", "hero:trophy_bar", "palette:trust_blue"],
      });
      store.attachOutcome(runId, {
        pitch_outcome: i < 3 ? "closed" : "rejected",
      });
    }
    // 2 runs of barber+team_grid — 0 closed → 0.0
    for (let i = 0; i < 2; i += 1) {
      const runId = `run-tg-${i}`;
      store.start({ pipeline_run_id: runId, pipeline_definition_id: "x" });
      store.completeRun(runId, {
        status: "completed",
        pivot_tags: ["vertical:barber", "hero:team_grid", "palette:heritage_green"],
      });
      store.attachOutcome(runId, { pitch_outcome: "rejected" });
    }

    const pivot = store.pivotByTags(["vertical:barber"], ["hero:", "palette:"]);
    assert.equal(pivot.length, 2);
    const trophy = pivot.find((p) => p.group_key.hero === "trophy_bar");
    const team = pivot.find((p) => p.group_key.hero === "team_grid");
    assert.ok(trophy && team);
    assert.equal(trophy.sample_size, 4);
    assert.equal(trophy.closed, 3);
    assert.equal(trophy.close_rate, 0.75);
    assert.equal(team.sample_size, 2);
    assert.equal(team.closed, 0);
    assert.equal(team.close_rate, 0);
  });
});
