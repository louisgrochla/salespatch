import { IncomingMessage, ServerResponse } from "node:http";
import type { EpisodicStore } from "../../memory/episodicStore.js";
import type { StrategicStore, StrategyStatus } from "../../memory/strategicStore.js";

interface RouteDeps {
  episodicStore: EpisodicStore;
  strategicStore?: StrategicStore;
}

const ALLOWED_GROUP_PREFIXES = new Set([
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
]);

export async function handleEpisodesRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  deps: RouteDeps,
): Promise<boolean> {
  const method = req.method ?? "GET";

  if (method === "GET" && url.pathname === "/api/episodes/pivot") {
    const filters = parseFilters(url);
    const groupBy = parseGroupBy(url);
    const pivot = deps.episodicStore.pivotByTags(filters, groupBy);
    sendJson(res, 200, {
      filters,
      group_by: groupBy,
      count: pivot.length,
      rows: pivot,
    });
    return true;
  }

  if (method === "GET" && url.pathname === "/api/episodes/recent") {
    const limitParam = Number(url.searchParams.get("limit") ?? "20");
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 20;
    const all = deps.episodicStore.listRecent(limit);

    // Optional vertical filter
    const vertical = url.searchParams.get("vertical");
    const filtered = vertical ? all.filter((ep) => ep.vertical === vertical) : all;

    sendJson(res, 200, {
      count: filtered.length,
      episodes: filtered.map((ep) => ({
        id: ep.id,
        pipeline_run_id: ep.pipeline_run_id,
        lead_id: ep.lead_id,
        business_name: ep.business_name,
        vertical: ep.vertical,
        status: ep.status,
        pitch_outcome: ep.pitch_outcome,
        close_amount_gbp: ep.close_amount_gbp,
        days_to_outcome: ep.days_to_outcome,
        pivot_tags: ep.pivot_tags,
        critic_scores: ep.critic_scores,
        reflection_iterations: ep.reflection_iterations,
        started_at: ep.started_at,
        ended_at: ep.ended_at,
      })),
    });
    return true;
  }

  if (method === "GET" && url.pathname === "/api/strategies") {
    if (!deps.strategicStore) {
      sendJson(res, 503, { error: "strategic store unavailable" });
      return true;
    }
    const vertical = url.searchParams.get("vertical") ?? undefined;
    const status = url.searchParams.get("status") as StrategyStatus | null;
    const list = deps.strategicStore.list({
      vertical,
      status:
        status === "new" ||
        status === "testing" ||
        status === "active" ||
        status === "champion" ||
        status === "deprecated"
          ? status
          : undefined,
    });
    sendJson(res, 200, { count: list.length, strategies: list });
    return true;
  }

  return false;
}

// ── Helpers ──

function parseFilters(url: URL): string[] {
  const raw = url.searchParams.getAll("filter");
  // Also accept `?vertical=barber` as shorthand for `filter=vertical:barber`.
  const vertical = url.searchParams.get("vertical");
  const filters = raw.filter((f) =>
    [...ALLOWED_GROUP_PREFIXES].some((p) => f.startsWith(p)),
  );
  if (vertical) filters.push(`vertical:${vertical}`);
  return filters;
}

function parseGroupBy(url: URL): string[] {
  const raw = url.searchParams.get("group_by");
  if (!raw) return ["vertical:", "hero:", "palette:"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((s) => (s.endsWith(":") ? s : `${s}:`))
    .filter((s) => ALLOWED_GROUP_PREFIXES.has(s));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
