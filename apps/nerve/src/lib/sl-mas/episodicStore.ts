import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { PivotResult, WorkingMemorySnapshot } from "./types";

export interface EpisodeRow {
  id: string;
  pipeline_run_id: string;
  pipeline_definition_id: string;
  trigger?: string;
  lead_id?: string;
  business_name?: string;
  vertical?: string;
  region?: string;
  started_at: string;
  ended_at?: string;
  status: "running" | "completed" | "failed" | "blocked" | "cancelled";
  total_cost_usd: number;
  reflection_iterations: number;
  agent_outputs_summary: Record<string, string>;
  critic_scores: Record<string, number>;
  working_memory_snapshot: Record<string, unknown>;
  strategies_used: string[];
  pivot_tags: string[];
  pitch_outcome?: "closed" | "rejected" | "follow_up" | "no_outcome";
  outcome_received_at?: string;
  close_amount_gbp?: number;
  days_to_outcome?: number;
  outcome_notes?: string;
  created_at: string;
}

/**
 * Per-run episode lifecycle. Mirrors src/memory/episodicStore.ts on the
 * runtime side. Methods are async; route handlers / page components
 * already call this with await.
 */
export const episodicStore = {
  async start(input: {
    pipeline_run_id: string;
    pipeline_definition_id: string;
    trigger?: string;
  }): Promise<EpisodeRow> {
    const row = await prisma.episode.create({
      data: {
        pipelineRunId: input.pipeline_run_id,
        pipelineDefinitionId: input.pipeline_definition_id,
        trigger: input.trigger ?? null,
        startedAt: new Date(),
        status: "running",
        agentOutputsSummary: {} as Prisma.InputJsonValue,
        criticScores: {} as Prisma.InputJsonValue,
        workingMemorySnapshot: {} as Prisma.InputJsonValue,
        strategiesUsed: [],
        pivotTags: [],
      },
    });
    return rowToEpisode(row);
  },

  async recordNodeScore(
    pipelineRunId: string,
    nodeId: string,
    score: number,
  ): Promise<void> {
    const ep = await prisma.episode.findUnique({
      where: { pipelineRunId },
      select: { id: true, criticScores: true },
    });
    if (!ep) return;
    const current = (ep.criticScores ?? {}) as Record<string, number>;
    await prisma.episode.update({
      where: { id: ep.id },
      data: {
        criticScores: { ...current, [nodeId]: score } as Prisma.InputJsonValue,
      },
    });
  },

  async recordAgentSummary(
    pipelineRunId: string,
    nodeId: string,
    summary: string,
  ): Promise<void> {
    const ep = await prisma.episode.findUnique({
      where: { pipelineRunId },
      select: { id: true, agentOutputsSummary: true },
    });
    if (!ep) return;
    const current = (ep.agentOutputsSummary ?? {}) as Record<string, string>;
    await prisma.episode.update({
      where: { id: ep.id },
      data: {
        agentOutputsSummary: {
          ...current,
          [nodeId]: summary,
        } as Prisma.InputJsonValue,
      },
    });
  },

  async incrementReflectionIterations(
    pipelineRunId: string,
    by = 1,
  ): Promise<void> {
    await prisma.episode.update({
      where: { pipelineRunId },
      data: { reflectionIterations: { increment: by } },
    });
  },

  async addCost(pipelineRunId: string, costUsd: number): Promise<void> {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return;
    await prisma.episode.update({
      where: { pipelineRunId },
      data: { totalCostUsd: { increment: costUsd } },
    });
  },

  async completeRun(
    pipelineRunId: string,
    summary: {
      status: EpisodeRow["status"];
      working_memory_snapshot?: WorkingMemorySnapshot | Record<string, unknown>;
      strategies_used?: string[];
      pivot_tags?: string[];
      lead_id?: string;
      business_name?: string;
      vertical?: string;
      region?: string;
    },
  ): Promise<EpisodeRow | null> {
    const ep = await prisma.episode.findUnique({ where: { pipelineRunId } });
    if (!ep) return null;
    const updated = await prisma.episode.update({
      where: { id: ep.id },
      data: {
        endedAt: new Date(),
        status: summary.status,
        ...(summary.working_memory_snapshot !== undefined
          ? {
              workingMemorySnapshot:
                summary.working_memory_snapshot as Prisma.InputJsonValue,
            }
          : {}),
        ...(summary.strategies_used !== undefined
          ? { strategiesUsed: summary.strategies_used }
          : {}),
        ...(summary.pivot_tags !== undefined
          ? { pivotTags: summary.pivot_tags }
          : {}),
        ...(summary.lead_id ? { leadId: summary.lead_id } : {}),
        ...(summary.business_name ? { businessName: summary.business_name } : {}),
        ...(summary.vertical ? { vertical: summary.vertical } : {}),
        ...(summary.region ? { region: summary.region } : {}),
      },
    });
    return rowToEpisode(updated);
  },

  async attachOutcome(
    pipelineRunId: string,
    outcome: {
      pitch_outcome: NonNullable<EpisodeRow["pitch_outcome"]>;
      close_amount_gbp?: number;
      outcome_notes?: string;
    },
  ): Promise<EpisodeRow | null> {
    const ep = await prisma.episode.findUnique({ where: { pipelineRunId } });
    if (!ep) return null;
    const now = new Date();
    const startedMs = ep.startedAt.getTime();
    const days = Number.isFinite(startedMs)
      ? (now.getTime() - startedMs) / (24 * 3_600_000)
      : null;
    const updated = await prisma.episode.update({
      where: { id: ep.id },
      data: {
        pitchOutcome: outcome.pitch_outcome,
        outcomeReceivedAt: now,
        closeAmountGbp: outcome.close_amount_gbp ?? null,
        daysToOutcome: days,
        ...(outcome.outcome_notes ? { outcomeNotes: outcome.outcome_notes } : {}),
      },
    });
    return rowToEpisode(updated);
  },

  async getByPipelineRun(pipelineRunId: string): Promise<EpisodeRow | null> {
    const row = await prisma.episode.findUnique({ where: { pipelineRunId } });
    return row ? rowToEpisode(row) : null;
  },

  async getByLeadId(leadId: string): Promise<EpisodeRow[]> {
    const rows = await prisma.episode.findMany({
      where: { leadId },
      orderBy: { startedAt: "desc" },
    });
    return rows.map(rowToEpisode);
  },

  async listRecent(limit = 20, vertical?: string): Promise<EpisodeRow[]> {
    const rows = await prisma.episode.findMany({
      where: vertical ? { vertical } : undefined,
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEpisode);
  },

  /**
   * Pivot table aggregator. Filters by tag list (each must be present in
   * pivot_tags), groups by tag prefixes, returns close-rate per group.
   * Postgres GIN index on pivot_tags makes filter cheap; grouping happens
   * in-memory because group keys are dynamic.
   */
  async pivotByTags(
    filterTags: string[],
    groupByTagPrefixes: string[],
  ): Promise<PivotResult[]> {
    const rows = await prisma.episode.findMany({
      where:
        filterTags.length > 0 ? { pivotTags: { hasEvery: filterTags } } : undefined,
      select: { pivotTags: true, pitchOutcome: true },
    });
    const groups = new Map<string, PivotResult>();
    for (const row of rows) {
      const tags = row.pivotTags;
      const key: Record<string, string> = {};
      for (const prefix of groupByTagPrefixes) {
        const found = tags.find((t) => t.startsWith(prefix));
        key[prefix.replace(/:$/, "")] = found ? found.slice(prefix.length) : "_";
      }
      const keyStr = JSON.stringify(key);
      const cur =
        groups.get(keyStr) ??
        ({
          group_key: key,
          sample_size: 0,
          closed: 0,
          rejected: 0,
          pending: 0,
          close_rate: 0,
        } satisfies PivotResult);
      cur.sample_size += 1;
      if (row.pitchOutcome === "closed") cur.closed += 1;
      else if (row.pitchOutcome === "rejected") cur.rejected += 1;
      else cur.pending += 1;
      cur.close_rate = cur.sample_size > 0 ? cur.closed / cur.sample_size : 0;
      groups.set(keyStr, cur);
    }
    return [...groups.values()].sort((a, b) => b.sample_size - a.sample_size);
  },
};

// ── Row mapper ──

type EpisodeDb = Awaited<ReturnType<typeof prisma.episode.findUnique>>;

function rowToEpisode(row: NonNullable<EpisodeDb>): EpisodeRow {
  return {
    id: row.id,
    pipeline_run_id: row.pipelineRunId,
    pipeline_definition_id: row.pipelineDefinitionId,
    trigger: row.trigger ?? undefined,
    lead_id: row.leadId ?? undefined,
    business_name: row.businessName ?? undefined,
    vertical: row.vertical ?? undefined,
    region: row.region ?? undefined,
    started_at: row.startedAt.toISOString(),
    ended_at: row.endedAt?.toISOString(),
    status: row.status as EpisodeRow["status"],
    total_cost_usd: row.totalCostUsd,
    reflection_iterations: row.reflectionIterations,
    agent_outputs_summary: row.agentOutputsSummary as Record<string, string>,
    critic_scores: row.criticScores as Record<string, number>,
    working_memory_snapshot: row.workingMemorySnapshot as Record<string, unknown>,
    strategies_used: row.strategiesUsed,
    pivot_tags: row.pivotTags,
    pitch_outcome: (row.pitchOutcome as EpisodeRow["pitch_outcome"]) ?? undefined,
    outcome_received_at: row.outcomeReceivedAt?.toISOString(),
    close_amount_gbp: row.closeAmountGbp ?? undefined,
    days_to_outcome: row.daysToOutcome ?? undefined,
    outcome_notes: row.outcomeNotes ?? undefined,
    created_at: row.createdAt.toISOString(),
  };
}
