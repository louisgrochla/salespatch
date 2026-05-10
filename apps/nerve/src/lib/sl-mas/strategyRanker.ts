import { episodicStore } from "./episodicStore";
import { strategicStore } from "./strategicStore";

export interface RankerOptions {
  tagPrefixes?: string[];
  lookbackDays?: number;
  minSampleSize?: number;
}

export interface RankerResult {
  strategies_evaluated: number;
  promotions: Array<{ strategy_id: string; from: string; to: string }>;
  champions_by_vertical: Array<{
    vertical: string;
    strategy_id: string;
    close_rate: number;
  }>;
}

const DEFAULT_OPTIONS: Required<RankerOptions> = {
  tagPrefixes: ["hero:", "palette:", "cta:"],
  lookbackDays: 90,
  minSampleSize: 1,
};

/** Wilson 95% CI for a binomial proportion. */
export function wilsonInterval(closed: number, total: number): [number, number] {
  if (total === 0) return [0, 0];
  const z = 1.96;
  const p = closed / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const halfWidth =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
    denom;
  return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)];
}

/**
 * Group settled episodes by (vertical, hero, palette, cta), upsert one
 * strategy row per group with sample size + close rate + Wilson CI.
 * Status transitions follow strategicStore lifecycle policy.
 *
 * Ported from src/evaluation/strategyRanker.ts.
 */
export async function runStrategyRankerOnce(
  options: RankerOptions = {},
): Promise<RankerResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sinceMs = Date.now() - opts.lookbackDays * 24 * 3_600_000;

  const recent = (await episodicStore.listRecent(2_000)).filter(
    (e) =>
      Date.parse(e.started_at) >= sinceMs &&
      (e.pitch_outcome === "closed" || e.pitch_outcome === "rejected"),
  );

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
    for (const prefix of opts.tagPrefixes) {
      const found = ep.pivot_tags.find((t) => t.startsWith(prefix));
      params[prefix.replace(/:$/, "")] = found ? found.slice(prefix.length) : "_";
    }
    const key = `${ep.vertical}::${JSON.stringify(params)}`;
    const cur =
      groups.get(key) ??
      { vertical: ep.vertical, params, closed: 0, rejected: 0 };
    if (ep.pitch_outcome === "closed") cur.closed += 1;
    else cur.rejected += 1;
    groups.set(key, cur);
  }

  const promotions: RankerResult["promotions"] = [];
  const upserted: Array<{
    id: string;
    vertical: string;
    sample_size: number;
    close_rate: number | null;
  }> = [];

  for (const g of groups.values()) {
    const total = g.closed + g.rejected;
    if (total < opts.minSampleSize) continue;
    const closeRate = total > 0 ? g.closed / total : null;
    const [lower, upper] = wilsonInterval(g.closed, total);

    // Look up before-state for promotion delta
    const before = (
      await strategicStore.list({ vertical: g.vertical })
    ).find((s) => deepEqualParams(s.parameters, g.params));

    const after = await strategicStore.upsert({
      vertical: g.vertical,
      strategy_type: "design_combination",
      parameters: g.params,
      sample_size: total,
      close_rate: closeRate,
      confidence_lower: lower,
      confidence_upper: upper,
    });
    upserted.push({
      id: after.id,
      vertical: after.vertical,
      sample_size: after.sample_size,
      close_rate: after.close_rate,
    });

    if (before && before.status !== after.status) {
      promotions.push({ strategy_id: after.id, from: before.status, to: after.status });
    }
  }

  // Champion-by-vertical annotation (not auto-promotion).
  const champions: RankerResult["champions_by_vertical"] = [];
  const verticals = new Set(upserted.map((s) => s.vertical));
  for (const v of verticals) {
    const candidates = upserted
      .filter(
        (s) => s.vertical === v && s.sample_size >= 5 && s.close_rate != null,
      )
      .sort((a, b) => (b.close_rate ?? 0) - (a.close_rate ?? 0));
    if (candidates.length > 0 && candidates[0].close_rate != null) {
      champions.push({
        vertical: v,
        strategy_id: candidates[0].id,
        close_rate: candidates[0].close_rate,
      });
    }
  }

  return {
    strategies_evaluated: upserted.length,
    promotions,
    champions_by_vertical: champions,
  };
}

function deepEqualParams(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}
