import { prisma } from "@/lib/db";

/**
 * R3 (ask-the-business): given a lead's polymorphic id (LeadRecord cuid OR
 * SL-MAS slug), return every `Embedding.sourceId` that's tied to it today.
 *
 * Today, four source types are embedded per-lead in NERVE's pipeline:
 *
 * - `LeadRecord` (sourceId = LeadRecord.id, the cuid) — written by
 *   `apps/nerve/src/app/(app)/leads/actions.ts`
 * - `Note` (sourceId = Note.id, the cuid) where `relatedSlug` matches
 *   the lead's slug — written by `/api/ingest/notes` and `notes/actions.ts`
 * - `BusinessFact` (sourceId = BusinessFact.id, the cuid) where
 *   `leadSlug` matches — written by `/api/ingest/business-fact` and the
 *   inline `addFact` server action (R4)
 * - `VisitEvent` (sourceId = VisitEvent.id, the cuid) where `leadId`
 *   matches — written by `/api/ingest/visit-event` (R9) when the SP
 *   leaves per-visit feedback. Only feedback rows are embedded; pure
 *   arrived/departed timing rows have no embeddable text.
 *
 * When sl-mas stores start writing embeddings for site briefs / brand /
 * demos / qa, those source IDs will need to be added here too. Until
 * then, this helper is the authoritative list both `/leads/[id]/page.tsx`
 * (for the EmbeddingsPanel rollup) and `/ask` (for scope-filtered chat)
 * agree on.
 *
 * Returns an empty array when the lead has no embeddable records yet —
 * callers should treat empty as "RAG hasn't seen this lead" rather than
 * "filter wide open".
 */
export async function getLeadSourceIds(leadIdOrSlug: string): Promise<string[]> {
  const [lead, notes, facts, visits] = await Promise.all([
    prisma.leadRecord.findUnique({
      where: { id: leadIdOrSlug },
      select: { id: true },
    }),
    prisma.note.findMany({
      where: { relatedSlug: leadIdOrSlug },
      select: { id: true },
    }),
    prisma.businessFact.findMany({
      where: { leadSlug: leadIdOrSlug },
      select: { id: true },
    }),
    prisma.visitEvent.findMany({
      where: {
        leadId: leadIdOrSlug,
        feedback: { not: null },
      },
      select: { id: true },
    }),
  ]);
  return [
    ...(lead ? [lead.id] : []),
    ...notes.map((n) => n.id),
    ...facts.map((f) => f.id),
    ...visits.map((v) => v.id),
  ];
}
