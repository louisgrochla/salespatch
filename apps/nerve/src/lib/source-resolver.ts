// Resolves any embeddable source (PitchLog, OperationsLog, etc) to a
// human-readable snapshot — used by /search and /ask to label retrieved
// chunks with something a human can recognise.
//
// Returns null on missing rows; callers render "(unresolved)".

import { prisma } from "./db";

export interface ResolvedSource {
  sourceType: string;
  sourceId: string;
  title: string;
  hint?: string;
  url?: string;
  date?: Date;
  exists: boolean;
}

const empty = (sourceType: string, sourceId: string): ResolvedSource => ({
  sourceType, sourceId, title: "(unresolved)", exists: false,
});

export async function resolveSource(
  sourceType: string, sourceId: string,
): Promise<ResolvedSource> {
  try {
    switch (sourceType) {
      case "PitchLog": {
        const r = await prisma.pitchLog.findUnique({
          where: { id: sourceId },
          select: { businessName: true, outcome: true, sector: true, date: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: r.businessName,
          hint: `${r.outcome} · ${r.sector ?? "—"}`,
          url: `/sales/${sourceId}`, date: r.date,
        };
      }
      case "OperationsLog": {
        const r = await prisma.operationsLog.findUnique({
          where: { id: sourceId },
          select: {
            type: true, date: true, body: true, decision: true,
            whatFailed: true, whatChanged: true,
          },
        });
        if (!r) return empty(sourceType, sourceId);
        const headline = r.body ?? r.decision ?? r.whatFailed ?? r.whatChanged ?? "—";
        return {
          sourceType, sourceId, exists: true,
          title: r.type,
          hint: headline.slice(0, 120),
          url: `/operations/${sourceId}`, date: r.date,
        };
      }
      case "RevenueEntry": {
        const r = await prisma.revenueEntry.findUnique({
          where: { id: sourceId },
          select: { dealReference: true, amount: true, date: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: r.dealReference ?? "Revenue",
          hint: `£${Number(r.amount).toFixed(2)}`,
          url: `/financial/revenue/${sourceId}`, date: r.date,
        };
      }
      case "CostEntry": {
        const r = await prisma.costEntry.findUnique({
          where: { id: sourceId },
          select: { category: true, amount: true, date: true, notes: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: `Cost · ${r.category}`,
          hint: `£${Number(r.amount).toFixed(2)}${r.notes ? ` · ${r.notes.slice(0, 80)}` : ""}`,
          url: `/financial/costs/${sourceId}`, date: r.date,
        };
      }
      case "LiteratureEntry": {
        const r = await prisma.literatureEntry.findUnique({
          where: { id: sourceId },
          select: { title: true, authors: true, year: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: `${r.authors} (${r.year ?? "n.d."})`,
          hint: r.title,
          url: `/research/literature/${sourceId}`,
        };
      }
      case "DissertationSection": {
        const r = await prisma.dissertationSection.findUnique({
          where: { id: sourceId },
          select: { chapter: true, status: true, wordCount: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: r.chapter,
          hint: `${r.status.replace("_", " ")} · ${r.wordCount} words`,
          url: `/research/sections/${sourceId}`,
        };
      }
      case "DissertationMeta": {
        const r = await prisma.dissertationMeta.findUnique({
          where: { id: "main" },
          select: { workingTitle: true, researchQuestion: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: "Dissertation metadata",
          hint: r.workingTitle.slice(0, 120),
          url: `/research/dissertation`,
        };
      }
      case "MethodologyDoc": {
        const r = await prisma.methodologyDoc.findUnique({
          where: { id: sourceId },
          select: { phaseName: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: `Methodology — ${r.phaseName}`,
          url: `/research/methodology/${sourceId}`,
        };
      }
      case "PhaseBoundary": {
        const r = await prisma.phaseBoundary.findUnique({
          where: { id: sourceId },
          select: { name: true, operationalDescription: true, startDate: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: r.name, hint: r.operationalDescription.slice(0, 120),
          url: `/research/phases/${sourceId}`, date: r.startDate,
        };
      }
      case "PromptLibraryEntry": {
        const r = await prisma.promptLibraryEntry.findUnique({
          where: { id: sourceId },
          select: { name: true, model: true, versionNumber: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: r.name,
          hint: `${r.model} · v${r.versionNumber}`,
          url: `/product/prompts/${sourceId}`,
        };
      }
      case "EvidenceLog": {
        const r = await prisma.evidenceLog.findUnique({
          where: { id: sourceId },
          select: { sourceType: true, annotation: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: `Evidence → ${r.sourceType}`,
          hint: r.annotation.slice(0, 120),
          url: `/research/evidence/${sourceId}`,
        };
      }
      case "SupervisorMeeting": {
        const r = await prisma.supervisorMeeting.findUnique({
          where: { id: sourceId },
          select: { date: true, notes: true, feedback: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: `Supervisor · ${r.date.toISOString().slice(0, 10)}`,
          hint: (r.notes ?? r.feedback ?? "").slice(0, 120),
          url: `/research/supervisor/${sourceId}`, date: r.date,
        };
      }
      case "AcademicCalendarItem": {
        const r = await prisma.academicCalendarItem.findUnique({
          where: { id: sourceId },
          select: { milestone: true, deadline: true, status: true },
        });
        if (!r) return empty(sourceType, sourceId);
        return {
          sourceType, sourceId, exists: true,
          title: r.milestone, hint: `${r.status} · ${r.deadline.toISOString().slice(0, 10)}`,
          url: `/research/calendar/${sourceId}`, date: r.deadline,
        };
      }
    }
  } catch {
    // Lookup failure → treat as unresolved.
  }
  return empty(sourceType, sourceId);
}

// Section path label for grouping in UI ("research / literature").
export function sectionPathFor(sourceType: string): string {
  switch (sourceType) {
    case "PitchLog": return "sales";
    case "OperationsLog": return "operations";
    case "RevenueEntry": case "CostEntry": return "financial";
    case "LiteratureEntry": case "DissertationSection":
    case "DissertationMeta": case "MethodologyDoc":
    case "PhaseBoundary": case "EvidenceLog":
    case "SupervisorMeeting": case "AcademicCalendarItem": return "research";
    case "PromptLibraryEntry": return "product";
    default: return "other";
  }
}
