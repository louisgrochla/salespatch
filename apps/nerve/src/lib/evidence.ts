import { prisma } from "./db";

// Resolve an evidence source row across the polymorphic table set.
// Returns a normalised display object — the columns that actually matter
// for showing "what is this thing pointing at?". Returns null if not found.

export interface EvidenceSourceSnapshot {
  sourceType: string;
  sourceId: string;
  title: string;
  hint?: string;
  url?: string;
  exists: boolean;
}

export async function resolveEvidenceSource(
  sourceType: string,
  sourceId: string,
): Promise<EvidenceSourceSnapshot> {
  const base: EvidenceSourceSnapshot = {
    sourceType, sourceId, title: "(unresolved)", exists: false,
  };
  try {
    switch (sourceType) {
      case "PitchLog": {
        const r = await prisma.pitchLog.findUnique({
          where: { id: sourceId },
          select: { businessName: true, outcome: true, date: true, sector: true },
        });
        if (!r) return base;
        return { ...base, exists: true,
          title: r.businessName,
          hint: `${r.outcome} · ${r.sector ?? "—"} · ${r.date.toISOString().slice(0, 10)}`,
          url: `/sales/${sourceId}` };
      }
      case "OperationsLog": {
        const r = await prisma.operationsLog.findUnique({
          where: { id: sourceId },
          select: { type: true, date: true, body: true, decision: true, whatFailed: true, whatChanged: true },
        });
        if (!r) return base;
        const headline = r.body ?? r.decision ?? r.whatFailed ?? r.whatChanged ?? "—";
        return { ...base, exists: true,
          title: r.type,
          hint: `${headline.slice(0, 120)}${headline.length > 120 ? "…" : ""} · ${r.date.toISOString().slice(0, 10)}`,
          url: `/operations/${sourceId}` };
      }
      case "LiteratureEntry": {
        const r = await prisma.literatureEntry.findUnique({
          where: { id: sourceId }, select: { title: true, authors: true, year: true },
        });
        if (!r) return base;
        return { ...base, exists: true,
          title: `${r.authors} (${r.year ?? "n.d."})`,
          hint: r.title,
          url: `/research/literature/${sourceId}` };
      }
      case "PhaseBoundary": {
        const r = await prisma.phaseBoundary.findUnique({
          where: { id: sourceId }, select: { name: true, operationalDescription: true },
        });
        if (!r) return base;
        return { ...base, exists: true,
          title: r.name, hint: r.operationalDescription,
          url: `/research/phases/${sourceId}` };
      }
      case "RevenueEntry": {
        const r = await prisma.revenueEntry.findUnique({
          where: { id: sourceId }, select: { dealReference: true, amount: true, date: true },
        });
        if (!r) return base;
        return { ...base, exists: true,
          title: r.dealReference ?? "Revenue",
          hint: `£${Number(r.amount).toFixed(2)} · ${r.date.toISOString().slice(0, 10)}` };
      }
      case "CostEntry": {
        const r = await prisma.costEntry.findUnique({
          where: { id: sourceId }, select: { category: true, amount: true, date: true, notes: true },
        });
        if (!r) return base;
        return { ...base, exists: true,
          title: r.category,
          hint: `£${Number(r.amount).toFixed(2)} · ${r.notes ?? ""}` };
      }
      case "DemoRecord": {
        const r = await prisma.demoRecord.findUnique({
          where: { id: sourceId }, select: { businessName: true, dateBuilt: true },
        });
        if (!r) return base;
        return { ...base, exists: true,
          title: r.businessName, hint: r.dateBuilt.toISOString().slice(0, 10) };
      }
      case "LeadRecord": {
        const r = await prisma.leadRecord.findUnique({
          where: { id: sourceId }, select: { name: true, sourceMethod: true },
        });
        if (!r) return base;
        return { ...base, exists: true,
          title: r.name, hint: r.sourceMethod ?? "" };
      }
      case "PromptLibraryEntry": {
        const r = await prisma.promptLibraryEntry.findUnique({
          where: { id: sourceId }, select: { name: true, model: true, versionNumber: true },
        });
        if (!r) return base;
        return { ...base, exists: true,
          title: r.name, hint: `${r.model} v${r.versionNumber}` };
      }
      case "ArchitectureDocument": {
        const r = await prisma.architectureDocument.findUnique({
          where: { id: sourceId }, select: { title: true, version: true },
        });
        if (!r) return base;
        return { ...base, exists: true,
          title: r.title, hint: `version ${r.version}` };
      }
    }
  } catch {
    // Treat lookup failures as unresolved.
  }
  return base;
}
