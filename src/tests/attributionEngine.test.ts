import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DecisionStore } from "../learning/decisionStore.js";
import { EpisodicStore } from "../memory/episodicStore.js";
import { AttributionEngine } from "../evaluation/attributionEngine.js";
import { OutcomeIngester } from "../learning/outcomeIngest.js";

describe("AttributionEngine", () => {
  let tmpDir: string;
  let store: DecisionStore;
  let episodes: EpisodicStore;
  let attribution: AttributionEngine;
  let ingester: OutcomeIngester;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "attribution-"));
    const dbPath = path.join(tmpDir, "test.sqlite");
    store = new DecisionStore(dbPath);
    episodes = new EpisodicStore(dbPath);
    attribution = new AttributionEngine(store, episodes);
    ingester = new OutcomeIngester(store, episodes, attribution);
  });

  afterEach(() => {
    store.close();
    episodes.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("credits high-scoring agent on positive outcome", async () => {
    const runId = "run-1";
    episodes.start({ pipeline_run_id: runId, pipeline_definition_id: "site-generation-v1" });
    store.logDecision({
      agent_id: "site-composer-agent",
      run_id: runId,
      node_id: "compose",
      action: "composed",
      reasoning: "ok",
      alternatives: [],
      confidence: 0.85,
      inputs_summary: "x",
      output_summary: "y",
      tags: ["lead_id:source-barber"],
    });
    episodes.recordNodeScore(runId, "compose", 0.9);
    episodes.completeRun(runId, { status: "completed", lead_id: "source-barber" });

    await ingester.ingest({
      source: "test",
      external_id: "ext-1",
      lead_id: "source-barber",
      outcome_type: "pitch_closed",
      result: "positive",
      occurred_at: new Date().toISOString(),
    });

    const rollup = attribution.rollupByAgent();
    assert.equal(rollup.length, 1);
    assert.equal(rollup[0].agent_id, "site-composer-agent");
    assert.ok(rollup[0].avg_weight > 0.85, `expected > 0.85, got ${rollup[0].avg_weight}`);
    assert.equal(rollup[0].positive_count, 1);
    assert.equal(rollup[0].negative_count, 0);
  });

  it("blames high-scoring agent on negative outcome", async () => {
    const runId = "run-2";
    episodes.start({ pipeline_run_id: runId, pipeline_definition_id: "site-generation-v1" });
    store.logDecision({
      agent_id: "site-composer-agent",
      run_id: runId,
      node_id: "compose",
      action: "composed",
      reasoning: "overconfident",
      alternatives: [],
      confidence: 0.85,
      inputs_summary: "x",
      output_summary: "y",
      tags: ["lead_id:bad-pitch"],
    });
    episodes.recordNodeScore(runId, "compose", 0.9);
    episodes.completeRun(runId, { status: "completed", lead_id: "bad-pitch" });

    await ingester.ingest({
      source: "test",
      external_id: "ext-2",
      lead_id: "bad-pitch",
      outcome_type: "pitch_rejected",
      result: "negative",
      occurred_at: new Date().toISOString(),
    });

    const rollup = attribution.rollupByAgent();
    assert.ok(rollup[0].avg_weight < -0.85);
    assert.equal(rollup[0].negative_count, 1);
  });

  it("uses default 0.5 weight when no critic score recorded", async () => {
    const runId = "run-3";
    episodes.start({ pipeline_run_id: runId, pipeline_definition_id: "lead-generation-v1" });
    store.logDecision({
      agent_id: "lead-scout-agent",
      run_id: runId,
      node_id: "scout",
      action: "scouted",
      reasoning: "ok",
      alternatives: [],
      confidence: 0.7,
      inputs_summary: "x",
      output_summary: "y",
      tags: ["lead_id:lead-x"],
    });
    // NO recordNodeScore — non-critic agent
    episodes.completeRun(runId, { status: "completed", lead_id: "lead-x" });

    await ingester.ingest({
      source: "test",
      external_id: "ext-3",
      lead_id: "lead-x",
      outcome_type: "pitch_closed",
      result: "positive",
      occurred_at: new Date().toISOString(),
    });

    const rollup = attribution.rollupByAgent();
    assert.equal(rollup[0].agent_id, "lead-scout-agent");
    assert.equal(rollup[0].avg_weight, 0.5);
  });

  it("is idempotent — already-attributed outcomes are skipped", async () => {
    const runId = "run-4";
    episodes.start({ pipeline_run_id: runId, pipeline_definition_id: "x" });
    store.logDecision({
      agent_id: "site-composer-agent",
      run_id: runId,
      node_id: "compose",
      action: "x",
      reasoning: "x",
      alternatives: [],
      confidence: 0.5,
      inputs_summary: "",
      output_summary: "",
      tags: ["lead_id:lead-y"],
    });
    episodes.recordNodeScore(runId, "compose", 0.7);
    episodes.completeRun(runId, { status: "completed", lead_id: "lead-y" });

    await ingester.ingest({
      source: "test",
      external_id: "ext-4",
      lead_id: "lead-y",
      outcome_type: "pitch_closed",
      result: "positive",
      occurred_at: new Date().toISOString(),
    });

    const first = await attribution.attributePending();
    assert.equal(first.length, 0, "first call: nothing to attribute (already done)");
    const rollup = attribution.rollupByAgent();
    assert.equal(rollup[0].n, 1);
  });
});
