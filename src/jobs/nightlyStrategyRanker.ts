#!/usr/bin/env tsx
/**
 * Nightly StrategyRanker job.
 *
 *   tsx src/jobs/nightlyStrategyRanker.ts          # one-shot
 *   tsx src/jobs/nightlyStrategyRanker.ts --watch  # interval mode
 *
 * In production this is wired to the runtime's PipelineScheduler at 03:00
 * local. The script form is for ops on-demand and CI smoke.
 */
import { EpisodicStore } from "../memory/episodicStore.js";
import { StrategicStore } from "../memory/strategicStore.js";
import { StrategyRanker } from "../evaluation/strategyRanker.js";

async function main(): Promise<void> {
  const dbPath = process.env.DB_PATH ?? "data/mvp.sqlite";
  const episodes = new EpisodicStore(dbPath);
  const strategies = new StrategicStore(dbPath);
  const ranker = new StrategyRanker(episodes, strategies);

  const result = await ranker.runOnce();
  console.log(JSON.stringify(result, null, 2));

  episodes.close();
  strategies.close();
}

main().catch((e) => {
  console.error("strategy ranker failed:", e);
  process.exit(1);
});
