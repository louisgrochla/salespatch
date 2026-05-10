import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Spend ledger store — writes and aggregates per-call API spend rows.
 * Mirrors the decisionStore.ts house style. Singleton, backed by the
 * shared Prisma client.
 *
 * Source rows arrive via /api/ingest/spend (HMAC-signed POST from the Pi
 * runtime). Aggregation helpers power the eventual "how much did
 * vertical=barber cost in May?" dashboards.
 */

export interface SpendLedgerInput {
  provider: string;
  model?: string;
  agent_id?: string;
  run_id?: string;
  node_id?: string;
  lead_id?: string;
  vertical?: string;
  cost_usd: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  request_kind?: string;
  success?: boolean;
  error_message?: string;
  metadata?: Record<string, unknown>;
  occurred_at: string; // ISO timestamp
}

export interface SpendLedgerRow {
  id: string;
  provider: string;
  model?: string;
  agent_id?: string;
  run_id?: string;
  node_id?: string;
  lead_id?: string;
  vertical?: string;
  cost_usd: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  request_kind?: string;
  success: boolean;
  error_message?: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface SpendListFilter {
  provider?: string;
  agent_id?: string;
  lead_id?: string;
  run_id?: string;
  vertical?: string;
  since_iso?: string;
}

export interface SpendRollup {
  key: string;
  total_cost_usd: number;
  n: number;
  avg_cost_usd: number;
  since: string | null;
}

export const spendLedgerStore = {
  async record(input: SpendLedgerInput): Promise<SpendLedgerRow> {
    const occurredAt = new Date(input.occurred_at);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error(`occurred_at must be a valid ISO timestamp: ${input.occurred_at}`);
    }
    const row = await prisma.spendLedger.create({
      data: {
        provider: input.provider,
        model: input.model ?? null,
        agentId: input.agent_id ?? null,
        runId: input.run_id ?? null,
        nodeId: input.node_id ?? null,
        leadId: input.lead_id ?? null,
        vertical: input.vertical ?? null,
        costUsd: input.cost_usd,
        inputTokens: input.input_tokens ?? null,
        outputTokens: input.output_tokens ?? null,
        totalTokens: input.total_tokens ?? null,
        requestKind: input.request_kind ?? null,
        success: input.success ?? true,
        errorMessage: input.error_message ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        occurredAt,
      },
    });
    return rowToSpend(row);
  },

  async listRecent(limit = 50, filter?: SpendListFilter): Promise<SpendLedgerRow[]> {
    const where: Prisma.SpendLedgerWhereInput = {};
    if (filter?.provider) where.provider = filter.provider;
    if (filter?.agent_id) where.agentId = filter.agent_id;
    if (filter?.lead_id) where.leadId = filter.lead_id;
    if (filter?.run_id) where.runId = filter.run_id;
    if (filter?.vertical) where.vertical = filter.vertical;
    if (filter?.since_iso) {
      where.occurredAt = { gte: new Date(filter.since_iso) };
    }

    const rows = await prisma.spendLedger.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToSpend);
  },

  async aggregateByAgent(sinceIso?: string): Promise<SpendRollup[]> {
    return groupByColumn("agent_id", sinceIso);
  },

  async aggregateByProvider(sinceIso?: string): Promise<SpendRollup[]> {
    return groupByColumn("provider", sinceIso);
  },

  async aggregateByLead(sinceIso?: string): Promise<SpendRollup[]> {
    return groupByColumn("lead_id", sinceIso);
  },
};

// ── Helpers ──

async function groupByColumn(
  column: "provider" | "agent_id" | "lead_id",
  sinceIso?: string,
): Promise<SpendRollup[]> {
  // Raw query keeps NULL handling explicit (groupBy on a nullable column
  // returns a null bucket which is what we want). COALESCE for stable keys.
  const since = sinceIso ? new Date(sinceIso) : null;
  // Validate column to avoid any chance of SQL injection — column comes
  // only from internal callers but defense-in-depth is cheap here.
  const allowed = new Set(["provider", "agent_id", "lead_id"]);
  if (!allowed.has(column)) {
    throw new Error(`unsupported group column: ${column}`);
  }

  const rows = await prisma.$queryRaw<
    Array<{
      key: string | null;
      total_cost_usd: number | string;
      n: bigint;
      avg_cost_usd: number | string;
    }>
  >(
    since
      ? Prisma.sql`
          SELECT COALESCE(${Prisma.raw(`"${column}"`)}, '(none)') AS key,
                 SUM(cost_usd)            AS total_cost_usd,
                 COUNT(*)                 AS n,
                 AVG(cost_usd)            AS avg_cost_usd
          FROM spend_ledger
          WHERE occurred_at >= ${since}
          GROUP BY ${Prisma.raw(`"${column}"`)}
          ORDER BY total_cost_usd DESC
        `
      : Prisma.sql`
          SELECT COALESCE(${Prisma.raw(`"${column}"`)}, '(none)') AS key,
                 SUM(cost_usd)            AS total_cost_usd,
                 COUNT(*)                 AS n,
                 AVG(cost_usd)            AS avg_cost_usd
          FROM spend_ledger
          GROUP BY ${Prisma.raw(`"${column}"`)}
          ORDER BY total_cost_usd DESC
        `,
  );

  const sinceStr = since ? since.toISOString() : null;
  return rows.map((r) => ({
    key: r.key ?? "(none)",
    total_cost_usd: Number(r.total_cost_usd ?? 0),
    n: Number(r.n),
    avg_cost_usd: Number(r.avg_cost_usd ?? 0),
    since: sinceStr,
  }));
}

type SpendDb = Awaited<ReturnType<typeof prisma.spendLedger.findUnique>>;

function rowToSpend(row: NonNullable<SpendDb>): SpendLedgerRow {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model ?? undefined,
    agent_id: row.agentId ?? undefined,
    run_id: row.runId ?? undefined,
    node_id: row.nodeId ?? undefined,
    lead_id: row.leadId ?? undefined,
    vertical: row.vertical ?? undefined,
    cost_usd: row.costUsd,
    input_tokens: row.inputTokens ?? undefined,
    output_tokens: row.outputTokens ?? undefined,
    total_tokens: row.totalTokens ?? undefined,
    request_kind: row.requestKind ?? undefined,
    success: row.success,
    error_message: row.errorMessage ?? undefined,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    occurred_at: row.occurredAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}
