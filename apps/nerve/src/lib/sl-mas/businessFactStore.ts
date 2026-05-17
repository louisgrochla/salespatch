import { prisma } from "@/lib/db";
import type { BusinessFact } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────

export interface BusinessFactInput {
  lead_slug: string;
  key: string;
  value: string;
  source: string;
  confidence?: number | null;
  created_by?: string | null;
  phase_label: string;
}

export interface BusinessFactRow {
  id: string;
  lead_slug: string;
  key: string;
  value: string;
  source: string;
  confidence: number | null;
  created_by: string | null;
  phase_label: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessFactIngestResult {
  id: string;
  inserted: boolean;
  row: BusinessFactRow;
}

/**
 * NERVE-side store for `BusinessFact`. Upsert semantics on the tuple
 * `(leadSlug, key, value, source)` so producer retries asserting the
 * same fact do not create duplicates. Changing the value or source
 * creates a new row — history is preserved by design.
 */
export const businessFactStore = {
  async ingest(input: BusinessFactInput): Promise<BusinessFactIngestResult> {
    const existing = await prisma.businessFact.findFirst({
      where: {
        leadSlug: input.lead_slug,
        key: input.key,
        value: input.value,
        source: input.source,
      },
    });

    if (existing) {
      // Touch updatedAt + refresh nullable fields if the producer is
      // re-asserting with newer confidence / createdBy.
      const updated = await prisma.businessFact.update({
        where: { id: existing.id },
        data: {
          confidence: input.confidence ?? existing.confidence,
          createdBy: input.created_by ?? existing.createdBy,
        },
      });
      return {
        id: updated.id,
        inserted: false,
        row: rowToWire(updated),
      };
    }

    const row = await prisma.businessFact.create({
      data: {
        leadSlug: input.lead_slug,
        key: input.key,
        value: input.value,
        source: input.source,
        confidence: input.confidence ?? null,
        createdBy: input.created_by ?? null,
        phaseLabel: input.phase_label,
      },
    });
    return {
      id: row.id,
      inserted: true,
      row: rowToWire(row),
    };
  },

  async listForLead(leadSlug: string, limit = 200): Promise<BusinessFactRow[]> {
    const rows = await prisma.businessFact.findMany({
      where: { leadSlug },
      orderBy: [{ key: "asc" }, { createdAt: "desc" }],
      take: limit,
    });
    return rows.map(rowToWire);
  },

  async deleteById(id: string): Promise<void> {
    await prisma.businessFact.delete({ where: { id } });
  },
};

// ── Mapper ──────────────────────────────────────────────────────────────

function rowToWire(row: BusinessFact): BusinessFactRow {
  return {
    id: row.id,
    lead_slug: row.leadSlug,
    key: row.key,
    value: row.value,
    source: row.source,
    confidence: row.confidence,
    created_by: row.createdBy,
    phase_label: row.phaseLabel,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
