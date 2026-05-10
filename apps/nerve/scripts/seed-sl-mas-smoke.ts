#!/usr/bin/env tsx
/**
 * Seed the SL-MAS Postgres tables with the bulk smoke fixture.
 * Idempotent — safe to re-run; existing rows are skipped via external_id.
 *
 *   cd apps/nerve
 *
 *   # Option A — pull env from Vercel:
 *   vercel env pull .env.local
 *   npx tsx scripts/seed-sl-mas-smoke.ts
 *
 *   # Option B — paste URLs directly (note the QUOTES):
 *   DATABASE_URL='postgresql://user:pass@ep-...neon.tech/db?sslmode=require' \
 *   DIRECT_URL='postgresql://user:pass@ep-...neon.tech/db?sslmode=require' \
 *     npx tsx scripts/seed-sl-mas-smoke.ts
 *
 * Mirrors scripts/sl-mas-smoke-bulk.ts on the runtime side. 10 leads, 8
 * pitched outcomes, 2 pending. Story: barber × trophy_bar × heritage_green
 * is the apparent champion at 3/3 (100%); cafe × service_strip × warm_neutral
 * underperforms at 0/1.
 */
// Load .env.local + .env so `vercel env pull` outputs work without dotenv-cli.
// Prisma's CLI loads these automatically; tsx scripts don't.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error(
    "[seed] DATABASE_URL is not set. Either:\n" +
      "  1. cd apps/nerve && vercel env pull .env.local && npx tsx scripts/seed-sl-mas-smoke.ts\n" +
      "  2. DATABASE_URL='postgresql://...' DIRECT_URL='postgresql://...' npx tsx scripts/seed-sl-mas-smoke.ts",
  );
  process.exit(1);
}
import { decisionStore } from "../src/lib/sl-mas/decisionStore";
import { episodicStore } from "../src/lib/sl-mas/episodicStore";
import { outcomeIngester } from "../src/lib/sl-mas/outcomeIngest";
import { runStrategyRankerOnce } from "../src/lib/sl-mas/strategyRanker";
import type { OutcomeIngestPayload } from "../src/lib/sl-mas/types";

interface Lead {
  slug: string;
  business_name: string;
  vertical: "barber" | "cafe" | "bakery" | "florist";
  hero: string;
  palette: string;
  cta: string;
  proof: string;
  brand_source: "scraped" | "vertical_default";
  outcome?: "closed" | "rejected";
  agreed_price_gbp?: number;
  reaction?: "loved" | "liked" | "neutral" | "unimpressed";
}

const LEADS: Lead[] = [
  { slug: "source-barber",      business_name: "Source Barber",        vertical: "barber",  hero: "trophy_bar",   palette: "heritage_green", cta: "book_now",  proof: "review_count", brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "loved" },
  { slug: "stoneham-cuts",      business_name: "Stoneham Cuts",        vertical: "barber",  hero: "trophy_bar",   palette: "heritage_green", cta: "book_now",  proof: "review_count", brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "loved" },
  { slug: "fountain-st-barber", business_name: "Fountain St Barber",   vertical: "barber",  hero: "trophy_bar",   palette: "heritage_green", cta: "book_now",  proof: "review_count", brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "liked" },
  { slug: "kent-fade",          business_name: "Kent Fade",            vertical: "barber",  hero: "team_grid",    palette: "trust_blue",     cta: "book_now",  proof: "team",         brand_source: "vertical_default", outcome: "rejected", reaction: "unimpressed" },
  { slug: "riverside-cafe",     business_name: "Riverside Cafe",       vertical: "cafe",    hero: "team_grid",    palette: "warm_neutral",   cta: "see_menu",  proof: "gallery",      brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "loved" },
  { slug: "glen-st-coffee",     business_name: "Glen St Coffee",       vertical: "cafe",    hero: "team_grid",    palette: "warm_neutral",   cta: "see_menu",  proof: "gallery",      brand_source: "scraped",          outcome: "rejected", reaction: "neutral" },
  { slug: "bridge-pantry",      business_name: "Bridge Pantry",        vertical: "cafe",    hero: "service_strip",palette: "warm_neutral",   cta: "see_menu",  proof: "review_count", brand_source: "vertical_default", outcome: "rejected", reaction: "unimpressed" },
  { slug: "ace-bakery",         business_name: "Ace Bakery",           vertical: "bakery",  hero: "service_strip",palette: "trust_blue",     cta: "see_menu",  proof: "review_count", brand_source: "scraped",          outcome: "closed",   agreed_price_gbp: 350, reaction: "loved" },
  { slug: "summerhill-bake",    business_name: "Summerhill Bakehouse", vertical: "bakery",  hero: "team_grid",    palette: "warm_neutral",   cta: "see_menu",  proof: "gallery",      brand_source: "scraped" },
  { slug: "marigold-florist",   business_name: "Marigold Florist",     vertical: "florist", hero: "product_grid", palette: "warm_neutral",   cta: "get_quote", proof: "gallery",      brand_source: "scraped" },
];

const PIVOT_PREFIXES = [
  "vertical:",
  "hero:",
  "palette:",
  "cta:",
  "proof:",
  "brand_source:",
];
function isPivotTag(t: string): boolean {
  return PIVOT_PREFIXES.some((p) => t.startsWith(p));
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const reset = process.argv.includes("--reset");

  if (reset) {
    console.log("[seed] --reset specified; truncating SL-MAS tables");
    const { prisma } = await import("../src/lib/db");
    // Order matters: outcomes references decisions
    await prisma.outcome.deleteMany();
    await prisma.outcomeIngestLog.deleteMany();
    await prisma.episode.deleteMany();
    await prisma.strategy.deleteMany();
    await prisma.decision.deleteMany();
    console.log("[seed] tables truncated");
  }

  console.log(`[seed] Inserting ${LEADS.length} manual /build-demo decisions`);
  const now = Date.now();
  const dayMs = 24 * 3_600_000;

  for (let i = 0; i < LEADS.length; i += 1) {
    const lead = LEADS[i];
    // Deterministic run_id so re-runs without --reset are idempotent.
    const runId = `seed-manual-${lead.slug}`;

    // Skip if already seeded (idempotency)
    const existingEpisode = await episodicStore.getByPipelineRun(runId);
    if (existingEpisode && !dryRun) {
      console.log(`  ${lead.slug.padEnd(22)} already seeded — skipping`);
      continue;
    }

    if (dryRun) {
      console.log(`  ${lead.slug.padEnd(22)} would seed (vertical=${lead.vertical}, hero=${lead.hero})`);
      continue;
    }

    const tags = [
      "agent:manual-build-demo",
      `lead_id:${lead.slug}`,
      "source:build-demo-skill",
      `vertical:${lead.vertical}`,
      `hero:${lead.hero}`,
      `palette:${lead.palette}`,
      `cta:${lead.cta}`,
      `proof:${lead.proof}`,
      `brand_source:${lead.brand_source}`,
    ];

    await episodicStore.start({
      pipeline_run_id: runId,
      pipeline_definition_id: "manual-build-demo",
      trigger: "seed",
    });

    await decisionStore.logDecision({
      agent_id: "manual-build-demo",
      run_id: runId,
      node_id: "manual-build",
      action: `manual demo built for ${lead.business_name}`,
      reasoning: `${lead.palette} palette + ${lead.hero} hero for a ${lead.vertical}`,
      alternatives: [],
      confidence: 1.0,
      inputs_summary: `business=${lead.business_name} vertical=${lead.vertical}`,
      output_summary: "single-file demo + brief",
      tags,
    });

    await episodicStore.completeRun(runId, {
      status: "completed",
      pivot_tags: tags.filter(isPivotTag),
      lead_id: lead.slug,
      vertical: lead.vertical,
      business_name: lead.business_name,
    });

    console.log(`  ${lead.slug.padEnd(22)} seeded → ${runId}`);
  }

  if (dryRun) {
    console.log("\n[seed] dry-run complete (no writes performed)");
    return;
  }

  console.log("\n[seed] Ingesting outcomes");
  let ingested = 0;
  let pending = 0;
  for (const lead of LEADS) {
    if (!lead.outcome) {
      pending += 1;
      continue;
    }
    const payload: OutcomeIngestPayload = {
      source: "test",
      external_id: `seed-${lead.slug}`,
      lead_id: lead.slug,
      outcome_type: lead.outcome === "closed" ? "pitch_closed" : "pitch_rejected",
      result: lead.outcome === "closed" ? "positive" : "negative",
      agreed_price_gbp: lead.agreed_price_gbp,
      demo_reaction: lead.reaction,
      occurred_at: new Date(now - dayMs * 2).toISOString(),
    };
    const r = await outcomeIngester.ingest(payload);
    if (r.skipped_reason !== "duplicate") ingested += 1;
    console.log(
      `  ${lead.slug.padEnd(22)} ${lead.outcome.padEnd(9)} matched=${r.matched_decisions} ${r.skipped_reason ?? ""}`,
    );
  }
  console.log(`[seed] ${ingested} outcomes ingested, ${pending} pending`);

  console.log("\n[seed] Running StrategyRanker once to populate strategies");
  const result = await runStrategyRankerOnce();
  console.log(
    `[seed]   strategies_evaluated=${result.strategies_evaluated} promotions=${result.promotions.length} champions=${result.champions_by_vertical.length}`,
  );

  console.log("\n✓ Seed complete. Visit /pipeline to verify.");
}

main()
  .catch((e) => {
    console.error("[seed] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
