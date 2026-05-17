import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────
//
// snake_case to match the rest of the Phase B / R8 ingest payloads
// (leadAssignmentEventStore, stripeEventStore, salespersonEventStore).

export type VisitEventType = "arrived" | "departed" | "pitched" | "feedback";

export const VALID_TYPES: ReadonlyArray<VisitEventType> = [
  "arrived",
  "departed",
  "pitched",
  "feedback",
];

export interface VisitEventInput {
  event_id: string;
  assignment_id: string;
  lead_id: string;
  user_id: string;
  type: VisitEventType;
  duration_minutes?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  feedback?: string | null;
  rating?: number | null;
  metadata?: Record<string, unknown>;
  occurred_at: string; // ISO 8601
}

export interface VisitEventRow {
  id: string;
  event_id: string;
  assignment_id: string;
  lead_id: string;
  user_id: string;
  type: string;
  duration_minutes: number | null;
  latitude: number | null;
  longitude: number | null;
  feedback: string | null;
  rating: number | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface VisitEventIngestResult {
  event_id: string;
  inserted: boolean;
  row: VisitEventRow;
}

export interface VisitAggregate {
  lead_id: string;
  total_duration_minutes: number;
  visit_count: number;
  feedback_count: number;
  latest_occurred_at: Date | null;
}

/**
 * NERVE-side store for `visit_events`. Idempotent on `event_id` so a flaky
 * producer retry doesn't double-insert. Append-only by design — multiple
 * arrived/departed pairs per assignment are how the SP records multiple
 * trips to the same lead.
 *
 * Pattern mirrors `leadAssignmentEventStore` (Phase B1) — see that file
 * for the rationale on the immutable-event shape and the natural-key
 * idempotency.
 */
export const visitEventStore = {
  async ingest(input: VisitEventInput): Promise<VisitEventIngestResult> {
    const existing = await prisma.visitEvent.findUnique({
      where: { eventId: input.event_id },
    });
    if (existing) {
      return {
        event_id: existing.eventId,
        inserted: false,
        row: rowToWire(existing),
      };
    }
    const row = await prisma.visitEvent.create({
      data: inputToCreate(input),
    });
    return {
      event_id: row.eventId,
      inserted: true,
      row: rowToWire(row),
    };
  },

  async getById(eventId: string): Promise<VisitEventRow | null> {
    const row = await prisma.visitEvent.findUnique({
      where: { eventId },
    });
    return row ? rowToWire(row) : null;
  },

  async listForLead(leadId: string, limit = 50): Promise<VisitEventRow[]> {
    const rows = await prisma.visitEvent.findMany({
      where: { leadId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToWire);
  },

  async listForAssignment(
    assignmentId: string,
    limit = 50,
  ): Promise<VisitEventRow[]> {
    const rows = await prisma.visitEvent.findMany({
      where: { assignmentId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToWire);
  },

  /**
   * Sum `duration_minutes` and count feedback rows across every visit
   * tied to this lead. Returns null on `total_duration_minutes` when no
   * "departed" event exists yet (visit still open) so the caller can
   * render `—` instead of `0m`.
   */
  async aggregateForLead(leadId: string): Promise<VisitAggregate> {
    const rows = await prisma.visitEvent.findMany({
      where: { leadId },
      select: {
        durationMinutes: true,
        type: true,
        feedback: true,
        occurredAt: true,
      },
    });
    let totalDuration = 0;
    let feedbackCount = 0;
    let latest: Date | null = null;
    for (const r of rows) {
      if (typeof r.durationMinutes === "number") totalDuration += r.durationMinutes;
      if (r.type === "feedback" || (r.feedback && r.feedback.trim().length > 0)) {
        feedbackCount += 1;
      }
      if (!latest || r.occurredAt > latest) latest = r.occurredAt;
    }
    return {
      lead_id: leadId,
      total_duration_minutes: totalDuration,
      visit_count: rows.length,
      feedback_count: feedbackCount,
      latest_occurred_at: latest,
    };
  },

  /**
   * Per-lead aggregate across every lead that has at least one visit
   * event. The leads ops view fans out one row per business — this lets
   * us populate the visit-time + feedback-count cells without N+1ing.
   */
  async aggregateAcrossLeads(): Promise<Map<string, VisitAggregate>> {
    const rows = await prisma.visitEvent.findMany({
      select: {
        leadId: true,
        durationMinutes: true,
        type: true,
        feedback: true,
        occurredAt: true,
      },
    });
    const out = new Map<string, VisitAggregate>();
    for (const r of rows) {
      const acc =
        out.get(r.leadId) ?? {
          lead_id: r.leadId,
          total_duration_minutes: 0,
          visit_count: 0,
          feedback_count: 0,
          latest_occurred_at: null as Date | null,
        };
      acc.visit_count += 1;
      if (typeof r.durationMinutes === "number") {
        acc.total_duration_minutes += r.durationMinutes;
      }
      if (r.type === "feedback" || (r.feedback && r.feedback.trim().length > 0)) {
        acc.feedback_count += 1;
      }
      if (!acc.latest_occurred_at || r.occurredAt > acc.latest_occurred_at) {
        acc.latest_occurred_at = r.occurredAt;
      }
      out.set(r.leadId, acc);
    }
    return out;
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type VisitEventDb = Awaited<
  ReturnType<typeof prisma.visitEvent.findUnique>
>;

function inputToCreate(
  input: VisitEventInput,
): Prisma.VisitEventCreateInput {
  return {
    eventId: input.event_id,
    assignmentId: input.assignment_id,
    leadId: input.lead_id,
    userId: input.user_id,
    type: input.type,
    durationMinutes: input.duration_minutes ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    feedback: input.feedback ?? null,
    rating: input.rating ?? null,
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    occurredAt: new Date(input.occurred_at),
  };
}

function rowToWire(row: NonNullable<VisitEventDb>): VisitEventRow {
  return {
    id: row.id,
    event_id: row.eventId,
    assignment_id: row.assignmentId,
    lead_id: row.leadId,
    user_id: row.userId,
    type: row.type,
    duration_minutes: row.durationMinutes,
    latitude: row.latitude,
    longitude: row.longitude,
    feedback: row.feedback,
    rating: row.rating,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    occurred_at: row.occurredAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}
