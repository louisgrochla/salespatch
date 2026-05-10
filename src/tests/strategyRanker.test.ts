import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { EpisodicStore } from "../memory/episodicStore.js";
import { StrategicStore } from "../memory/strategicStore.js";
import { StrategyRanker, wilsonInterval } from "../evaluation/strategyRanker.js";

describe("wilsonInterval", () => {
  it("symmetric small samples", () => {
    const [lo, hi] = wilsonInterval(5, 10);
    assert.ok(lo > 0.2 && lo < 0.3, `lower bound ${lo}`);
    assert.ok(hi > 0.7 && hi < 0.8, `upper bound ${hi}`);
  });

  it("zero closed gives [0, upper] with non-trivial upper bound", () => {
    const [lo, hi] = wilsonInterval(0, 5);
    assert.equal(lo, 0);
    assert.ok(hi > 0.3 && hi < 0.6, `upper ${hi}`);
  });

  it("zero total returns [0, 0]", () => {
    assert.deepEqual(wilsonInterval(0, 0), [0, 0]);
  });

  it("large sample tightens interval around true rate", () => {
    const [lo, hi] = wilsonInterval(50, 100);
    assert.ok(hi - lo < 0.2, `interval too wide: [${lo}, ${hi}]`);
  });
});

describe("StrategyRanker", () => {
  let tmpDir: string;
  let episodes: EpisodicStore;
  let strategies: StrategicStore;
  let ranker: StrategyRanker;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "strategy-ranker-"));
    const dbPath = path.join(tmpDir, "test.sqlite");
    episodes = new EpisodicStore(dbPath);
    strategies = new StrategicStore(dbPath);
    ranker = new StrategyRanker(episodes, strategies, {
      tagPrefixes: ["hero:", "palette:"],
    });
  });

  afterEach(() => {
    episodes.close();
    strategies.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Helper to add an episode with outcome and tags. */
  function addEp(
    runId: string,
    vertical: string,
    tags: string[],
    outcome: "closed" | "rejected",
  ): void {
    episodes.start({ pipeline_run_id: runId, pipeline_definition_id: "x" });
    episodes.completeRun(runId, { status: "completed", vertical, pivot_tags: tags });
    episodes.attachOutcome(runId, { pitch_outcome: outcome });
  }

  it("groups by tag prefixes and computes close rate", async () => {
    // 4 barber+trophy_bar+heritage_green: 3 closed, 1 rejected → rate 0.75
    for (let i = 0; i < 3; i += 1) {
      addEp(`r-tt-c-${i}`, "barber", ["hero:trophy_bar", "palette:heritage_green"], "closed");
    }
    addEp("r-tt-r", "barber", ["hero:trophy_bar", "palette:heritage_green"], "rejected");

    // 2 barber+team_grid+trust_blue: 0 closed → rate 0
    for (let i = 0; i < 2; i += 1) {
      addEp(`r-tg-${i}`, "barber", ["hero:team_grid", "palette:trust_blue"], "rejected");
    }

    const result = await ranker.runOnce();
    assert.equal(result.strategies_evaluated, 2);

    const tt = strategies
      .list({ vertical: "barber" })
      .find((s) => s.parameters.hero === "trophy_bar");
    const tg = strategies
      .list({ vertical: "barber" })
      .find((s) => s.parameters.hero === "team_grid");
    assert.ok(tt && tg);
    assert.equal(tt.sample_size, 4);
    assert.equal(tt.close_rate, 0.75);
    assert.equal(tg.close_rate, 0);
    // confidence interval populated
    assert.ok(tt.confidence_lower != null && tt.confidence_upper != null);
  });

  it("status lifecycle: small samples stay 'testing', poor large samples 'deprecated'", async () => {
    for (let i = 0; i < 5; i += 1) {
      addEp(`small-${i}`, "barber", ["hero:trophy_bar", "palette:heritage_green"], i < 3 ? "closed" : "rejected");
    }
    for (let i = 0; i < 25; i += 1) {
      addEp(`bad-${i}`, "barber", ["hero:team_grid", "palette:warm_neutral"], "rejected");
    }
    await ranker.runOnce();
    const small = strategies.list({ vertical: "barber" })
      .find((s) => s.parameters.hero === "trophy_bar");
    const bad = strategies.list({ vertical: "barber" })
      .find((s) => s.parameters.hero === "team_grid");
    assert.equal(small?.status, "testing");
    assert.equal(bad?.status, "deprecated");
  });

  it("getRelevant prioritises champion > active > testing > new", () => {
    strategies.upsert({
      vertical: "barber", strategy_type: "design",
      parameters: { hero: "x" }, sample_size: 50, close_rate: 0.6,
      confidence_lower: 0.45, confidence_upper: 0.7, status: "champion",
    });
    strategies.upsert({
      vertical: "barber", strategy_type: "design",
      parameters: { hero: "y" }, sample_size: 30, close_rate: 0.5,
      confidence_lower: 0.3, confidence_upper: 0.6, status: "active",
    });
    strategies.upsert({
      vertical: "barber", strategy_type: "design",
      parameters: { hero: "z" }, sample_size: 5, close_rate: 0.4,
      confidence_lower: 0.1, confidence_upper: 0.7, status: "testing",
    });
    strategies.upsert({
      vertical: "barber", strategy_type: "design",
      parameters: { hero: "old" }, sample_size: 30, close_rate: 0.0,
      confidence_lower: 0.0, confidence_upper: 0.1, status: "deprecated",
    });

    const relevant = strategies.getRelevant("barber");
    assert.equal(relevant.length, 3, "deprecated excluded");
    assert.equal(relevant[0].status, "champion");
    assert.equal(relevant[1].status, "active");
    assert.equal(relevant[2].status, "testing");
  });

  it("re-run is idempotent — same data → same strategies, no new rows", async () => {
    for (let i = 0; i < 4; i += 1) {
      addEp(`r-${i}`, "cafe", ["hero:team_grid", "palette:warm_neutral"], i < 2 ? "closed" : "rejected");
    }
    await ranker.runOnce();
    const first = strategies.list();
    await ranker.runOnce();
    const second = strategies.list();
    assert.equal(first.length, second.length);
    assert.equal(first[0].id, second[0].id);
  });
});
