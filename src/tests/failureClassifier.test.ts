import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classify, isRetryable, type FailureContext } from "../runtime/failureClassifier.js";

function ctx(error: unknown, overrides: Partial<FailureContext> = {}): FailureContext {
  return { error, agentId: "x", attempts: 1, ...overrides };
}

describe("failureClassifier.classify", () => {
  it("classifies HTTP 429 as rate_limited", () => {
    assert.equal(classify(ctx(new Error("OpenRouter API error 429: rate limited"))), "rate_limited");
    assert.equal(classify(ctx(new Error("Too many requests, retry-after: 5s"))), "rate_limited");
  });

  it("classifies 5xx and timeouts as transient_external", () => {
    assert.equal(classify(ctx(new Error("OpenRouter API error 503: service unavailable"))), "transient_external");
    assert.equal(classify(ctx(new Error("Request timeout"))), "transient_external");
    assert.equal(classify(ctx(new Error("ECONNRESET"))), "transient_external");
    assert.equal(classify(ctx(new Error("fetch failed"))), "transient_external");
  });

  it("classifies validation / missing-input as fatal_input", () => {
    assert.equal(classify(ctx(new Error("required field missing: business_name"))), "fatal_input");
    assert.equal(classify(ctx(new Error("Zod validation error"))), "fatal_input");
    assert.equal(classify(ctx(new Error("no candidate found in upstream"))), "fatal_input");
  });

  it("classifies approval denied", () => {
    assert.equal(classify(ctx(new Error("Operator denied approval for paid action"))), "approval_denied");
  });

  it("uses lastCriticScore to short-circuit to quality_below_threshold", () => {
    assert.equal(
      classify(ctx(new Error("anything"), { lastCriticScore: 0.2 })),
      "quality_below_threshold",
    );
  });

  it("falls back to fatal_internal for unrecognised errors", () => {
    assert.equal(classify(ctx(new Error("undefined is not a function"))), "fatal_internal");
    assert.equal(classify(ctx("plain string error")), "fatal_internal");
  });

  it("isRetryable: only transient_external + rate_limited", () => {
    assert.equal(isRetryable("transient_external"), true);
    assert.equal(isRetryable("rate_limited"), true);
    assert.equal(isRetryable("approval_denied"), false);
    assert.equal(isRetryable("quality_below_threshold"), false);
    assert.equal(isRetryable("fatal_input"), false);
    assert.equal(isRetryable("fatal_internal"), false);
  });
});
