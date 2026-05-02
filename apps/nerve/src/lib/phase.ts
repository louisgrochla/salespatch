import { prisma } from "./db";

const FALLBACK_PHASE = "Phase 1";

// Derives the phase label active on a given date by reading PhaseBoundary.
// Cached in-process for the lifetime of the serverless instance — phase
// boundaries change rarely. Bust by redeploying.
let cache: { boundaries: Awaited<ReturnType<typeof loadBoundaries>>; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadBoundaries() {
  return prisma.phaseBoundary.findMany({ orderBy: { startDate: "asc" } });
}

async function getBoundaries() {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.boundaries;
  const boundaries = await loadBoundaries();
  cache = { boundaries, loadedAt: Date.now() };
  return boundaries;
}

export async function phaseLabelFor(date: Date | string): Promise<string> {
  const d = typeof date === "string" ? new Date(date) : date;
  const boundaries = await getBoundaries();
  if (boundaries.length === 0) return FALLBACK_PHASE;

  const match = boundaries.find((b) => {
    const startsBeforeOrOn = b.startDate <= d;
    const endsAfterOrNever = b.endDate == null || b.endDate >= d;
    return startsBeforeOrOn && endsAfterOrNever;
  });

  return match?.name ?? FALLBACK_PHASE;
}

export async function currentPhaseLabel(): Promise<string> {
  return phaseLabelFor(new Date());
}

export function invalidatePhaseCache() {
  cache = null;
}
