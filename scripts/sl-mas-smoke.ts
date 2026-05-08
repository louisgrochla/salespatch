#!/usr/bin/env tsx
/**
 * SL-MAS smoke test — exercises Phases 1-3 end-to-end without HTTP.
 *
 *   npx tsx scripts/sl-mas-smoke.ts
 *
 * Walks through:
 *   1. Two manual /build-demo decisions (Source Barber + Riverside Cafe)
 *   2. A pipeline-shaped per-lead decision (Ace Bakery)
 *   3. Three NERVE-shaped outcome ingests (closed / rejected / no-match)
 *   4. Episode roll-ups + Friday-style pivot table
 *
 * Writes to data/sl-mas-smoke.sqlite (deleted on start). Safe to run repeatedly.
 */
import { rmSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { DecisionStore } from "../src/learning/decisionStore.js";
import {
  OutcomeIngester,
  OutcomeIngestPayload,
} from "../src/learning/outcomeIngest.js";
import { EpisodicStore } from "../src/memory/episodicStore.js";
import { HeuristicCritic } from "../src/evaluation/heuristicCritic.js";

const DB_PATH = path.resolve("data/sl-mas-smoke.sqlite");

function header(s: string): void {
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  ${s}`);
  console.log("─".repeat(72));
}

function fmt(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

async function main(): Promise<void> {
  // 0. Reset DB
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  for (const ext of ["", "-shm", "-wal"]) {
    if (existsSync(DB_PATH + ext)) rmSync(DB_PATH + ext);
  }

  const store = new DecisionStore(DB_PATH);
  const episodes = new EpisodicStore(DB_PATH);
  const ingester = new OutcomeIngester(store, episodes);
  const critic = new HeuristicCritic();

  // ──────────────────────────────────────────────────────────────────
  header("STEP 1: Log two manual /build-demo decisions");
  // ──────────────────────────────────────────────────────────────────
  const sourceBarberRunId = `manual-source-barber-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const riversideCafeRunId = `manual-riverside-cafe-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  // Synthesise episodes for the manual runs (the HTTP endpoint does this in
  // real life; we mirror it here).
  episodes.start({ pipeline_run_id: sourceBarberRunId, pipeline_definition_id: "manual-build-demo", trigger: "manual" });
  episodes.start({ pipeline_run_id: riversideCafeRunId, pipeline_definition_id: "manual-build-demo", trigger: "manual" });

  store.logDecision({
    agent_id: "manual-build-demo",
    run_id: sourceBarberRunId,
    node_id: "manual-build",
    action: "manual demo built for Source Barber",
    reasoning: "heritage palette + 4.9★ × 312 reviews → trophy_bar hero",
    alternatives: [],
    confidence: 1.0,
    inputs_summary: "business=Source Barber vertical=barber",
    output_summary: "single-file demo + brief",
    tags: [
      "agent:manual-build-demo",
      "lead_id:source-barber",
      "source:build-demo-skill",
      "vertical:barber",
      "hero:trophy_bar",
      "palette:heritage_green",
      "cta:book_now",
      "proof:review_count",
      "fresha-embed",
    ],
  });

  store.logDecision({
    agent_id: "manual-build-demo",
    run_id: riversideCafeRunId,
    node_id: "manual-build",
    action: "manual demo built for Riverside Cafe",
    reasoning: "warm neutral palette suits brunch positioning",
    alternatives: [],
    confidence: 1.0,
    inputs_summary: "business=Riverside Cafe vertical=cafe",
    output_summary: "single-file demo + brief",
    tags: [
      "agent:manual-build-demo",
      "lead_id:riverside-cafe",
      "source:build-demo-skill",
      "vertical:cafe",
      "hero:team_grid",
      "palette:warm_neutral",
      "cta:see_menu",
      "proof:gallery",
    ],
  });

  console.log("Logged 2 manual decisions:");
  console.log(`  • source-barber:  ${sourceBarberRunId}`);
  console.log(`  • riverside-cafe: ${riversideCafeRunId}`);

  // ──────────────────────────────────────────────────────────────────
  header("STEP 2: Simulate a pipeline run for Ace Bakery (composer + qa)");
  // ──────────────────────────────────────────────────────────────────
  const aceRunId = "run-ace-bakery-001";
  episodes.start({
    pipeline_run_id: aceRunId,
    pipeline_definition_id: "site-generation-v1",
    trigger: "scheduler",
  });

  // Composer's per-lead decision (mirrors the _decisions plural that
  // siteComposerAgent emits in Phase 2).
  store.logDecision({
    agent_id: "site-composer-agent",
    run_id: aceRunId,
    node_id: "compose",
    action: "composed 1 site",
    reasoning: "trust_blue palette from scraped logo, hero=service_strip",
    alternatives: [],
    confidence: 0.85,
    inputs_summary: "upstream=[brief]",
    output_summary: "1 demo html",
    tags: [
      "agent:site-composer-agent",
      "lead_id:ace-bakery",
      "vertical:bakery",
      "hero:service_strip",
      "palette:trust_blue",
      "brand_source:scraped",
      "component_style:rounded",
      "section:gallery",
      "section:map",
    ],
  });

  // QA's per-lead decision
  store.logDecision({
    agent_id: "site-qa-agent",
    run_id: aceRunId,
    node_id: "qa",
    action: "QA passed",
    reasoning: "score 86, 0 errors, 1 warning",
    alternatives: [],
    confidence: 0.9,
    inputs_summary: "upstream=[compose]",
    output_summary: "1 result",
    tags: ["agent:site-qa-agent", "lead_id:ace-bakery", "qa_passed:true", "qa_score:86"],
  });

  // Run the critic against a fake site output to show the score path
  const criticEval = await critic.evaluate({
    agent_id: "site-composer-agent",
    output: {
      summary: "composed",
      artifacts: {
        sites: [
          {
            lead_id: "ace-bakery",
            business_name: "Ace Bakery",
            brief_used: true,
            brand_source: "scraped",
            has_reviews: true,
            has_gallery: true,
            has_map: true,
            html_output: `<!doctype html><html><head><title>Ace Bakery</title></head><body>
              <header><h1>Ace Bakery</h1><a href="tel:+441224000123">Call</a></header>
              <main>...</main></body></html>`,
            css_output: ":root{--primary:#3b6ea8}",
          },
        ],
      },
    },
    upstream: {},
  });
  episodes.recordNodeScore(aceRunId, "compose", criticEval.score);
  episodes.recordAgentSummary(aceRunId, "compose", "1 site composed (heuristic critic OK)");
  console.log(`Critic scored Ace Bakery composer output: ${criticEval.score.toFixed(2)} (${criticEval.prediction})`);
  console.log(`  strengths: ${criticEval.critique.strengths.slice(0, 3).join("; ")}`);

  // ──────────────────────────────────────────────────────────────────
  header("STEP 3: Finalise all three episodes (engine.completeEpisode equivalent)");
  // ──────────────────────────────────────────────────────────────────
  const PIVOT_PREFIXES = [
    "vertical:",
    "hero:",
    "palette:",
    "cta:",
    "proof:",
    "brand_source:",
    "category:",
    "qa_passed:",
    "section:",
    "component_style:",
    "font_pairing:",
  ];
  function derivePivotTags(allTags: string[]): string[] {
    const seen = new Set<string>();
    for (const t of allTags) {
      if (PIVOT_PREFIXES.some((p) => t.startsWith(p))) seen.add(t);
    }
    return [...seen];
  }
  for (const [runId, leadId, vertical, businessName] of [
    [sourceBarberRunId, "source-barber", "barber", "Source Barber"],
    [riversideCafeRunId, "riverside-cafe", "cafe", "Riverside Cafe"],
    [aceRunId, "ace-bakery", "bakery", "Ace Bakery"],
  ] as const) {
    const decisions = store.listDecisionsByRun(runId);
    const pivot = derivePivotTags(decisions.flatMap((d) => d.tags));
    episodes.completeRun(runId, {
      status: "completed",
      pivot_tags: pivot,
      lead_id: leadId,
      vertical,
      business_name: businessName,
    });
  }
  for (const ep of episodes.listRecent(5)) {
    console.log(`episode ${ep.lead_id?.padEnd(18)} pivot_tags=${fmt(ep.pivot_tags)}`);
  }

  // ──────────────────────────────────────────────────────────────────
  header("STEP 4: Ingest three NERVE-shaped outcomes");
  // ──────────────────────────────────────────────────────────────────
  const closedAtSourceBarber: OutcomeIngestPayload = {
    source: "nerve_webhook",
    external_id: "nerve-pitch-001",
    lead_id: "source-barber",
    outcome_type: "pitch_closed",
    result: "positive",
    agreed_price_gbp: 350,
    interest_level: "hot",
    demo_reaction: "loved",
    notes: "Owner said 'this is exactly what I want'",
    occurred_at: new Date().toISOString(),
    pitch_log_id: "nerve-pitch-001",
  };
  const rejectedAtRiverside: OutcomeIngestPayload = {
    source: "nerve_webhook",
    external_id: "nerve-pitch-002",
    lead_id: "riverside-cafe",
    outcome_type: "pitch_rejected",
    result: "negative",
    interest_level: "cold",
    demo_reaction: "unimpressed",
    objections: ["timing", "price"],
    occurred_at: new Date().toISOString(),
    pitch_log_id: "nerve-pitch-002",
  };
  const noMatch: OutcomeIngestPayload = {
    source: "supabase_poll",
    external_id: "supabase-99:rejected",
    lead_id: "ghost-lead-no-decision",
    outcome_type: "pitch_rejected",
    result: "negative",
    occurred_at: new Date().toISOString(),
    assignment_id: "supabase-99",
  };

  for (const [label, payload] of [
    ["closed", closedAtSourceBarber],
    ["rejected", rejectedAtRiverside],
    ["no-match", noMatch],
  ] as const) {
    const r = ingester.ingest(payload);
    console.log(
      `  ${label.padEnd(10)} matched_decisions=${r.matched_decisions} match_strategy=${r.match_strategy} skipped=${r.skipped_reason ?? "no"}`,
    );
  }

  // Replay the closed outcome to demonstrate idempotency
  const replay = ingester.ingest(closedAtSourceBarber);
  console.log(`\nReplay of nerve-pitch-001 → matched=${replay.matched_decisions} skipped=${replay.skipped_reason}`);

  // ──────────────────────────────────────────────────────────────────
  header("STEP 5: Inspect the resulting state");
  // ──────────────────────────────────────────────────────────────────
  const sourceDecisions = store.listDecisionsByLeadId("source-barber");
  console.log(`\nsource-barber decisions: ${sourceDecisions.length}`);
  for (const d of sourceDecisions) {
    const outcomes = store.listOutcomesForDecision(d.id);
    console.log(`  • ${d.agent_id} → outcomes: ${outcomes.map((o) => o.result).join(", ") || "(none)"}`);
  }

  const aceDecisions = store.listDecisionsByLeadId("ace-bakery");
  console.log(`\nace-bakery decisions (no pitch yet): ${aceDecisions.length}`);
  for (const d of aceDecisions) {
    const outcomes = store.listOutcomesForDecision(d.id);
    console.log(`  • ${d.agent_id} → outcomes: ${outcomes.length}`);
  }

  console.log("\nepisodes.listRecent:");
  for (const ep of episodes.listRecent(5)) {
    console.log(
      `  • ${ep.lead_id?.padEnd(18)} status=${ep.status.padEnd(10)} pitch_outcome=${ep.pitch_outcome ?? "(none)"}  close_amount_gbp=${ep.close_amount_gbp ?? "-"}  reflection_iters=${ep.reflection_iterations}`,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  header("STEP 6: Friday-dashboard pivot — close rate by (vertical, hero, palette)");
  // ──────────────────────────────────────────────────────────────────
  const pivot = episodes.pivotByTags([], ["vertical:", "hero:", "palette:"]);
  console.log(
    `\n${"vertical".padEnd(10)}${"hero".padEnd(15)}${"palette".padEnd(20)}n   closed  rejected  pending  close_rate`,
  );
  console.log("─".repeat(95));
  for (const row of pivot) {
    console.log(
      `${(row.group_key.vertical ?? "_").padEnd(10)}${(row.group_key.hero ?? "_").padEnd(15)}${(row.group_key.palette ?? "_").padEnd(20)}${String(row.sample_size).padEnd(4)}${String(row.closed).padEnd(8)}${String(row.rejected).padEnd(10)}${String(row.pending).padEnd(9)}${(row.close_rate * 100).toFixed(0)}%`,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  header("STEP 7: Inspect outcome_ingest_log (audit trail)");
  // ──────────────────────────────────────────────────────────────────
  for (const entry of ingester.listRecent(10)) {
    console.log(
      `  • ${entry.external_id.padEnd(28)} source=${entry.source.padEnd(15)} matched=${entry.matched_decisions}  episode_id=${entry.episode_id ?? "(none)"}`,
    );
  }

  console.log(`\n✓ Smoke complete. DB at ${DB_PATH}`);
  console.log(`  inspect: sqlite3 ${DB_PATH} "SELECT lead_id, pitch_outcome, close_amount_gbp FROM episodes;"`);

  store.close();
  episodes.close();
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
