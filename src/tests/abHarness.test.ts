import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pickArm } from "../evaluation/abHarness.js";

const variants = [
  { arm: "a", payload: { hero: "trophy_bar" } },
  { arm: "b", payload: { hero: "team_grid" } },
];

describe("pickArm", () => {
  it("same lead_id and experiment_id always returns the same arm", () => {
    const ctx = { lead_id: "source-barber", experiment_id: "exp-1" };
    const a = pickArm(variants, ctx);
    const b = pickArm(variants, ctx);
    const c = pickArm(variants, ctx);
    assert.equal(a.arm, b.arm);
    assert.equal(b.arm, c.arm);
  });

  it("different leads spread across both arms (~50/50 over 200 leads)", () => {
    let aCount = 0;
    let bCount = 0;
    for (let i = 0; i < 200; i += 1) {
      const r = pickArm(variants, { lead_id: `lead-${i}`, experiment_id: "exp-spread" });
      if (r.arm === "a") aCount += 1;
      else bCount += 1;
    }
    // Allow generous tolerance — 35-65 range out of 100.
    const pct = aCount / 200;
    assert.ok(pct >= 0.35 && pct <= 0.65, `arm a got ${pct * 100}%`);
  });

  it("respects weighted variants", () => {
    let aCount = 0;
    for (let i = 0; i < 1000; i += 1) {
      const r = pickArm(
        [
          { arm: "a", payload: 1, weight: 9 },
          { arm: "b", payload: 2, weight: 1 },
        ],
        { lead_id: `lead-${i}`, experiment_id: "exp-weighted" },
      );
      if (r.arm === "a") aCount += 1;
    }
    const pct = aCount / 1000;
    assert.ok(pct > 0.8 && pct < 0.95, `weighted arm a expected ~90%, got ${pct * 100}%`);
  });

  it("different experiment_id can flip the arm for the same lead", () => {
    const lead = "stoneham-cuts";
    const arms = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      arms.add(pickArm(variants, { lead_id: lead, experiment_id: `exp-${i}` }).arm);
    }
    assert.ok(arms.size === 2, "should see both arms across experiments");
  });

  it("single-variant case returns that variant", () => {
    const r = pickArm([{ arm: "only", payload: 42 }], {
      lead_id: "x",
      experiment_id: "y",
    });
    assert.equal(r.arm, "only");
  });

  it("zero-variant throws", () => {
    assert.throws(() =>
      pickArm([], { lead_id: "x", experiment_id: "y" }),
    );
  });
});
