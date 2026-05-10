import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// Composer Workbench iteration store. Mirrors decisionStore.ts shape —
// snake_case row interfaces, async methods, idempotent writes keyed on
// iteration_id (caller-supplied so retries from the workbench when the
// round-trip fails don't double-insert).

export type ComposerEditKind =
  | "ai_generate"
  | "manual_edit"
  | "save"
  | "delete"
  | "rename"
  | (string & {});

export interface ComposerIterationInput {
  iteration_id: string;
  lead_id?: string;
  business_name?: string;
  vertical?: string;
  html_output: string;
  css_output?: string;
  prompt?: string;
  response?: string;
  edit_kind: ComposerEditKind;
  editor_notes?: string;
  parent_iteration_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ComposerIterationRow {
  id: string;
  iteration_id: string;
  lead_id?: string;
  business_name?: string;
  vertical?: string;
  html_output: string;
  css_output?: string;
  prompt?: string;
  response?: string;
  edit_kind: string;
  editor_notes?: string;
  parent_iteration_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ComposerIterationIngestResult {
  iteration_id: string;
  inserted: boolean; // false = duplicate (idempotent replay)
  row: ComposerIterationRow;
}

export const composerIterationStore = {
  /**
   * Idempotent on iteration_id. If a row with the same iteration_id already
   * exists, returns the existing row with inserted=false. Replay-safe so
   * the workbench can retry on transient network failure without
   * double-writing.
   */
  async ingest(
    input: ComposerIterationInput,
  ): Promise<ComposerIterationIngestResult> {
    const existing = await prisma.composerIteration.findUnique({
      where: { iterationId: input.iteration_id },
    });
    if (existing) {
      return {
        iteration_id: existing.iterationId,
        inserted: false,
        row: rowToIteration(existing),
      };
    }

    const row = await prisma.composerIteration.create({
      data: {
        iterationId: input.iteration_id,
        leadId: input.lead_id ?? null,
        businessName: input.business_name ?? null,
        vertical: input.vertical ?? null,
        htmlOutput: input.html_output,
        cssOutput: input.css_output ?? null,
        prompt: input.prompt ?? null,
        response: input.response ?? null,
        editKind: input.edit_kind,
        editorNotes: input.editor_notes ?? null,
        parentIterationId: input.parent_iteration_id ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return {
      iteration_id: row.iterationId,
      inserted: true,
      row: rowToIteration(row),
    };
  },

  async getByIterationId(
    iterationId: string,
  ): Promise<ComposerIterationRow | null> {
    const row = await prisma.composerIteration.findUnique({
      where: { iterationId },
    });
    return row ? rowToIteration(row) : null;
  },

  async listRecent(limit = 50): Promise<ComposerIterationRow[]> {
    const rows = await prisma.composerIteration.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(rowToIteration);
  },

  async listByLead(leadId: string, limit = 50): Promise<ComposerIterationRow[]> {
    const rows = await prisma.composerIteration.findMany({
      where: { leadId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(rowToIteration);
  },

  async listByEditKind(
    editKind: ComposerEditKind,
    limit = 50,
  ): Promise<ComposerIterationRow[]> {
    const rows = await prisma.composerIteration.findMany({
      where: { editKind },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(rowToIteration);
  },
};

// ── Row mapper ──

type ComposerIterationDb = Awaited<
  ReturnType<typeof prisma.composerIteration.findUnique>
>;

function rowToIteration(
  row: NonNullable<ComposerIterationDb>,
): ComposerIterationRow {
  return {
    id: row.id,
    iteration_id: row.iterationId,
    lead_id: row.leadId ?? undefined,
    business_name: row.businessName ?? undefined,
    vertical: row.vertical ?? undefined,
    html_output: row.htmlOutput,
    css_output: row.cssOutput ?? undefined,
    prompt: row.prompt ?? undefined,
    response: row.response ?? undefined,
    edit_kind: row.editKind,
    editor_notes: row.editorNotes ?? undefined,
    parent_iteration_id: row.parentIterationId ?? undefined,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    created_at: row.createdAt.toISOString(),
  };
}
