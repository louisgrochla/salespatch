/**
 * Cross-lead operations data — one row per canonical business with every
 * signal a founder needs to scan the pipeline at a glance.
 *
 * R8 of the leads-ops rethink. The page (`/leads`) is a thin orchestrator;
 * this module owns the fan-out queries (Prisma + Supabase live-pull), the
 * dedup, the per-row reduction, and filter application.
 *
 * Sources zipped per row:
 *   - `LeadProfile` / `LeadRecord` for identity (SL-MAS wins dedup)
 *   - `LeadAssignmentEvent` for stage + assigned SP + assignment ids
 *   - `DemoArtefact` for has-demo / count / latest
 *   - `QaVisualResult` for the latest has-critical signal
 *   - `PitchLog` for pitch count + latest outcome (joined by businessName,
 *     same as `/leads/[id]`)
 *   - `Note` (scope=lead) for feedback count
 *   - `BusinessFact` for last-activity timestamp
 *   - `StripeEvent` for paid revenue per assignment
 *   - Supabase `fetchBuilds()` for paid/onboarding/change-request signal
 *   - Supabase `fetchSalesUsers()` for SP display name lookup
 *   - Supabase `fetchVisits()` for SP time-on-business (R9 moves into NERVE)
 *
 * R9 will swap the last three (sales_users, visits, possibly build state)
 * for NERVE-native data. Keep this file's shape — only swap the source
 * implementation.
 */
import { prisma } from "@/lib/db";
import {
  fetchBuilds,
  fetchSalesUsers,
  fetchVisits,
  type BuildRow,
  type SalesUser,
} from "@/lib/supabase-builds";
import { normaliseName } from "@/lib/sl-mas/businessIdentityStore";
import {
  visitEventStore,
  type VisitAggregate,
} from "@/lib/sl-mas/visitEventStore";

// ── Public types ─────────────────────────────────────────────────────────

export type LeadOpsStage =
  | "not_contacted"
  | "contacted"
  | "pitched"
  | "sold"
  | "paid"
  | "rejected"
  | "unassigned";

export const STAGE_ORDER: ReadonlyArray<LeadOpsStage> = [
  "unassigned",
  "not_contacted",
  "contacted",
  "pitched",
  "sold",
  "paid",
  "rejected",
];

export type LeadOpsFlag =
  | "only_critical_qa"
  | "only_paid_unbuilt"
  | "only_unassigned"
  | "only_active_onboarding"
  | "only_missing_pitch_log";

export interface LeadOpsBuild {
  status: string | null;
  paid: boolean;
  onboardingTouched: boolean;
  onboardingCompleted: boolean;
  hasChangeRequests: boolean;
  paidAt: Date | null;
  topChanges: string | null;
}

export interface LeadOpsRow {
  leadId: string;
  source: "sl-mas" | "manual";
  businessName: string;
  vertical: string | null;
  postcode: string | null;
  location: string | null;

  stage: LeadOpsStage;

  assignedUserId: string | null;
  assignedDisplayName: string | null;
  assignmentIds: string[];

  hasDemo: boolean;
  demoCount: number;
  latestDemoAt: Date | null;
  hasCriticalQa: boolean | null;

  pitchCount: number;
  latestPitchOutcome: string | null;
  latestPitchAt: Date | null;

  build: LeadOpsBuild | null;

  revenuePence: number;

  lastActivityAt: Date | null;

  visitMinutes: number | null;

  feedbackCount: number;

  flags: {
    criticalQa: boolean;
    unassigned: boolean;
    paidUnbuilt: boolean;
    overdue: boolean;
    /**
     * Stage is pitched/sold/rejected but no PitchLog row matches by
     * businessName. Signals that the iOS post-pitch questionnaire forward
     * to NERVE failed silently (most often a producer/consumer HMAC
     * mismatch). The operator should check apps/nerve/api/ingest/pitch
     * webhook_ingestions log + pitch_attempts.forward_error.
     */
    missingPitchLog: boolean;
  };
}

export interface LeadOpsFilterOptions {
  verticals: string[];
  salespeople: { userId: string; displayName: string }[];
  sources: ("sl-mas" | "manual")[];
}

export interface LeadOpsSummary {
  total: number;
  assigned: number;
  inPitch: number;
  paid: number;
  unbuilt: number;
  flagged: number;
  supabaseAvailable: boolean;
}

export interface LeadOpsResult {
  rows: LeadOpsRow[];
  filterOptions: LeadOpsFilterOptions;
  summary: LeadOpsSummary;
}

// Next.js searchParams shape — strings or string arrays or absent.
export type RawSearchParams = Record<string, string | string[] | undefined>;

interface ParsedFilters {
  stage: Set<LeadOpsStage>;
  vertical: string | null;
  sp: string | null;
  source: Set<"sl-mas" | "manual">;
  flag: LeadOpsFlag | null;
  q: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap((s) => s.split(","));
  return v.split(",");
}

function parseFilters(raw: RawSearchParams): ParsedFilters {
  const stageList = toArray(raw.stage).filter((s): s is LeadOpsStage =>
    (STAGE_ORDER as readonly string[]).includes(s),
  );
  const sourceList = toArray(raw.source).filter(
    (s): s is "sl-mas" | "manual" => s === "sl-mas" || s === "manual",
  );
  const flagRaw = typeof raw.flag === "string" ? raw.flag : null;
  const flag: LeadOpsFlag | null =
    flagRaw === "only_critical_qa" ||
    flagRaw === "only_paid_unbuilt" ||
    flagRaw === "only_unassigned" ||
    flagRaw === "only_active_onboarding" ||
    flagRaw === "only_missing_pitch_log"
      ? flagRaw
      : null;
  return {
    stage: new Set(stageList),
    vertical: typeof raw.vertical === "string" ? raw.vertical.trim() || null : null,
    sp: typeof raw.sp === "string" ? raw.sp.trim() || null : null,
    source: new Set(sourceList),
    flag,
    q: typeof raw.q === "string" ? raw.q.trim().toLowerCase() || null : null,
  };
}

function mapAssignmentStatusToStage(status: string | null | undefined): LeadOpsStage {
  switch (status) {
    case "sold":
      return "sold";
    case "rejected":
      return "rejected";
    case "pitched":
      return "pitched";
    case "visited":
      return "contacted";
    case "new":
      return "not_contacted";
    default:
      return "unassigned";
  }
}

function mapContactedStatusToStage(status: string | null | undefined): LeadOpsStage {
  switch (status) {
    case "closed":
      return "sold";
    case "rejected":
      return "rejected";
    case "pitched":
      return "pitched";
    case "contacted":
      return "contacted";
    case "not_contacted":
      return "not_contacted";
    default:
      return "unassigned";
  }
}

function pickLatestPitchOutcome(
  pitches: { date: Date; outcome: string }[],
): { latestPitchAt: Date | null; latestPitchOutcome: string | null } {
  if (pitches.length === 0) return { latestPitchAt: null, latestPitchOutcome: null };
  let latest = pitches[0];
  for (const p of pitches) {
    if (p.date > latest.date) latest = p;
  }
  return { latestPitchAt: latest.date, latestPitchOutcome: latest.outcome };
}

function maxDate(...candidates: Array<Date | null | undefined>): Date | null {
  let max: Date | null = null;
  for (const c of candidates) {
    if (!c) continue;
    if (!max || c > max) max = c;
  }
  return max;
}

// ── Main entry ───────────────────────────────────────────────────────────

export async function loadLeadsOps(raw: RawSearchParams): Promise<LeadOpsResult> {
  const filters = parseFilters(raw);

  // Pre-build profile-side WHERE for vertical (cheap server-side filter that
  // also keeps the table size sane on Vercel preview latency).
  const profileWhere = filters.vertical
    ? { vertical: filters.vertical }
    : undefined;

  const [
    profiles,
    leadRecords,
    assignmentEvents,
    demoGroups,
    qaVisualLatest,
    pitchAll,
    noteGroups,
    factGroups,
    builds,
    salesUsers,
  ] = await Promise.all([
    prisma.leadProfile.findMany({
      where: profileWhere,
      orderBy: { profiledAt: "desc" },
      take: 1000,
    }),
    prisma.leadRecord.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.leadAssignmentEvent.findMany({
      orderBy: { occurredAt: "desc" },
      select: {
        leadId: true,
        assignmentId: true,
        status: true,
        userId: true,
        occurredAt: true,
        notes: true,
      },
      take: 5000,
    }),
    prisma.demoArtefact.groupBy({
      by: ["leadId"],
      _count: { _all: true },
      _max: { generatedAt: true },
    }),
    prisma.qaVisualResult.findMany({
      distinct: ["leadId"],
      orderBy: [{ leadId: "asc" }, { ranAt: "desc" }],
      select: { leadId: true, hasCritical: true, ranAt: true },
    }),
    prisma.pitchLog.findMany({
      select: { businessName: true, date: true, outcome: true },
      orderBy: { date: "desc" },
      take: 5000,
    }),
    prisma.note.groupBy({
      by: ["relatedSlug"],
      where: { scope: "lead", relatedSlug: { not: null } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.businessFact.groupBy({
      by: ["leadSlug"],
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    fetchBuilds(),
    fetchSalesUsers(),
  ]);

  // R9: visit + feedback now live in NERVE Postgres. Aggregate across every
  // lead in one pass and use Supabase only as a fallback when a given lead
  // has no NERVE rows yet (i.e., before the mobile-api producer wire-up
  // has propagated for that lead).
  const visitAggsByLead: Map<string, VisitAggregate> =
    await visitEventStore.aggregateAcrossLeads();

  const supabaseAvailable = builds.length > 0 || salesUsers.length > 0;

  // ── Index pre-built lookups ────────────────────────────────────────────

  const salesUserById = new Map<string, SalesUser>(
    salesUsers.map((u) => [u.userId, u]),
  );

  const buildByAssignmentId = new Map<string, BuildRow>(
    builds.map((b) => [b.leadId, b]),
  );

  // Per-lead assignment fanout — latest event wins for stage/SP, but we
  // keep the union of assignmentIds so revenue + visits aggregate over every
  // assignment this lead has ever had (rare but happens on reassignment).
  const latestEventByLead = new Map<string, LatestAssignmentEvent>();
  const assignmentIdsByLead = new Map<string, Set<string>>();
  for (const e of assignmentEvents) {
    if (!latestEventByLead.has(e.leadId)) {
      latestEventByLead.set(e.leadId, {
        status: e.status,
        userId: e.userId ?? null,
        assignmentId: e.assignmentId,
        occurredAt: e.occurredAt,
        notes: e.notes ?? null,
      });
    }
    let set = assignmentIdsByLead.get(e.leadId);
    if (!set) {
      set = new Set();
      assignmentIdsByLead.set(e.leadId, set);
    }
    set.add(e.assignmentId);
  }

  // Visit fan-out — needs every assignment id we know about, batched into
  // one Supabase call. If Supabase is unavailable the map is empty and the
  // visit column degrades to `—`.
  const allAssignmentIds = Array.from(
    new Set(assignmentEvents.map((e) => e.assignmentId)),
  );
  const visitsByAssignment = await fetchVisits(allAssignmentIds);

  // Stripe revenue per assignment — one groupBy across the whole table; we
  // only sum amount_total_pence for events with paymentStatus = "paid" so
  // refunds and unpaid intents don't inflate the figure.
  const stripeGroups = await prisma.stripeEvent.groupBy({
    by: ["assignmentId"],
    where: {
      paymentStatus: "paid",
      assignmentId: { not: null },
    },
    _sum: { amountTotalPence: true },
  });
  const revenueByAssignment = new Map<string, number>();
  for (const g of stripeGroups) {
    if (!g.assignmentId) continue;
    revenueByAssignment.set(g.assignmentId, g._sum.amountTotalPence ?? 0);
  }

  const demoByLead = new Map(
    demoGroups.map((g) => [
      g.leadId,
      { count: g._count._all, latestAt: g._max.generatedAt ?? null },
    ]),
  );

  const qaByLead = new Map(
    qaVisualLatest.map((r) => [
      r.leadId,
      { hasCritical: r.hasCritical, ranAt: r.ranAt },
    ]),
  );

  const pitchesByName = new Map<
    string,
    { count: number; latestAt: Date | null; latestOutcome: string | null }
  >();
  for (const p of pitchAll) {
    const k = p.businessName;
    const acc = pitchesByName.get(k) ?? {
      count: 0,
      latestAt: null as Date | null,
      latestOutcome: null as string | null,
    };
    acc.count += 1;
    if (!acc.latestAt || p.date > acc.latestAt) {
      acc.latestAt = p.date;
      acc.latestOutcome = p.outcome;
    }
    pitchesByName.set(k, acc);
  }

  const noteCountBySlug = new Map(
    noteGroups
      .filter((g) => g.relatedSlug)
      .map((g) => [
        g.relatedSlug as string,
        { count: g._count._all, latestAt: g._max.updatedAt ?? null },
      ]),
  );

  const factCountBySlug = new Map(
    factGroups.map((g) => [
      g.leadSlug,
      { count: g._count._all, latestAt: g._max.createdAt ?? null },
    ]),
  );

  // ── Dedup manual LeadRecords against SL-MAS LeadProfiles ───────────────

  const slMasNormalisedNames = new Set(
    profiles.map((p) => normaliseName(p.businessName)),
  );
  const dedupedManual = leadRecords.filter(
    (l) => !slMasNormalisedNames.has(normaliseName(l.name)),
  );

  // ── Build rows ─────────────────────────────────────────────────────────

  const rows: LeadOpsRow[] = [];

  for (const p of profiles) {
    rows.push(
      buildRow({
        leadId: p.leadId,
        source: "sl-mas",
        businessName: p.businessName,
        vertical: p.vertical ?? null,
        postcode: p.postcode ?? null,
        location: p.address ?? null,
        contactedStatus: null,
        profileTimestamp: p.profiledAt,
        latestEventByLead,
        assignmentIdsByLead,
        salesUserById,
        buildByAssignmentId,
        revenueByAssignment,
        visitsByAssignment,
        visitAggsByLead,
        demoByLead,
        qaByLead,
        pitchesByName,
        noteCountBySlug,
        factCountBySlug,
      }),
    );
  }

  for (const l of dedupedManual) {
    rows.push(
      buildRow({
        leadId: l.id,
        source: "manual",
        businessName: l.name,
        vertical: l.sector ?? null,
        postcode: null,
        location: l.location ?? null,
        contactedStatus: l.contactedStatus,
        profileTimestamp: l.createdAt,
        latestEventByLead,
        assignmentIdsByLead,
        salesUserById,
        buildByAssignmentId,
        revenueByAssignment,
        visitsByAssignment,
        visitAggsByLead,
        demoByLead,
        qaByLead,
        pitchesByName,
        noteCountBySlug,
        factCountBySlug,
      }),
    );
  }

  // ── Apply filters ──────────────────────────────────────────────────────

  const filtered = rows.filter((r) => {
    if (filters.stage.size > 0 && !filters.stage.has(r.stage)) return false;
    if (filters.vertical && r.vertical !== filters.vertical) return false;
    if (filters.sp && r.assignedDisplayName !== filters.sp) return false;
    if (filters.source.size > 0 && !filters.source.has(r.source)) return false;
    if (filters.flag === "only_critical_qa" && !r.flags.criticalQa) return false;
    if (filters.flag === "only_paid_unbuilt" && !r.flags.paidUnbuilt) return false;
    if (filters.flag === "only_unassigned" && !r.flags.unassigned) return false;
    if (
      filters.flag === "only_active_onboarding" &&
      !(r.build && r.build.onboardingTouched && !r.build.onboardingCompleted)
    ) {
      return false;
    }
    if (filters.flag === "only_missing_pitch_log" && !r.flags.missingPitchLog) {
      return false;
    }
    if (filters.q) {
      const hay = `${r.businessName} ${r.leadId} ${r.postcode ?? ""} ${r.location ?? ""}`.toLowerCase();
      if (!hay.includes(filters.q)) return false;
    }
    return true;
  });

  // Sort: paid first (recent paid-at), then by lastActivity desc, then name.
  filtered.sort((a, b) => {
    const aPaid = a.build?.paidAt?.getTime() ?? 0;
    const bPaid = b.build?.paidAt?.getTime() ?? 0;
    if (aPaid !== bPaid) return bPaid - aPaid;
    const aAct = a.lastActivityAt?.getTime() ?? 0;
    const bAct = b.lastActivityAt?.getTime() ?? 0;
    if (aAct !== bAct) return bAct - aAct;
    return a.businessName.localeCompare(b.businessName);
  });

  // ── Filter options (derived from the full rowset, not the filtered) ────

  const verticalsSet = new Set<string>();
  for (const r of rows) if (r.vertical) verticalsSet.add(r.vertical);
  const verticals = Array.from(verticalsSet).sort();
  const sourceTypes: ("sl-mas" | "manual")[] = ["sl-mas", "manual"];

  const filterOptions: LeadOpsFilterOptions = {
    verticals,
    salespeople: salesUsers
      .map((u) => ({ userId: u.userId, displayName: u.displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    sources: sourceTypes,
  };

  // ── Summary tiles ──────────────────────────────────────────────────────

  const summary: LeadOpsSummary = {
    total: rows.length,
    assigned: rows.filter((r) => r.assignedUserId !== null).length,
    inPitch: rows.filter((r) => r.stage === "pitched").length,
    paid: rows.filter((r) => r.stage === "paid" || r.stage === "sold").length,
    unbuilt: rows.filter((r) => r.flags.paidUnbuilt).length,
    flagged: rows.filter(
      (r) =>
        r.flags.criticalQa ||
        r.flags.paidUnbuilt ||
        r.flags.overdue ||
        r.flags.unassigned ||
        r.flags.missingPitchLog,
    ).length,
    supabaseAvailable,
  };

  return { rows: filtered, filterOptions, summary };
}

// ── Row builder ──────────────────────────────────────────────────────────

interface LatestAssignmentEvent {
  status: string;
  userId: string | null;
  assignmentId: string;
  occurredAt: Date;
  notes: string | null;
}

interface BuildRowArgs {
  leadId: string;
  source: "sl-mas" | "manual";
  businessName: string;
  vertical: string | null;
  postcode: string | null;
  location: string | null;
  contactedStatus: string | null;
  profileTimestamp: Date;
  latestEventByLead: Map<string, LatestAssignmentEvent>;
  assignmentIdsByLead: Map<string, Set<string>>;
  salesUserById: Map<string, SalesUser>;
  buildByAssignmentId: Map<string, BuildRow>;
  revenueByAssignment: Map<string, number>;
  visitsByAssignment: Map<string, { durationMinutes: number; startedAt: string | null }>;
  visitAggsByLead: Map<string, VisitAggregate>;
  demoByLead: Map<string, { count: number; latestAt: Date | null }>;
  qaByLead: Map<string, { hasCritical: boolean | null; ranAt: Date }>;
  pitchesByName: Map<
    string,
    { count: number; latestAt: Date | null; latestOutcome: string | null }
  >;
  noteCountBySlug: Map<string, { count: number; latestAt: Date | null }>;
  factCountBySlug: Map<string, { count: number; latestAt: Date | null }>;
}

const PAID_UNBUILT_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function buildRow(args: BuildRowArgs): LeadOpsRow {
  const {
    leadId,
    source,
    businessName,
    vertical,
    postcode,
    location,
    contactedStatus,
    profileTimestamp,
    latestEventByLead,
    assignmentIdsByLead,
    salesUserById,
    buildByAssignmentId,
    revenueByAssignment,
    visitsByAssignment,
    visitAggsByLead,
    demoByLead,
    qaByLead,
    pitchesByName,
    noteCountBySlug,
    factCountBySlug,
  } = args;

  const event = latestEventByLead.get(leadId);
  const assignmentIds = Array.from(assignmentIdsByLead.get(leadId) ?? []);
  const assignedUserId = event?.userId ?? null;
  const assignedDisplayName =
    assignedUserId && salesUserById.get(assignedUserId)?.displayName
      ? salesUserById.get(assignedUserId)!.displayName
      : null;

  // Build: take the most recently paid (or most recently touched) build
  // among every assignmentId this lead has had.
  let build: LeadOpsBuild | null = null;
  for (const aid of assignmentIds) {
    const b = buildByAssignmentId.get(aid);
    if (!b) continue;
    const paidAt = b.paidAt ? new Date(b.paidAt) : null;
    const onboardingTouched = !!(b.contactEmail || b.contactPhone || b.topChanges || b.anythingElse || b.photos.length > 0);
    const hasChangeRequests = !!(b.topChanges && b.topChanges.trim().length > 0);
    const onboardingCompleted = !!b.completedAt;
    const candidate: LeadOpsBuild = {
      status: b.status,
      paid: !!paidAt || b.status === "sold",
      onboardingTouched,
      onboardingCompleted,
      hasChangeRequests,
      paidAt,
      topChanges: b.topChanges,
    };
    if (!build) {
      build = candidate;
    } else if ((candidate.paidAt?.getTime() ?? 0) > (build.paidAt?.getTime() ?? 0)) {
      build = candidate;
    }
  }

  // Stage resolution: paid wins over event status; event status wins over
  // manual contactedStatus; both absent → unassigned.
  let stage: LeadOpsStage;
  if (build?.paid) {
    stage = "paid";
  } else if (event) {
    stage = mapAssignmentStatusToStage(event.status);
  } else if (contactedStatus) {
    stage = mapContactedStatusToStage(contactedStatus);
  } else {
    stage = "unassigned";
  }

  const demo = demoByLead.get(leadId);
  const qa = qaByLead.get(leadId);
  const pitch = pitchesByName.get(businessName);
  const noteAgg = noteCountBySlug.get(leadId);
  const factAgg = factCountBySlug.get(leadId);

  // Revenue: sum across every assignment id this lead has had.
  let revenuePence = 0;
  for (const aid of assignmentIds) {
    revenuePence += revenueByAssignment.get(aid) ?? 0;
  }

  // R9 visit aggregation. NERVE-first: if visit_events has any rows for
  // this lead, trust them. Fall back to the Supabase live-pull only when
  // NERVE is empty (i.e., before the mobile-api producer wire-up has
  // propagated). visitMinutes stays null when nothing is known so the
  // column can render `—` cleanly.
  const nerveVisit = visitAggsByLead.get(leadId);
  let visitMinutes: number | null = null;
  if (nerveVisit && nerveVisit.visit_count > 0) {
    visitMinutes = nerveVisit.total_duration_minutes;
  } else if (visitsByAssignment.size > 0 || assignmentIds.length === 0) {
    let acc = 0;
    let any = false;
    for (const aid of assignmentIds) {
      const v = visitsByAssignment.get(aid);
      if (v) {
        acc += v.durationMinutes;
        any = true;
      }
    }
    visitMinutes = any ? acc : null;
  }

  // Feedback count = scoped notes + assignment-event notes + R9 visit
  // feedback rows. The three signals don't overlap (different tables,
  // different producers), so the sum is the count an operator cares
  // about ("how many free-form follow-ups touch this lead").
  const feedbackCount =
    (noteAgg?.count ?? 0) +
    (event?.notes ? 1 : 0) +
    (nerveVisit?.feedback_count ?? 0);

  const lastActivityAt = maxDate(
    event?.occurredAt ?? null,
    demo?.latestAt ?? null,
    qa?.ranAt ?? null,
    pitch?.latestAt ?? null,
    noteAgg?.latestAt ?? null,
    factAgg?.latestAt ?? null,
    build?.paidAt ?? null,
    nerveVisit?.latest_occurred_at ?? null,
    profileTimestamp,
  );

  const overdueDeadline =
    build?.paid && build.paidAt
      ? Date.now() - build.paidAt.getTime() > PAID_UNBUILT_THRESHOLD_MS
      : false;

  return {
    leadId,
    source,
    businessName,
    vertical,
    postcode,
    location,
    stage,
    assignedUserId,
    assignedDisplayName,
    assignmentIds,
    hasDemo: !!demo && demo.count > 0,
    demoCount: demo?.count ?? 0,
    latestDemoAt: demo?.latestAt ?? null,
    hasCriticalQa: qa?.hasCritical ?? null,
    pitchCount: pitch?.count ?? 0,
    latestPitchOutcome: pitch?.latestOutcome ?? null,
    latestPitchAt: pitch?.latestAt ?? null,
    build,
    revenuePence,
    lastActivityAt,
    visitMinutes,
    feedbackCount,
    flags: {
      criticalQa: qa?.hasCritical === true,
      unassigned: assignedUserId === null,
      paidUnbuilt:
        !!build?.paid && !build.onboardingCompleted,
      overdue: overdueDeadline && !build?.onboardingCompleted,
      missingPitchLog:
        (stage === "pitched" || stage === "sold" || stage === "rejected") &&
        (pitch?.count ?? 0) === 0,
    },
  };
}
