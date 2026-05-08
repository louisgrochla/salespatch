import { unstable_cache } from "next/cache";

// ── Types mirrored from src/missionControl/routes/episodes.ts ──

export interface PivotRow {
  group_key: Record<string, string>;
  sample_size: number;
  closed: number;
  rejected: number;
  pending: number;
  close_rate: number;
}

export interface PivotResponse {
  filters: string[];
  group_by: string[];
  count: number;
  rows: PivotRow[];
}

export interface EpisodeSummary {
  id: string;
  pipeline_run_id: string;
  lead_id?: string;
  business_name?: string;
  vertical?: string;
  status: string;
  pitch_outcome?: "closed" | "rejected" | "follow_up" | "no_outcome";
  close_amount_gbp?: number;
  days_to_outcome?: number;
  pivot_tags: string[];
  critic_scores: Record<string, number>;
  reflection_iterations: number;
  started_at: string;
  ended_at?: string;
}

export interface EpisodesResponse {
  count: number;
  episodes: EpisodeSummary[];
}

export interface Strategy {
  id: string;
  vertical: string;
  region?: string;
  strategy_type: string;
  parameters: Record<string, string>;
  sample_size: number;
  close_rate: number | null;
  confidence_lower: number | null;
  confidence_upper: number | null;
  status: "new" | "testing" | "active" | "champion" | "deprecated";
  last_evaluated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StrategiesResponse {
  count: number;
  strategies: Strategy[];
}

// ── Configuration ──

const RUNTIME_URL = process.env.RUNTIME_URL ?? process.env.PI_RUNTIME_URL ?? "";
const RUNTIME_TOKEN = process.env.MISSION_CONTROL_API_TOKEN ?? "";
const FETCH_TIMEOUT_MS = 4_000;
const CACHE_TTL_SECONDS = 60;

interface RuntimeStatus {
  configured: boolean;
  reachable: boolean;
  error?: string;
}

// ── Internal fetch wrapper ──

async function fetchRuntime<T>(path: string): Promise<T> {
  if (!RUNTIME_URL) {
    throw new Error("RUNTIME_URL not configured");
  }
  const url = `${RUNTIME_URL.replace(/\/$/, "")}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: RUNTIME_TOKEN ? { Authorization: `Bearer ${RUNTIME_TOKEN}` } : {},
      signal: controller.signal,
      // Disable Next.js per-request fetch cache; we wrap with unstable_cache
      // on the caller side so we control the cache key.
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`runtime ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ── Cached fetchers ──

/**
 * Cached pivot fetch. Cache key is the query string, so different
 * filter/group-by combinations cache separately.
 */
export async function getPivot(params: {
  vertical?: string;
  group_by?: string[];
  filter?: string[];
}): Promise<PivotResponse> {
  const qs = new URLSearchParams();
  if (params.vertical) qs.set("vertical", params.vertical);
  if (params.group_by && params.group_by.length > 0) {
    qs.set("group_by", params.group_by.join(","));
  }
  if (params.filter) {
    for (const f of params.filter) qs.append("filter", f);
  }
  const key = `runtime:pivot:${qs.toString()}`;
  const cached = unstable_cache(
    async () => fetchRuntime<PivotResponse>(`/api/episodes/pivot?${qs.toString()}`),
    [key],
    { revalidate: CACHE_TTL_SECONDS, tags: ["runtime", "runtime:episodes"] },
  );
  return cached();
}

export async function getRecentEpisodes(params: {
  limit?: number;
  vertical?: string;
} = {}): Promise<EpisodesResponse> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 50));
  if (params.vertical) qs.set("vertical", params.vertical);
  const key = `runtime:episodes:${qs.toString()}`;
  const cached = unstable_cache(
    async () => fetchRuntime<EpisodesResponse>(`/api/episodes/recent?${qs.toString()}`),
    [key],
    { revalidate: CACHE_TTL_SECONDS, tags: ["runtime", "runtime:episodes"] },
  );
  return cached();
}

export async function getStrategies(params: {
  vertical?: string;
  status?: Strategy["status"];
} = {}): Promise<StrategiesResponse> {
  const qs = new URLSearchParams();
  if (params.vertical) qs.set("vertical", params.vertical);
  if (params.status) qs.set("status", params.status);
  const key = `runtime:strategies:${qs.toString()}`;
  const cached = unstable_cache(
    async () => fetchRuntime<StrategiesResponse>(`/api/strategies?${qs.toString()}`),
    [key],
    { revalidate: CACHE_TTL_SECONDS, tags: ["runtime", "runtime:strategies"] },
  );
  return cached();
}

/**
 * Probe the runtime once per minute. Used by the page shell to render a
 * connection-status banner instead of crashing if the Pi is offline.
 */
export const getRuntimeStatus = unstable_cache(
  async (): Promise<RuntimeStatus> => {
    if (!RUNTIME_URL) {
      return { configured: false, reachable: false, error: "RUNTIME_URL not set" };
    }
    try {
      const res = await fetch(`${RUNTIME_URL.replace(/\/$/, "")}/api/health`, {
        signal: AbortSignal.timeout(2_000),
        cache: "no-store",
      });
      if (!res.ok) {
        return { configured: true, reachable: false, error: `health ${res.status}` };
      }
      return { configured: true, reachable: true };
    } catch (e) {
      return { configured: true, reachable: false, error: String(e) };
    }
  },
  ["runtime:health"],
  { revalidate: 60, tags: ["runtime"] },
);

/** Tolerant wrapper — never throws, returns null + error on failure. */
export async function safe<T>(
  fetcher: () => Promise<T>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await fetcher(), error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}
