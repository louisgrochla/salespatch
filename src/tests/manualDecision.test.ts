import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import { DecisionStore } from "../learning/decisionStore.js";
import {
  handleDecisionsRoute,
  ManualDecisionBody,
} from "../missionControl/routes/decisions.js";

// ── Tiny HTTP harness — direct invocation rather than a real server ──

function fakeReq(method: string, path: string, body?: unknown): IncomingMessage {
  const raw = body == null ? "" : JSON.stringify(body);
  const stream = Readable.from(raw ? [Buffer.from(raw)] : []);
  const req = stream as unknown as IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = path;
  req.headers = { "content-type": "application/json" };
  return req;
}

interface CapturedResponse {
  status: number;
  body: string;
}

function fakeRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: "" };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string") captured.body += chunk;
      else if (Buffer.isBuffer(chunk)) captured.body += chunk.toString("utf8");
      return this;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

describe("Manual decisions route", () => {
  let tmpDir: string;
  let store: DecisionStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "manual-decision-"));
    store = new DecisionStore(path.join(tmpDir, "test.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("logs a manual decision with structured pivot tags", async () => {
    const body: ManualDecisionBody = {
      source: "build-demo-skill",
      agent_id: "manual-build-demo",
      lead_id: "source-barber",
      business_name: "Source Barber",
      vertical: "barber",
      design_decisions: {
        hero_variant: "trophy_bar",
        palette_family: "heritage_green",
        primary_hex: "#2C5F45",
        cta_pattern: "book_now",
        proof_emphasis: "review_count",
        custom_tags: ["fresha-embed"],
      },
      reasoning: "Heritage palette for stone storefront",
    };
    const req = fakeReq("POST", "/api/decisions/manual", body);
    const { res, captured } = fakeRes();
    const url = new URL("http://localhost/api/decisions/manual");

    const handled = await handleDecisionsRoute(req, res, url, { decisionStore: store });

    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    const result = JSON.parse(captured.body) as {
      decision_id: string;
      run_id: string;
      tags: string[];
    };

    assert.ok(result.decision_id, "decision_id returned");
    assert.match(result.run_id, /^manual-source-barber-/);
    assert.deepEqual(
      new Set(result.tags),
      new Set([
        "agent:manual-build-demo",
        "lead_id:source-barber",
        "source:build-demo-skill",
        "vertical:barber",
        "hero:trophy_bar",
        "palette:heritage_green",
        "cta:book_now",
        "proof:review_count",
        "fresha-embed",
      ]),
    );

    // The decision is queryable by lead_id.
    const byLead = store.listDecisionsByLeadId("source-barber");
    assert.equal(byLead.length, 1);
    assert.equal(byLead[0].action, "manual demo built for Source Barber");
    assert.equal(byLead[0].confidence, 1.0);
  });

  it("each rebuild is a new decision (timestamped run_id)", async () => {
    const body: ManualDecisionBody = {
      source: "build-demo-skill",
      agent_id: "manual-build-demo",
      lead_id: "source-barber",
      business_name: "Source Barber",
      design_decisions: { hero_variant: "trophy_bar" },
    };
    const url = new URL("http://localhost/api/decisions/manual");

    const r1 = fakeRes();
    await handleDecisionsRoute(fakeReq("POST", "/api/decisions/manual", body), r1.res, url, {
      decisionStore: store,
    });
    // small delay so ISO strings differ
    await new Promise((r) => setTimeout(r, 5));
    const r2 = fakeRes();
    await handleDecisionsRoute(fakeReq("POST", "/api/decisions/manual", body), r2.res, url, {
      decisionStore: store,
    });

    const out1 = JSON.parse(r1.captured.body) as { run_id: string; decision_id: string };
    const out2 = JSON.parse(r2.captured.body) as { run_id: string; decision_id: string };
    assert.notEqual(out1.run_id, out2.run_id);
    assert.notEqual(out1.decision_id, out2.decision_id);
    assert.equal(store.listDecisionsByLeadId("source-barber").length, 2);
  });

  it("rejects bodies missing required fields", async () => {
    const url = new URL("http://localhost/api/decisions/manual");
    const { res, captured } = fakeRes();
    await handleDecisionsRoute(
      fakeReq("POST", "/api/decisions/manual", { source: "x" }),
      res,
      url,
      { decisionStore: store },
    );
    assert.equal(captured.status, 400);
  });

  it("GET /api/decisions/by-lead returns decisions for that lead", async () => {
    store.logDecision({
      agent_id: "site-composer-agent",
      run_id: "run-1",
      node_id: "compose",
      action: "composed",
      reasoning: "auto",
      alternatives: [],
      confidence: 0.8,
      inputs_summary: "x",
      output_summary: "y",
      tags: ["lead_id:source-barber", "hero:trophy_bar"],
    });

    const url = new URL("http://localhost/api/decisions/by-lead?lead_id=source-barber");
    const { res, captured } = fakeRes();
    const handled = await handleDecisionsRoute(
      fakeReq("GET", url.pathname + url.search),
      res,
      url,
      { decisionStore: store },
    );
    assert.equal(handled, true);
    assert.equal(captured.status, 200);
    const out = JSON.parse(captured.body) as { count: number; decisions: Array<{ id: string }> };
    assert.equal(out.count, 1);
  });
});
