import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DecisionStore } from "../learning/decisionStore.js";
import {
  OutcomeIngester,
  OutcomeIngestPayload,
  canonicalBody,
  signBody,
  verifySignature,
} from "../learning/outcomeIngest.js";

describe("OutcomeIngester", () => {
  let tmpDir: string;
  let store: DecisionStore;
  let ingester: OutcomeIngester;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "outcome-ingest-"));
    store = new DecisionStore(path.join(tmpDir, "test.sqlite"));
    ingester = new OutcomeIngester(store);
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function basePayload(overrides: Partial<OutcomeIngestPayload> = {}): OutcomeIngestPayload {
    return {
      source: "test",
      external_id: "ext-1",
      lead_id: "source-barber",
      outcome_type: "pitch_closed",
      result: "positive",
      occurred_at: "2026-05-08T12:00:00.000Z",
      ...overrides,
    };
  }

  it("matches by lead_id tag and records outcomes for each decision", () => {
    // Two decisions tagged with lead_id:source-barber
    store.logDecision({
      agent_id: "site-composer-agent",
      run_id: "run-1",
      node_id: "compose",
      action: "generated demo",
      reasoning: "trust-blue palette suits barber heritage",
      alternatives: [],
      confidence: 0.8,
      inputs_summary: "barber lead",
      output_summary: "demo html",
      tags: ["lead_id:source-barber", "vertical:barber", "hero:trophy_bar"],
    });
    store.logDecision({
      agent_id: "brief-generator-agent",
      run_id: "run-1",
      node_id: "brief",
      action: "wrote brief",
      reasoning: "focus on review count",
      alternatives: [],
      confidence: 0.7,
      inputs_summary: "barber lead",
      output_summary: "brief json",
      tags: ["lead_id:source-barber", "vertical:barber"],
    });
    // A decision tagged with a different lead_id — should not match.
    store.logDecision({
      agent_id: "site-composer-agent",
      run_id: "run-2",
      node_id: "compose",
      action: "different demo",
      reasoning: "irrelevant",
      alternatives: [],
      confidence: 0.7,
      inputs_summary: "other lead",
      output_summary: "other html",
      tags: ["lead_id:other-shop", "vertical:cafe"],
    });

    const result = ingester.ingest(basePayload({ agreed_price_gbp: 350 }));

    assert.equal(result.matched_decisions, 2);
    assert.equal(result.match_strategy, "lead_id");
    assert.equal(result.matched_lead_id, "source-barber");
    assert.equal(result.skipped_reason, undefined);

    // Both barber decisions get an outcome row; the cafe one does not.
    const barberDecisions = store.listDecisionsByLeadId("source-barber");
    assert.equal(barberDecisions.length, 2);
    for (const d of barberDecisions) {
      const outcomes = store.listOutcomesForDecision(d.id);
      assert.equal(outcomes.length, 1);
      assert.equal(outcomes[0].result, "positive");
      assert.equal(outcomes[0].metric_value, 350);
      assert.equal(outcomes[0].metric_name, "agreed_price_gbp");
    }
    const cafeDecisions = store.listDecisionsByLeadId("other-shop");
    assert.equal(cafeDecisions.length, 1);
    assert.equal(store.listOutcomesForDecision(cafeDecisions[0].id).length, 0);
  });

  it("is idempotent — same external_id is a no-op on second ingest", () => {
    store.logDecision({
      agent_id: "site-composer-agent",
      run_id: "run-1",
      node_id: "compose",
      action: "generated demo",
      reasoning: "...",
      alternatives: [],
      confidence: 0.8,
      inputs_summary: "barber lead",
      output_summary: "demo html",
      tags: ["lead_id:source-barber"],
    });

    const first = ingester.ingest(basePayload());
    const second = ingester.ingest(basePayload());

    assert.equal(first.matched_decisions, 1);
    assert.equal(second.matched_decisions, 0);
    assert.equal(second.skipped_reason, "duplicate");

    const outcomes = store.listOutcomesForDecision(
      store.listDecisionsByLeadId("source-barber")[0].id,
    );
    assert.equal(outcomes.length, 1);
  });

  it("records ingest log row even when no decisions match", () => {
    const result = ingester.ingest(
      basePayload({ external_id: "ext-no-match", lead_id: "ghost-lead" }),
    );
    assert.equal(result.matched_decisions, 0);
    assert.equal(result.match_strategy, "none");
    assert.equal(result.skipped_reason, "no_match");

    const recent = ingester.listRecent(5);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].external_id, "ext-no-match");
    assert.equal(recent[0].matched_decisions, 0);
  });

  it("falls back to business_name + date matching when lead_id absent", () => {
    store.logDecision({
      agent_id: "manual-build-demo",
      run_id: "manual-source-barber-2026-05-01",
      node_id: "build",
      action: "manually built demo",
      reasoning: "summer beta",
      alternatives: [],
      confidence: 1.0,
      inputs_summary: "Source Barber storefront photos analysed",
      output_summary: "demo.html",
      // NB: no lead_id tag here — simulates an early manual decision before
      // tag conventions land.
      tags: ["agent:manual-build-demo"],
    });

    const result = ingester.ingest(
      basePayload({
        external_id: "ext-fallback",
        lead_id: undefined,
        business_name: "Source Barber",
        occurred_at: "2026-05-08T10:00:00.000Z",
      }),
    );

    assert.equal(result.match_strategy, "business_name_date");
    assert.equal(result.matched_decisions, 1);
  });

  it("HMAC signing and verification round-trip", () => {
    const secret = "test-secret";
    const payload = basePayload({ external_id: "ext-sign" });
    const body = canonicalBody(payload);
    const sig = signBody(body, secret);
    assert.ok(sig.startsWith("sha256="));
    assert.equal(verifySignature(body, sig, secret), true);
    assert.equal(verifySignature(body + "tampered", sig, secret), false);
    assert.equal(verifySignature(body, sig, "wrong-secret"), false);
    assert.equal(verifySignature(body, null, secret), false);
  });
});
