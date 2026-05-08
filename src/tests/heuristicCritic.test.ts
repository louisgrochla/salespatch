import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { HeuristicCritic } from "../evaluation/heuristicCritic.js";

const goodSite = {
  lead_id: "barber-a",
  business_name: "Source Barber",
  brief_used: true,
  brand_source: "scraped",
  has_reviews: true,
  has_gallery: true,
  has_map: true,
  html_output: `<!doctype html><html><head><title>Source Barber</title></head><body>
    <header><h1>Source Barber</h1><p>Aberdeen's heritage barbershop</p>
      <a href="tel:+441224000000">Call now</a></header>
    <main>...</main></body></html>`,
  css_output: ":root{--primary:#2C5F45}",
};

const badSite = {
  lead_id: "barber-b",
  business_name: "Mystery Co",
  brief_used: false,
  brand_source: "vertical_default",
  has_reviews: false,
  has_gallery: false,
  has_map: false,
  html_output: `<html><body>Lorem ipsum dolor sit amet. {{business_name}} is closed.</body></html>`,
  css_output: "",
};

describe("HeuristicCritic", () => {
  const critic = new HeuristicCritic();

  it("scores well-formed site above threshold", async () => {
    const out = await critic.evaluate({
      agent_id: "site-composer-agent",
      output: { summary: "ok", artifacts: { sites: [goodSite] } },
      upstream: {},
    });
    assert.ok(out.score >= 0.7, `expected >= 0.7, got ${out.score}`);
    assert.equal(out.prediction, "likely_close");
    assert.ok(out.critique.strengths.length > 0);
  });

  it("caps score at 0.4 when placeholders present", async () => {
    const out = await critic.evaluate({
      agent_id: "site-composer-agent",
      output: { summary: "ok", artifacts: { sites: [badSite] } },
      upstream: {},
    });
    assert.ok(out.score <= 0.4, `expected <= 0.4, got ${out.score}`);
    assert.ok(out.critique.weaknesses.some((w) => /placeholder|lorem/i.test(w)));
  });

  it("returns neutral score for non-composer agents", async () => {
    const out = await critic.evaluate({
      agent_id: "lead-scout-agent",
      output: { summary: "ok", artifacts: {} },
      upstream: {},
    });
    assert.equal(out.score, 0.5);
    assert.equal(out.prediction, "uncertain");
  });

  it("hard-fails empty site list", async () => {
    const out = await critic.evaluate({
      agent_id: "site-composer-agent",
      output: { summary: "no sites", artifacts: { sites: [] } },
      upstream: {},
    });
    assert.equal(out.score, 0);
    assert.equal(out.prediction, "unlikely_close");
  });

  it("aggregates worst-case across multiple sites", async () => {
    const out = await critic.evaluate({
      agent_id: "site-composer-agent",
      output: { summary: "mixed", artifacts: { sites: [goodSite, badSite] } },
      upstream: {},
    });
    // Worst dominates — should be much closer to bad's score than good's.
    assert.ok(out.score < 0.65, `expected mixed score < 0.65, got ${out.score}`);
  });
});
