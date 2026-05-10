import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { LLMCritic } from "../evaluation/llmCritic.js";
import type { CriticInput } from "../evaluation/heuristicCritic.js";

function fakeFetcher(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const sampleInput: CriticInput = {
  agent_id: "site-composer-agent",
  output: {
    summary: "1 site composed",
    artifacts: {
      sites: [
        {
          lead_id: "x",
          business_name: "Source Barber",
          vertical: "barber",
          hero_variant: "trophy_bar",
          brief_used: true,
          brand_source: "scraped",
          html_output: "<!doctype html><html><body>Source Barber</body></html>",
        },
      ],
    },
  },
  upstream: {},
};

describe("LLMCritic", () => {
  it("parses a well-formed JSON response", async () => {
    const responseBody = JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 0.84,
              prediction: "likely_close",
              strengths: ["clear hero", "social proof"],
              weaknesses: ["no booking iframe"],
              specific_suggestions: ["Add a booking iframe"],
              confidence: 0.7,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 600, completion_tokens: 200 },
    });
    const critic = new LLMCritic({
      apiKey: "test",
      fetcher: fakeFetcher(responseBody),
      cache: null,
    });
    const out = await critic.evaluate(sampleInput);
    assert.equal(out.score, 0.84);
    assert.equal(out.prediction, "likely_close");
    assert.deepEqual(out.critique.strengths, ["clear hero", "social proof"]);
    assert.equal(out.critique.specific_suggestions[0], "Add a booking iframe");
    assert.equal(out.confidence, 0.7);
  });

  it("falls back gracefully on non-2xx", async () => {
    const critic = new LLMCritic({
      apiKey: "test",
      fetcher: fakeFetcher("rate limited", 429),
      cache: null,
    });
    const out = await critic.evaluate(sampleInput);
    assert.equal(out.score, 0.5);
    assert.equal(out.prediction, "uncertain");
    assert.match(out.model_version, /fallback:api 429/);
  });

  it("falls back when API key absent", async () => {
    const critic = new LLMCritic({ apiKey: "", cache: null });
    const out = await critic.evaluate(sampleInput);
    assert.equal(out.score, 0.5);
    assert.match(out.model_version, /fallback:missing API key/);
  });

  it("clamps out-of-range scores to [0, 1]", async () => {
    const responseBody = JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 1.7,
              prediction: "likely_close",
              confidence: -0.2,
            }),
          },
        },
      ],
    });
    const critic = new LLMCritic({
      apiKey: "test",
      fetcher: fakeFetcher(responseBody),
      cache: null,
    });
    const out = await critic.evaluate(sampleInput);
    assert.equal(out.score, 1);
    assert.equal(out.confidence, 0);
  });

  it("handles parse errors with neutral fallback", async () => {
    const responseBody = JSON.stringify({
      choices: [{ message: { content: "this is not JSON at all" } }],
    });
    const critic = new LLMCritic({
      apiKey: "test",
      fetcher: fakeFetcher(responseBody),
      cache: null,
    });
    const out = await critic.evaluate(sampleInput);
    assert.equal(out.score, 0.5);
    assert.match(out.model_version, /parse_error/);
  });

  it("caches results — second call to same content does not refetch", async () => {
    let calls = 0;
    const responseBody = JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({ score: 0.9, prediction: "likely_close" }),
          },
        },
      ],
    });
    const fetcher = (async () => {
      calls += 1;
      return new Response(responseBody, { status: 200 });
    }) as unknown as typeof fetch;
    const critic = new LLMCritic({ apiKey: "test", fetcher });
    await critic.evaluate(sampleInput);
    await critic.evaluate(sampleInput);
    assert.equal(calls, 1, "second evaluate hit the cache");
  });
});
