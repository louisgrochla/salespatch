#!/usr/bin/env tsx
/**
 * SL-MAS bulk smoke — simulate a realistic summer week of 10 pitches.
 *
 *   npx tsx scripts/sl-mas-smoke-bulk.ts
 *
 * Fixture story:
 *   You ran /build-demo for 10 UK local businesses. Friends pitched 8 of
 *   them. Outcomes are deliberately patterned so the pivot tells a story:
 *
 *   - Barbers prefer heritage_green + trophy_bar (3/3 closed)
 *   - Cafes prefer warm_neutral + team_grid (1/2 closed)
 *   - Bakeries are a coinflip (1/2)
 *   - 2 demos haven't been pitched yet (pending)
 *
 * Writes to data/sl-mas-smoke-bulk.sqlite (deleted on start).
 */
import { rmSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { DecisionStore } from "../src/learning/decisionStore.js";
import {
  OutcomeIngester,
  OutcomeIngestPayload,
} from "../src/learning/outcomeIngest.js";
import { EpisodicStore } from "../src/memory/episodicStore.js";
import { AttributionEngine } from "../src/evaluation/attributionEngine.js";

const DB_PATH = path.resolve("data/sl-mas-smoke-bulk.sqlite");

interface Lead {
  slug: string;
  business_name: string;
  vertical: "barber" | "cafe" | "bakery" | "florist";
  hero: string;
  palette: string;
  cta: string;
  proof: string;
  brand_source: "scraped" | "vertical_default";
  /** Outcome that arrives a few days after the demo. undefined = no pitch yet. */
  outcome?: "closed" | "rejected";
  agreed_price_gbp?: number;
  reaction?: "loved" | "liked" | "neutral" | "unimpressed";
}

const LEADS: Lead[] = [
  // ── Barbers — heritage_green + trophy_bar is the apparent champion ──
  { slug: "source-barber",      business_name: "Source Barber",      vertical: "barber",  hero: "trophy_bar",   palette: "heritage_green", cta: "book_now",  proof: "review_count", brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "loved" },
  { slug: "stoneham-cuts",      business_name: "Stoneham Cuts",      vertical: "barber",  hero: "trophy_bar",   palette: "heritage_green", cta: "book_now",  proof: "review_count", brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "loved" },
  { slug: "fountain-st-barber", business_name: "Fountain St Barber", vertical: "barber",  hero: "trophy_bar",   palette: "heritage_green", cta: "book_now",  proof: "review_count", brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "liked" },
  { slug: "kent-fade",          business_name: "Kent Fade",          vertical: "barber",  hero: "team_grid",    palette: "trust_blue",     cta: "book_now",  proof: "team",         brand_source: "vertical_default", outcome: "rejected", reaction: "unimpressed" },

  // ── Cafes — warm_neutral + team_grid wins, service_strip flops ──
  { slug: "riverside-cafe",     business_name: "Riverside Cafe",     vertical: "cafe",    hero: "team_grid",    palette: "warm_neutral",   cta: "see_menu",  proof: "gallery",      brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "loved" },
  { slug: "glen-st-coffee",     business_name: "Glen St Coffee",     vertical: "cafe",    hero: "team_grid",    palette: "warm_neutral",   cta: "see_menu",  proof: "gallery",      brand_source: "scraped",          outcome: "rejected", reaction: "neutral" },
  { slug: "bridge-pantry",      business_name: "Bridge Pantry",      vertical: "cafe",    hero: "service_strip",palette: "warm_neutral",   cta: "see_menu",  proof: "review_count", brand_source: "vertical_default", outcome: "rejected", reaction: "unimpressed" },

  // ── Bakeries — small sample, no clear pattern yet ──
  { slug: "ace-bakery",         business_name: "Ace Bakery",         vertical: "bakery",  hero: "service_strip",palette: "trust_blue",     cta: "see_menu",  proof: "review_count", brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "loved" },
  { slug: "summerhill-bake",    business_name: "Summerhill Bakehouse", vertical: "bakery", hero: "team_grid",   palette: "warm_neutral",   cta: "see_menu",  proof: "gallery",      brand_source: "scraped" },

  // ── Florist — built but not pitched yet ──
  { slug: "marigold-florist",   business_name: "Marigold Florist",   vertical: "florist",hero: "product_grid", palette: "warm_neutral",   cta: "get_quote", proof: "gallery",      brand_source: "scraped" },
];

const PIVOT_PREFIXES = [
  "vertical:", "hero:", "palette:", "cta:", "proof:",
  "brand_source:", "qa_passed:", "section:", "component_style:", "font_pairing:",
];
function derivePivotTags(allTags: string[]): string[] {
  const seen = new Set<string>();
  for (const t of allTags) {
    if (PIVOT_PREFIXES.some((p) => t.startsWith(p))) seen.add(t);
  }
  return [...seen];
}

function header(s: string): void {
  console.log(`\n${"━".repeat(86)}`);
  console.log(`  ${s}`);
  console.log("━".repeat(86));
}

async function main(): Promise<void> {
  // Reset DB
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  for (const ext of ["", "-shm", "-wal"]) {
    if (existsSync(DB_PATH + ext)) rmSync(DB_PATH + ext);
  }

  const store = new DecisionStore(DB_PATH);
  const episodes = new EpisodicStore(DB_PATH);
  const attribution = new AttributionEngine(store, episodes);
  const ingester = new OutcomeIngester(store, episodes, attribution);

  // ──────────────────────────────────────────────────────────────────
  header("STEP 1: Log 10 manual /build-demo decisions");
  // ──────────────────────────────────────────────────────────────────
  // Spread timestamps across 7 days so the pivot's days_to_outcome is realistic.
  const now = Date.now();
  const dayMs = 24 * 3_600_000;

  for (let i = 0; i < LEADS.length; i += 1) {
    const lead = LEADS[i];
    const builtAt = new Date(now - (10 - i) * dayMs).toISOString();
    const runId = `manual-${lead.slug}-${builtAt.replace(/[:.]/g, "-")}`;

    episodes.start({
      pipeline_run_id: runId,
      pipeline_definition_id: "manual-build-demo",
      trigger: "manual",
    });

    store.logDecision({
      agent_id: "manual-build-demo",
      run_id: runId,
      node_id: "manual-build",
      action: `manual demo built for ${lead.business_name}`,
      reasoning: `${lead.palette} palette + ${lead.hero} hero for a ${lead.vertical}`,
      alternatives: [],
      confidence: 1.0,
      inputs_summary: `business=${lead.business_name} vertical=${lead.vertical}`,
      output_summary: "single-file demo + brief",
      tags: [
        "agent:manual-build-demo",
        `lead_id:${lead.slug}`,
        "source:build-demo-skill",
        `vertical:${lead.vertical}`,
        `hero:${lead.hero}`,
        `palette:${lead.palette}`,
        `cta:${lead.cta}`,
        `proof:${lead.proof}`,
        `brand_source:${lead.brand_source}`,
      ],
    });

    // Finalise the manual episode
    const decisions = store.listDecisionsByRun(runId);
    const pivotTags = derivePivotTags(decisions.flatMap((d) => d.tags));
    episodes.completeRun(runId, {
      status: "completed",
      pivot_tags: pivotTags,
      lead_id: lead.slug,
      vertical: lead.vertical,
      business_name: lead.business_name,
    });
  }
  console.log(`Logged ${LEADS.length} demo-build decisions across ~10 days.`);

  // ──────────────────────────────────────────────────────────────────
  header("STEP 2: Ingest pitch outcomes (NERVE-shaped)");
  // ──────────────────────────────────────────────────────────────────
  let ingested = 0;
  let skipped = 0;
  for (const lead of LEADS) {
    if (!lead.outcome) {
      skipped += 1;
      continue;
    }
    const payload: OutcomeIngestPayload = {
      source: "nerve_webhook",
      external_id: `nerve-${lead.slug}`,
      lead_id: lead.slug,
      outcome_type: lead.outcome === "closed" ? "pitch_closed" : "pitch_rejected",
      result: lead.outcome === "closed" ? "positive" : "negative",
      agreed_price_gbp: lead.agreed_price_gbp,
      demo_reaction: lead.reaction,
      occurred_at: new Date(now - dayMs * 2).toISOString(),
      pitch_log_id: `nerve-${lead.slug}`,
    };
    const r = await ingester.ingest(payload);
    ingested += 1;
    console.log(
      `  ${lead.slug.padEnd(22)} ${lead.outcome.padEnd(9)} ${lead.reaction?.padEnd(11) ?? "-"} matched=${r.matched_decisions}`,
    );
  }
  console.log(`\nTotal: ${ingested} ingested, ${skipped} pending (no pitch yet).`);

  // ──────────────────────────────────────────────────────────────────
  header("STEP 3: All 10 episodes");
  // ──────────────────────────────────────────────────────────────────
  const all = episodes.listRecent(20);
  console.log(`${"lead".padEnd(24)}${"vertical".padEnd(10)}${"outcome".padEnd(12)}${"price".padEnd(8)}days`);
  console.log("─".repeat(60));
  for (const ep of all) {
    console.log(
      `${(ep.lead_id ?? "_").padEnd(24)}${(ep.vertical ?? "_").padEnd(10)}${(ep.pitch_outcome ?? "(pending)").padEnd(12)}${ep.close_amount_gbp != null ? `£${ep.close_amount_gbp}`.padEnd(8) : "-".padEnd(8)}${ep.days_to_outcome != null ? ep.days_to_outcome.toFixed(1) : "-"}`,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  header("STEP 4: FRIDAY DASHBOARD — pivot by (vertical, hero, palette)");
  // ──────────────────────────────────────────────────────────────────
  const pivot = episodes.pivotByTags([], ["vertical:", "hero:", "palette:"]);
  console.log(
    `\n${"vertical".padEnd(10)}${"hero".padEnd(15)}${"palette".padEnd(20)}${"n".padEnd(4)}${"won".padEnd(6)}${"lost".padEnd(6)}${"pend".padEnd(6)}rate`,
  );
  console.log("─".repeat(72));
  for (const row of pivot) {
    const ratePct = (row.close_rate * 100).toFixed(0) + "%";
    console.log(
      `${(row.group_key.vertical ?? "_").padEnd(10)}${(row.group_key.hero ?? "_").padEnd(15)}${(row.group_key.palette ?? "_").padEnd(20)}${String(row.sample_size).padEnd(4)}${String(row.closed).padEnd(6)}${String(row.rejected).padEnd(6)}${String(row.pending).padEnd(6)}${ratePct}`,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  header("STEP 5: SECONDARY PIVOT — vertical-level summary");
  // ──────────────────────────────────────────────────────────────────
  const verticalPivot = episodes.pivotByTags([], ["vertical:"]);
  console.log(
    `\n${"vertical".padEnd(12)}${"n".padEnd(4)}${"won".padEnd(6)}${"lost".padEnd(6)}${"pend".padEnd(6)}rate`,
  );
  console.log("─".repeat(40));
  for (const row of verticalPivot.sort((a, b) => b.close_rate - a.close_rate)) {
    const ratePct = (row.close_rate * 100).toFixed(0) + "%";
    console.log(
      `${(row.group_key.vertical ?? "_").padEnd(12)}${String(row.sample_size).padEnd(4)}${String(row.closed).padEnd(6)}${String(row.rejected).padEnd(6)}${String(row.pending).padEnd(6)}${ratePct}`,
    );
  }

  // ──────────────────────────────────────────────────────────────────
  header("STEP 6: WHAT THE FOUNDER SEES — interpretive read");
  // ──────────────────────────────────────────────────────────────────
  const totalPitched = pivot.reduce((s, r) => s + r.closed + r.rejected, 0);
  const totalClosed = pivot.reduce((s, r) => s + r.closed, 0);
  const overall = totalPitched > 0 ? (totalClosed / totalPitched) * 100 : 0;
  const totalRevenue = LEADS.reduce(
    (s, l) => s + (l.outcome === "closed" ? (l.agreed_price_gbp ?? 0) : 0),
    0,
  );

  console.log(`\n  • Overall close rate (pitched leads only): ${overall.toFixed(0)}% — ${totalClosed}/${totalPitched}`);
  console.log(`  • Revenue from this batch:                 £${totalRevenue}`);
  console.log(`  • Best-performing combo so far:            barber × trophy_bar × heritage_green (3/3, 100%)`);
  console.log(`  • Underperformer:                          cafe × service_strip × warm_neutral (0/1, 0%)`);
  console.log(`  • Pending pitches (awaiting outcome):       ${LEADS.filter((l) => !l.outcome).length}`);
  console.log(`\n  At n=8 pitched, every cell is statistical noise — but you can already see`);
  console.log(`  that scraped brand sources outperform vertical_default, and the heritage_green`);
  console.log(`  palette has 3/3 closes. That's the kind of read this dashboard exists for.`);

  // ──────────────────────────────────────────────────────────────────
  header("STEP 7: ATTRIBUTION ROLLUP — per-agent credit/blame");
  // ──────────────────────────────────────────────────────────────────
  // We added critic scores for two of the closed pitches so the attribution
  // weights aren't all 0.5 — illustrates how high-scoring agents on closes
  // accrue more credit than untraced ones.
  for (const [runId, score] of [
    [`manual-source-barber-${new Date(now - 9 * dayMs).toISOString().replace(/[:.]/g, "-")}`, 0.92],
    [`manual-stoneham-cuts-${new Date(now - 8 * dayMs).toISOString().replace(/[:.]/g, "-")}`, 0.81],
    [`manual-kent-fade-${new Date(now - 5 * dayMs).toISOString().replace(/[:.]/g, "-")}`, 0.85], // overconfident on a rejected
  ] as const) {
    const ep = episodes.listRecent(50).find((e) => e.pipeline_run_id === runId);
    if (ep) episodes.recordNodeScore(runId, "manual-build", score);
  }
  // Re-run attribution now that scores landed
  await attribution.attributePending();
  const rollup = attribution.rollupByAgent();
  console.log(`\n${"agent".padEnd(28)}${"n".padEnd(4)}${"avg_weight".padEnd(12)}${"won".padEnd(5)}lost`);
  console.log("─".repeat(60));
  for (const r of rollup) {
    console.log(
      `${r.agent_id.padEnd(28)}${String(r.n).padEnd(4)}${r.avg_weight.toFixed(2).padEnd(12)}${String(r.positive_count).padEnd(5)}${r.negative_count}`,
    );
  }

  console.log(`\n✓ Bulk smoke complete. DB at ${DB_PATH}`);
  console.log(`  inspect: sqlite3 ${DB_PATH}`);

  store.close();
  episodes.close();
}

main().catch((e) => {
  console.error("bulk smoke failed:", e);
  process.exit(1);
});
