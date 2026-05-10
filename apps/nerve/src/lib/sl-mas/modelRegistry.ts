import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type ModelKind = "critic" | "agent";
export type ModelSource = "heuristic" | "llm" | "lora" | "external";

export interface ModelRegistration {
  id: string;
  kind: ModelKind;
  agent_id: string | null;
  version: string;
  source: ModelSource;
  endpoint: string | null;
  weights_path: string | null;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RegisterModelInput {
  kind: ModelKind;
  agent_id?: string | null;
  version: string;
  source: ModelSource;
  endpoint?: string;
  weights_path?: string;
  metadata?: Record<string, unknown>;
  activate?: boolean;
}

/**
 * Model registry. Ported from src/runtime/modelRegistry.ts. SQLite single-row
 * uniqueness via UPDATE ... WHERE kind+agent_id is replaced with a Prisma
 * transaction so flipping `active` is atomic across the slot.
 */
export const modelRegistry = {
  /** Seed default if registry is empty. Call once on first boot. */
  async seedDefaults(): Promise<void> {
    const count = await prisma.modelRegistration.count();
    if (count > 0) return;
    await modelRegistry.register({
      kind: "critic",
      version: "heuristic-v1",
      source: "heuristic",
      activate: true,
    });
    await modelRegistry.register({
      kind: "critic",
      agent_id: "site-composer-agent",
      version: "heuristic-v1",
      source: "heuristic",
    });
  },

  async register(input: RegisterModelInput): Promise<ModelRegistration> {
    const agentId = input.agent_id ?? null;
    const result = await prisma.$transaction(async (tx) => {
      if (input.activate) {
        await tx.modelRegistration.updateMany({
          where: { kind: input.kind, agentId },
          data: { active: false },
        });
      }
      return tx.modelRegistration.create({
        data: {
          kind: input.kind,
          agentId,
          version: input.version,
          source: input.source,
          endpoint: input.endpoint ?? null,
          weightsPath: input.weights_path ?? null,
          active: input.activate ?? false,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    });
    return rowToRegistration(result);
  },

  async getActive(
    kind: ModelKind,
    agentId?: string,
  ): Promise<ModelRegistration | null> {
    if (agentId) {
      const specific = await prisma.modelRegistration.findFirst({
        where: { kind, agentId, active: true },
        orderBy: { createdAt: "desc" },
      });
      if (specific) return rowToRegistration(specific);
    }
    const global = await prisma.modelRegistration.findFirst({
      where: { kind, agentId: null, active: true },
      orderBy: { createdAt: "desc" },
    });
    return global ? rowToRegistration(global) : null;
  },

  async swap(id: string): Promise<ModelRegistration | null> {
    const target = await prisma.modelRegistration.findUnique({ where: { id } });
    if (!target) return null;
    await prisma.$transaction([
      prisma.modelRegistration.updateMany({
        where: { kind: target.kind, agentId: target.agentId },
        data: { active: false },
      }),
      prisma.modelRegistration.update({
        where: { id },
        data: { active: true },
      }),
    ]);
    return modelRegistry.getActive(
      target.kind as ModelKind,
      target.agentId ?? undefined,
    );
  },

  async list(filter: {
    kind?: ModelKind;
    agent_id?: string;
  } = {}): Promise<ModelRegistration[]> {
    const rows = await prisma.modelRegistration.findMany({
      where: {
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.agent_id ? { agentId: filter.agent_id } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(rowToRegistration);
  },
};

type ModelDb = Awaited<ReturnType<typeof prisma.modelRegistration.findUnique>>;

function rowToRegistration(row: NonNullable<ModelDb>): ModelRegistration {
  return {
    id: row.id,
    kind: row.kind as ModelKind,
    agent_id: row.agentId,
    version: row.version,
    source: row.source as ModelSource,
    endpoint: row.endpoint,
    weights_path: row.weightsPath,
    active: row.active,
    metadata: row.metadata as Record<string, unknown>,
    created_at: row.createdAt.toISOString(),
  };
}
