// Aggregates-only computations for the public /research page.
// EVERYTHING returned here must be safe to publish. No business names,
// contractor IDs, deal values, free-text notes, or content from the
// founder layer. Aggregations only.

import { prisma } from "./db";

const METHODOLOGY_MIN_PER_PHASE = 50;

export interface PublicMetrics {
  totals: {
    pitches: number;
    closeRatePct: number; // 0-100
  };
  currentPhase: {
    name: string;
    startDate: string | null;
    daysActive: number;
    pitches: number;
    closeRatePct: number;
    description: string;
    dataSufficiencyPct: number; // 0-100, capped
    dataSufficiencyTarget: number;
  };
  phases: Array<{
    name: string;
    started: boolean;
    pitches: number;
    closeRatePct: number;
    closed: number;
    rejected: number;
    followUp: number;
    startDate: string | null;
    endDate: string | null;
  }>;
  lastPitchAgo: string | null; // human, e.g. "2 hours ago"
  dissertationStatus: Array<{ chapter: string; status: string }>;
  timeline: {
    submissionDeadline: string | null;
    submissionNote: string | null;
    daysToSubmission: number | null;
    workingTitle: string | null;
    institution: string | null;
    degree: string | null;
    researchQuestion: string | null;
  };
  generatedAt: string;
}

function humanAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "moments ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export async function loadPublicMetrics(): Promise<PublicMetrics> {
  const now = new Date();

  const [
    phases,
    pitchTotals,
    pitchByPhaseOutcome,
    lastPitch,
    sections,
    meta,
  ] = await Promise.all([
    prisma.phaseBoundary.findMany({ orderBy: { startDate: "asc" } }),
    prisma.pitchLog.groupBy({ by: ["outcome"], _count: { _all: true } }),
    prisma.pitchLog.groupBy({
      by: ["phaseLabel", "outcome"], _count: { _all: true },
    }),
    prisma.pitchLog.findFirst({
      orderBy: { createdAt: "desc" }, select: { createdAt: true },
    }),
    prisma.dissertationSection.findMany({
      orderBy: { chapter: "asc" }, select: { chapter: true, status: true },
    }),
    prisma.dissertationMeta.findUnique({ where: { id: "main" } }),
  ]);

  const totalPitches = pitchTotals.reduce((s, t) => s + t._count._all, 0);
  const totalClosed = pitchTotals.find((t) => t.outcome === "closed")?._count._all ?? 0;
  const totalCloseRate = totalPitches > 0 ? (totalClosed / totalPitches) * 100 : 0;

  const currentPhase =
    phases.find(
      (p) => p.startDate <= now && (p.endDate == null || p.endDate >= now),
    ) ?? phases[0] ?? null;

  const phaseRows = phases.map((p) => {
    const outcomes = pitchByPhaseOutcome.filter((g) => g.phaseLabel === p.name);
    const closed = outcomes.find((o) => o.outcome === "closed")?._count._all ?? 0;
    const rejected = outcomes.find((o) => o.outcome === "rejected")?._count._all ?? 0;
    const followUp = outcomes.find((o) => o.outcome === "follow_up")?._count._all ?? 0;
    const total = closed + rejected + followUp;
    return {
      name: p.name,
      started: p.startDate <= now,
      pitches: total,
      closeRatePct: total > 0 ? (closed / total) * 100 : 0,
      closed, rejected, followUp,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate ? p.endDate.toISOString() : null,
    };
  });

  const currentPhaseRow = currentPhase
    ? phaseRows.find((p) => p.name === currentPhase.name) ?? null
    : null;

  const daysActive = currentPhase
    ? Math.max(0, Math.floor((now.getTime() - currentPhase.startDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const dataSufficiencyPct = currentPhaseRow
    ? Math.min(100, (currentPhaseRow.pitches / METHODOLOGY_MIN_PER_PHASE) * 100)
    : 0;

  const daysToSubmission = meta?.submissionDeadline
    ? Math.ceil((meta.submissionDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    totals: { pitches: totalPitches, closeRatePct: totalCloseRate },
    currentPhase: {
      name: currentPhase?.name ?? "—",
      startDate: currentPhase ? currentPhase.startDate.toISOString() : null,
      daysActive,
      pitches: currentPhaseRow?.pitches ?? 0,
      closeRatePct: currentPhaseRow?.closeRatePct ?? 0,
      description: currentPhase?.operationalDescription ?? "",
      dataSufficiencyPct,
      dataSufficiencyTarget: METHODOLOGY_MIN_PER_PHASE,
    },
    phases: phaseRows,
    lastPitchAgo: lastPitch
      ? humanAgo(now.getTime() - lastPitch.createdAt.getTime())
      : null,
    dissertationStatus: sections,
    timeline: {
      submissionDeadline: meta?.submissionDeadline ? meta.submissionDeadline.toISOString() : null,
      submissionNote: meta?.submissionDeadlineNote ?? null,
      daysToSubmission,
      workingTitle: meta?.workingTitle ?? null,
      institution: meta?.institution ?? null,
      degree: meta?.degree ?? null,
      researchQuestion: meta?.researchQuestion ?? null,
    },
    generatedAt: now.toISOString(),
  };
}
