import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────
//
// snake_case to match the producer side (sales-dashboard / iOS-emitted
// events) and the other Phase A/B ingest payloads.

export type AssignmentStatus =
  | "new"
  | "visited"
  | "pitched"
  | "sold"
  | "rejected";

export const VALID_STATUSES: ReadonlyArray<AssignmentStatus> = [
  "new",
  "visited",
  "pitched",
  "sold",
  "rejected",
];

export type LeadAssignmentEventSource =
  | "status_patch"
  | "pitch_cascade"
  | "supabase_poll"
  | "backfill"
  | "test";

export interface LeadAssignmentEventInput {
  event_id: string; // caller-supplied natural key
  assignment_id: string; // Supabase lead_assignments.id (UUID)
  lead_id: string; // slug
  user_id?: string | null; // sales_users.id; null on system-initiated reopens
  prev_status?: AssignmentStatus | null;
  status: AssignmentStatus;
  source?: LeadAssignmentEventSource;
  rejection_reason?: string | null;
  commission_amount_pence?: number | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: Record<string, unknown>;
  occurred_at: string; // ISO 8601
}

export interface LeadAssignmentEventRow {
  id: string;
  event_id: string;
  assignment_id: string;
  lead_id: string;
  user_id?: string;
  prev_status?: string;
  status: string;
  transition: string;
  source: string;
  rejection_reason?: string;
  commission_amount_pence?: number;
  notes?: string;
  latitude?: number;
  longitude?: number;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface LeadAssignmentEventIngestResult {
  event_id: string;
  inserted: boolean;
  row: LeadAssignmentEventRow;
}

/**
 * NERVE-side store for `lead_assignment_events`. Idempotent on `event_id`
 * so a flaky producer retry doesn't double-insert. Append-only by design:
 * the timeline is recoverable by ordering on (assignment_id, occurred_at).
 *
 * Derives `transition` server-side as `<prev_status>→<status>` (or
 * `*→<status>` when prev_status is null) so callers don't have to
 * compute it consistently. GIN-friendly index on transition lets
 * "visited→pitched" funnel queries be one lookup.
 */
export const leadAssignmentEventStore = {
  async ingest(
    input: LeadAssignmentEventInput,
  ): Promise<LeadAssignmentEventIngestResult> {
    const existing = await prisma.leadAssignmentEvent.findUnique({
      where: { eventId: input.event_id },
    });
    if (existing) {
      return {
        event_id: existing.eventId,
        inserted: false,
        row: rowToEvent(existing),
      };
    }
    const row = await prisma.leadAssignmentEvent.create({
      data: inputToCreate(input),
    });
    return {
      event_id: row.eventId,
      inserted: true,
      row: rowToEvent(row),
    };
  },

  async getById(eventId: string): Promise<LeadAssignmentEventRow | null> {
    const row = await prisma.leadAssignmentEvent.findUnique({
      where: { eventId },
    });
    return row ? rowToEvent(row) : null;
  },

  async timelineForAssignment(
    assignmentId: string,
  ): Promise<LeadAssignmentEventRow[]> {
    const rows = await prisma.leadAssignmentEvent.findMany({
      where: { assignmentId },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map(rowToEvent);
  },

  async listForLead(
    leadId: string,
    limit = 50,
  ): Promise<LeadAssignmentEventRow[]> {
    const rows = await prisma.leadAssignmentEvent.findMany({
      where: { leadId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  },

  async listForUser(
    userId: string,
    limit = 100,
  ): Promise<LeadAssignmentEventRow[]> {
    const rows = await prisma.leadAssignmentEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  },

  async listByTransition(
    transition: string,
    limit = 100,
  ): Promise<LeadAssignmentEventRow[]> {
    const rows = await prisma.leadAssignmentEvent.findMany({
      where: { transition },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type LeadAssignmentEventDb = Awaited<
  ReturnType<typeof prisma.leadAssignmentEvent.findUnique>
>;

function transitionString(
  prev: AssignmentStatus | null | undefined,
  next: AssignmentStatus,
): string {
  return `${prev ?? "*"}→${next}`;
}

function inputToCreate(
  input: LeadAssignmentEventInput,
): Prisma.LeadAssignmentEventCreateInput {
  return {
    eventId: input.event_id,
    assignmentId: input.assignment_id,
    leadId: input.lead_id,
    userId: input.user_id ?? null,
    prevStatus: input.prev_status ?? null,
    status: input.status,
    transition: transitionString(input.prev_status, input.status),
    source: input.source ?? "status_patch",
    rejectionReason: input.rejection_reason ?? null,
    commissionAmountPence: input.commission_amount_pence ?? null,
    notes: input.notes ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    occurredAt: new Date(input.occurred_at),
  };
}

function rowToEvent(
  row: NonNullable<LeadAssignmentEventDb>,
): LeadAssignmentEventRow {
  return {
    id: row.id,
    event_id: row.eventId,
    assignment_id: row.assignmentId,
    lead_id: row.leadId,
    user_id: row.userId ?? undefined,
    prev_status: row.prevStatus ?? undefined,
    status: row.status,
    transition: row.transition,
    source: row.source,
    rejection_reason: row.rejectionReason ?? undefined,
    commission_amount_pence: row.commissionAmountPence ?? undefined,
    notes: row.notes ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    occurred_at: row.occurredAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}
