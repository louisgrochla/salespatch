import { createLogger } from "../lib/logger.js";
import type { EpisodicStore } from "../memory/episodicStore.js";
import type { Strategy, StrategicStore } from "../memory/strategicStore.js";

const log = createLogger("strategy-ranker");

export interface RankerOptions {
  /** Tag prefixes that identify a strategy. Defaults to (hero, palette, cta). */
  tagPrefixes?: string[];
  /** How far back to look. Defaults to 90 days. */
  lookbackDays?: number;
  /** Minimum sample size to bother creating a strategy row. */
  minSampleSize?: number;
}

export interface RankerResult {
  strategies_evaluated: number;
  promotions: Array<{ strategy_id: string; from: string; to: string }>;
  champions_by_vertical: Array<{ vertical: string; strategy_id: string; close_rate: number }>;
}

const DEFAULT_OPTIONS: Required<RankerOptions> = {
  tagPrefixes: ["hero:", "palette:", "cta:"],
  lookbackDays: 90,
  minSampleSize: 1,
};

/**
 * Wilson 95% confidence interval for a binomial proportion.
 * Returns [lower, upper]. p = closed / (closed + rejected).
 */
export function wilsonInterval(closed: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const p = closed / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const halfWidth =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denom;
  return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)];
}

/**
 * Nightly job: groups all settled (closed/rejected) episodes by their
 * (vertical, hero, palette, cta) and upserts a Strategy row with sample
 * size, close rate, Wilson CI. Promotes/deprecates per StrategicStore policy.
 *
 * Solo-founder reality: at n<20 per group, the lifecycle stays 'testing' or
 * 'new'. The ranker still runs — it surfaces candidates the founder can
 * promote manually via setStatus.
 */
export class StrategyRanker {
  private readonly opts: Required<RankerOptions>;

  constructor(
    private readonly episodicStore: EpisodicStore,
    private readonly strategicStore: StrategicStore,
    options: RankerOptions = {},
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  async runOnce(): Promise<RankerResult> {
    const sinceMs = Date.now() - this.opts.lookbackDays * 24 * 3_600_000;
    const recent = this.episodicStore
      .listRecent(2_000)
      .filter((e) => Date.parse(e.started_at) >= sinceMs)
      .filter((e) => e.pitch_outcome === "closed" || e.pitch_outcome === "rejected");

    // Group by (vertical, hero, palette, cta)
    const groups = new Map<
      string,
      {
        vertical: string;
        params: Record<string, string>;
        closed: number;
        rejected: number;
      }
    >();

    for (const ep of recent) {
      if (!ep.vertical) continue;
      const params: Record<string, string> = {};
      for (const prefix of this.opts.tagPrefixes) {
        const found = ep.pivot_tags.find((t) => t.startsWith(prefix));
        params[prefix.replace(/:$/, "")] = found ? found.slice(prefix.length) : "_";
      }
      const key = `${ep.vertical}::${JSON.stringify(params)}`;
      const cur = groups.get(key) ?? {
        vertical: ep.vertical,
        params,
        closed: 0,
        rejected: 0,
      };
      if (ep.pitch_outcome === "closed") cur.closed += 1;
      else cur.rejected += 1;
      groups.set(key, cur);
    }

    const promotions: RankerResult["promotions"] = [];
    const upserted: Strategy[] = [];

    for (const g of groups.values()) {
      const total = g.closed + g.rejected;
      if (total < this.opts.minSampleSize) continue;
      const closeRate = total > 0 ? g.closed / total : null;
      const [lower, upper] = wilsonInterval(g.closed, total);

      // Look up existing to detect promotion transitions
      const before = this.strategicStore
        .list({ vertical: g.vertical })
        .find((s) => deepEqualParams(s.parameters, g.params));

      const after = this.strategicStore.upsert({
        vertical: g.vertical,
        strategy_type: "design_combination",
        parameters: g.params,
        sample_size: total,
        close_rate: closeRate,
        confidence_lower: lower,
        confidence_upper: upper,
      });
      upserted.push(after);

      if (before && before.status !== after.status) {
        promotions.push({ strategy_id: after.id, from: before.status, to: after.status });
      }
    }

    // Champion-by-vertical: pick the highest close_rate strategy with sample >=5 per vertical.
    // Annotate (does NOT auto-promote unless lifecycle permits).
    const champions: RankerResult["champions_by_vertical"] = [];
    const verticals = new Set(upserted.map((s) => s.vertical));
    for (const v of verticals) {
      const candidates = upserted
        .filter((s) => s.vertical === v && s.sample_size >= 5 && s.close_rate != null)
        .sort((a, b) => (b.close_rate ?? 0) - (a.close_rate ?? 0));
      if (candidates.length > 0 && candidates[0].close_rate != null) {
        champions.push({
          vertical: v,
          strategy_id: candidates[0].id,
          close_rate: candidates[0].close_rate,
        });
      }
    }

    log.info("ranker run complete", {
      strategies_evaluated: upserted.length,
      promotions: promotions.length,
      champions: champions.length,
    });

    return {
      strategies_evaluated: upserted.length,
      promotions,
      champions_by_vertical: champions,
    };
  }
}

function deepEqualParams(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}
