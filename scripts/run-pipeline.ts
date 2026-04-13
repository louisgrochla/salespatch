#!/usr/bin/env npx tsx
/**
 * Simplified Pipeline Runner — replaces the DAG engine with plain async/await.
 *
 * Usage:
 *   npx tsx scripts/run-pipeline.ts --location "Aberdeen" --verticals "cafe,barber" --max 5
 *   npx tsx scripts/run-pipeline.ts --location "Manchester" --max 10
 *
 * Runs: scout → profile → brand-analyse → brand-intelligence → qualify → brief → compose → qa
 * Outputs: JSON + HTML files per lead in data/runs/{timestamp}/
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

// Agent imports
import { leadScoutAgent } from "../src/agents/outreach/leadScoutAgent.js";
import { leadProfilerAgent } from "../src/agents/outreach/leadProfilerAgent.js";
import { brandAnalyserAgent } from "../src/agents/outreach/brandAnalyser.js";
import { brandIntelligenceAgent } from "../src/agents/outreach/brandIntelligence.js";
import { leadQualifierAgent } from "../src/agents/outreach/leadQualifierAgent.js";
import { briefGeneratorAgent } from "../src/agents/outreach/briefGenerator.js";
import { siteComposerAgent } from "../src/agents/outreach/siteComposerAgent.js";
import { siteQaAgent } from "../src/agents/outreach/siteQaAgent.js";
import type { AgentExecutionInput } from "../src/pipeline/agentRuntime.js";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    location: { type: "string", default: "Manchester" },
    verticals: { type: "string", default: "" },
    max: { type: "string", default: "5" },
    "skip-compose": { type: "boolean", default: false },
    "run-id": { type: "string" },
  },
});

const location = args.location!;
const maxPerVertical = parseInt(args.max!);
const skipCompose = args["skip-compose"];
const runId = args["run-id"] ?? `run-${Date.now()}`;

const verticals = args.verticals
  ? args.verticals.split(",").map((v) => v.trim())
  : ["restaurant", "cafe", "barber", "salon", "bakery", "pub"];

// ---------------------------------------------------------------------------
// Output directory
// ---------------------------------------------------------------------------

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runDir = join("data/runs", timestamp);
mkdirSync(runDir, { recursive: true });

function save(name: string, data: unknown) {
  writeFileSync(join(runDir, name), JSON.stringify(data, null, 2));
}

function saveLeadFile(leadId: string, name: string, data: unknown) {
  const dir = join(runDir, leadId);
  mkdirSync(dir, { recursive: true });
  if (typeof data === "string") {
    writeFileSync(join(dir, name), data);
  } else {
    writeFileSync(join(dir, name), JSON.stringify(data, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Helper to call agents with the pipeline interface
// ---------------------------------------------------------------------------

function makeInput(
  nodeId: string,
  agentId: string,
  upstream: Record<string, unknown>,
  config?: Record<string, unknown>,
): AgentExecutionInput {
  return {
    run_id: runId,
    node_id: nodeId,
    agent_id: agentId as AgentExecutionInput["agent_id"],
    config,
    upstreamArtifacts: upstream,
  };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  console.log(`\n=== Pipeline Run: ${runId} ===`);
  console.log(`Location: ${location}`);
  console.log(`Verticals: ${verticals.join(", ")}`);
  console.log(`Max per vertical: ${maxPerVertical}`);
  console.log(`Output: ${runDir}\n`);

  // ── Step 1: Scout ──
  console.log("▶ [1/8] Scouting leads...");
  const scoutResult = await leadScoutAgent(
    makeInput("scout", "lead-scout-agent", {}, {
      verticals,
      location,
      max_results_per_vertical: maxPerVertical,
    }),
  );
  const scoutArtifacts = scoutResult.artifacts;
  const leadCount = (scoutArtifacts as { leads?: unknown[] }).leads?.length ?? 0;
  console.log(`  ✓ ${scoutResult.summary}`);
  save("01-scout.json", scoutArtifacts);

  if (leadCount === 0) {
    console.log("\n✗ No leads found. Check location and API key.");
    return;
  }

  // ── Step 2: Profile ──
  console.log("\n▶ [2/8] Profiling leads...");
  const profileResult = await leadProfilerAgent(
    makeInput("profile", "lead-profiler-agent", { scout: scoutArtifacts }),
  );
  console.log(`  ✓ ${profileResult.summary}`);
  save("02-profiles.json", profileResult.artifacts);

  // ── Step 3: Brand Analysis ──
  console.log("\n▶ [3/8] Analysing brands...");
  const brandResult = await brandAnalyserAgent(
    makeInput("brand-analyse", "brand-analyser-agent", {
      scout: scoutArtifacts,
      profile: profileResult.artifacts,
    }),
  );
  console.log(`  ✓ ${brandResult.summary}`);
  save("03-brand-analysis.json", brandResult.artifacts);

  // ── Step 4: Brand Intelligence (AI) ──
  console.log("\n▶ [4/8] Running brand intelligence...");
  const intelligenceResult = await brandIntelligenceAgent(
    makeInput("brand-intelligence", "brand-intelligence-agent", {
      profile: profileResult.artifacts,
      "brand-analyse": brandResult.artifacts,
    }),
  );
  console.log(`  ✓ ${intelligenceResult.summary}`);
  save("04-brand-intelligence.json", intelligenceResult.artifacts);

  // ── Step 5: Qualify ──
  console.log("\n▶ [5/8] Qualifying leads...");
  const qualifyResult = await leadQualifierAgent(
    makeInput("qualify", "lead-qualifier-agent", {
      profile: profileResult.artifacts,
      "brand-analyse": brandResult.artifacts,
      "brand-intelligence": intelligenceResult.artifacts,
    }),
  );
  console.log(`  ✓ ${qualifyResult.summary}`);
  save("05-qualified.json", qualifyResult.artifacts);

  const qualified = (qualifyResult.artifacts as { qualified?: unknown[] }).qualified ?? [];
  const rejected = (qualifyResult.artifacts as { rejected?: unknown[] }).rejected ?? [];

  save("05-rejected.json", rejected);

  if (qualified.length === 0) {
    console.log("\n✗ No leads qualified. Adjust scoring or try a different location.");
    return;
  }

  if (skipCompose) {
    console.log(`\n✓ Pipeline complete (scout → qualify). ${qualified.length} qualified leads.`);
    console.log(`  Output: ${runDir}`);
    return;
  }

  // ── Step 6: Brief ──
  console.log("\n▶ [6/8] Generating briefs...");
  const briefResult = await briefGeneratorAgent(
    makeInput("brief", "brief-generator-agent", {
      qualify: qualifyResult.artifacts,
      profile: profileResult.artifacts,
      "brand-analyse": brandResult.artifacts,
    }),
  );
  console.log(`  ✓ ${briefResult.summary}`);
  save("06-briefs.json", briefResult.artifacts);

  // ── Step 7: Compose ──
  console.log("\n▶ [7/8] Composing sites...");
  const composeResult = await siteComposerAgent(
    makeInput("compose", "site-composer-agent", {
      brief: briefResult.artifacts,
      qualify: qualifyResult.artifacts,
      "brand-analyse": brandResult.artifacts,
    }),
  );
  console.log(`  ✓ ${composeResult.summary}`);

  // Save individual sites
  const sites = (composeResult.artifacts as { sites?: Array<{ lead_id?: string; html?: string }> }).sites ?? [];
  for (const site of sites) {
    if (site.lead_id && site.html) {
      saveLeadFile(site.lead_id, "site.html", site.html);
      saveLeadFile(site.lead_id, "site-meta.json", { ...site, html: `[${site.html.length} chars]` });
    }
  }

  // ── Step 8: QA ──
  console.log("\n▶ [8/8] Running QA...");
  const qaResult = await siteQaAgent(
    makeInput("qa", "site-qa-agent", {
      compose: composeResult.artifacts,
    }),
  );
  console.log(`  ✓ ${qaResult.summary}`);
  save("08-qa.json", qaResult.artifacts);

  // ── Summary ──
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const totalCost = (composeResult.cost_usd ?? 0) + (intelligenceResult.cost_usd ?? 0);

  save("run-meta.json", {
    runId,
    location,
    verticals,
    maxPerVertical,
    leadCount,
    qualifiedCount: qualified.length,
    rejectedCount: rejected.length,
    sitesGenerated: sites.length,
    elapsedSeconds: parseFloat(elapsed),
    estimatedCostUsd: totalCost,
    timestamp: new Date().toISOString(),
  });

  console.log(`
╔════════════════════════════════════════════╗
║   Pipeline Complete                        ║
║                                            ║
║   Leads found:     ${String(leadCount).padEnd(23)}║
║   Qualified:       ${String(qualified.length).padEnd(23)}║
║   Rejected:        ${String(rejected.length).padEnd(23)}║
║   Sites generated: ${String(sites.length).padEnd(23)}║
║   Time:            ${(elapsed + "s").padEnd(23)}║
║   Est. cost:       $${totalCost.toFixed(4).padEnd(22)}║
║                                            ║
║   Output: ${runDir.padEnd(33)}║
╚════════════════════════════════════════════╝
`);
}

main().catch((err) => {
  console.error("\n✗ Pipeline failed:", err);
  process.exit(1);
});
