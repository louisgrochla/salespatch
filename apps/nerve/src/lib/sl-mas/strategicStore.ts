import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { StrategyStatus } from "./types";

export interface StrategyRow {
  id: string;
  vertical: string;
  region?: string;
  strategy_type: string;
  parameters: Record<string, string>;
  sample_size: number;
  close_rate: number | null;
  confidence_lower: number | null;
  confidence_upper: number | null;
  status: StrategyStatus;
  last_evaluated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertStrategyInput {
  vertical: string;
  region?: string;
  strategy_type: string;
  parameters: Record<string, string>;
  sample_size: number;
  close_rate: number | null;
  confidence_lower: number | null;
  confidence_upper: number | null;
  status?: StrategyStatus;
}

/**
 * Strategy store. Ported from src/memory/strategicStore.ts. Same lifecycle
 * policy (transitions on every upsert based on sample_size + CI lower bound).
 *
 * Uniqueness on (vertical, region, parameters JSON) is enforced in
 * application code via findFirst because Prisma can't put a unique
 * constraint on a Json column directly.
 */
export const strategicStore = {
  async upsert(input: UpsertStrategyInput): Promise<StrategyRow> {
    const existing = await findByKey(input.vertical, input.region, input.parameters);

    if (existing) {
      const newStatus = input.status ?? transition(existing, input);
      const updated = await prisma.strategy.update({
        where: { id: existing.id },
        data: {
          sampleSize: input.sample_size,
          closeRate: input.close_rate,
          confidenceLower: input.confidence_lower,
          confidenceUpper: input.confidence_upper,
          status: newStatus,
          lastEvaluatedAt: new Date(),
        },
      });
      return rowToStrategy(updated);
    }

    // Apply lifecycle policy on first insert too — fresh row with
    // sample_size=20 and decent close rate should not be stuck at "new".
    const synthetic: StrategyRow = {
      id: "_",
      vertical: input.vertical,
      region: input.region,
      strategy_type: input.strategy_type,
      parameters: input.parameters,
      sample_size: 0,
      close_rate: null,
      confidence_lower: null,
      confidence_upper: null,
      status: "new",
      created_at: "",
      updated_at: "",
    };
    const status = input.status ?? transition(synthetic, input);
    const created = await prisma.strategy.create({
      data: {
        vertical: input.vertical,
        region: input.region ?? null,
        strategyType: input.strategy_type,
        parameters: input.parameters as unknown as Prisma.InputJsonValue,
        sampleSize: input.sample_size,
        closeRate: input.close_rate,
        confidenceLower: input.confidence_lower,
        confidenceUpper: input.confidence_upper,
        status,
        lastEvaluatedAt: new Date(),
      },
    });
    return rowToStrategy(created);
  },

  async getRelevant(
    vertical: string,
    region?: string,
    limit = 10,
  ): Promise<StrategyRow[]> {
    const rows = await prisma.strategy.findMany({
      where: {
        vertical,
        ...(region ? { OR: [{ region }, { region: null }] } : {}),
        NOT: { status: "deprecated" },
      },
      take: limit,
    });
    // Status priority sort in code (DB sort by enum case is fiddly).
    const statusOrder: Record<StrategyStatus, number> = {
      champion: 0,
      active: 1,
      testing: 2,
      new: 3,
      deprecated: 4,
    };
    return rows
      .map(rowToStrategy)
      .sort((a, b) => {
        const s = statusOrder[a.status] - statusOrder[b.status];
        if (s !== 0) return s;
        const ar = a.close_rate ?? -1;
        const br = b.close_rate ?? -1;
        if (br !== ar) return br - ar;
        return b.sample_size - a.sample_size;
      });
  },

  async list(filter: {
    vertical?: string;
    status?: StrategyStatus;
  } = {}): Promise<StrategyRow[]> {
    const rows = await prisma.strategy.findMany({
      where: {
        ...(filter.vertical ? { vertical: filter.vertical } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(rowToStrategy);
  },

  async setStatus(id: string, status: StrategyStatus): Promise<void> {
    await prisma.strategy.update({ where: { id }, data: { status } });
  },
};

// ── Lifecycle policy ──

function transition(
  existing: StrategyRow,
  update: UpsertStrategyInput,
): StrategyStatus {
  const n = update.sample_size;
  const rate = update.close_rate ?? 0;
  const lower = update.confidence_lower ?? 0;
  if (n >= 20 && rate < 0.15) return "deprecated";
  if (n >= 50 && lower >= 0.4) return "champion";
  if (n >= 20 && lower >= 0.2) return "active";
  if (n >= 5) return "testing";
  return existing.status === "deprecated" ? "deprecated" : "new";
}

// ── Internal ──

async function findByKey(
  vertical: string,
  region: string | undefined,
  parameters: Record<string, string>,
): Promise<StrategyRow | null> {
  // Prisma can't filter by Json equality reliably across all engines;
  // fetch candidates by (vertical, region) and match in JS.
  const candidates = await prisma.strategy.findMany({
    where: { vertical, region: region ?? null },
  });
  const target = JSON.stringify(parameters, Object.keys(parameters).sort());
  for (const c of candidates) {
    const cur = c.parameters as Record<string, string>;
    const curStr = JSON.stringify(cur, Object.keys(cur).sort());
    if (curStr === target) return rowToStrategy(c);
  }
  return null;
}

type StrategyDb = Awaited<ReturnType<typeof prisma.strategy.findUnique>>;

function rowToStrategy(row: NonNullable<StrategyDb>): StrategyRow {
  return {
    id: row.id,
    vertical: row.vertical,
    region: row.region ?? undefined,
    strategy_type: row.strategyType,
    parameters: row.parameters as Record<string, string>,
    sample_size: row.sampleSize,
    close_rate: row.closeRate,
    confidence_lower: row.confidenceLower,
    confidence_upper: row.confidenceUpper,
    status: row.status as StrategyStatus,
    last_evaluated_at: row.lastEvaluatedAt?.toISOString(),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
