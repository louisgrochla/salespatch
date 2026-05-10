import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────

export type SalespersonEventType =
  | "signup"
  | "profile_update"
  | "stripe_connect_created"
  | "stripe_connect_completed"
  | "pin_reset"
  | "deactivated"
  | "reactivated"
  // Free-form fallback so the producer can record types we haven't
  // formalised yet without an ingest-route version bump.
  | (string & {});

export type SalespersonEventSource =
  | "signup_handler"
  | "admin_panel"
  | "payments_connect"
  | "auth_demo"
  | "test"
  | (string & {});

export interface SalespersonEventInput {
  event_id: string; // <user_id>:<type>:<iso_no_colons>
  user_id: string;
  type: SalespersonEventType;
  display_name?: string | null;
  area_postcode?: string | null;
  stripe_connect_id?: string | null;
  source?: SalespersonEventSource;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  occurred_at: string; // ISO 8601
}

export interface SalespersonEventRow {
  id: string;
  event_id: string;
  user_id: string;
  type: string;
  display_name?: string;
  area_postcode?: string;
  stripe_connect_id?: string;
  source: string;
  notes?: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface SalespersonEventIngestResult {
  event_id: string;
  inserted: boolean;
  row: SalespersonEventRow;
}

/**
 * NERVE-side store for `salesperson_events`. Idempotent on caller-
 * supplied `event_id` so a flaky producer retry doesn't double-insert.
 * Append-only — corrections happen as new events with explicit source
 * and `notes` describing the correction.
 */
export const salespersonEventStore = {
  async ingest(
    input: SalespersonEventInput,
  ): Promise<SalespersonEventIngestResult> {
    const existing = await prisma.salespersonEvent.findUnique({
      where: { eventId: input.event_id },
    });
    if (existing) {
      return {
        event_id: existing.eventId,
        inserted: false,
        row: rowToEvent(existing),
      };
    }
    const row = await prisma.salespersonEvent.create({
      data: inputToCreate(input),
    });
    return {
      event_id: row.eventId,
      inserted: true,
      row: rowToEvent(row),
    };
  },

  async getById(eventId: string): Promise<SalespersonEventRow | null> {
    const row = await prisma.salespersonEvent.findUnique({
      where: { eventId },
    });
    return row ? rowToEvent(row) : null;
  },

  async timelineForUser(userId: string): Promise<SalespersonEventRow[]> {
    const rows = await prisma.salespersonEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map(rowToEvent);
  },

  async listForUser(
    userId: string,
    limit = 50,
  ): Promise<SalespersonEventRow[]> {
    const rows = await prisma.salespersonEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  },

  async listByType(
    type: SalespersonEventType,
    limit = 100,
  ): Promise<SalespersonEventRow[]> {
    const rows = await prisma.salespersonEvent.findMany({
      where: { type },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type SalespersonEventDb = Awaited<
  ReturnType<typeof prisma.salespersonEvent.findUnique>
>;

function inputToCreate(
  input: SalespersonEventInput,
): Prisma.SalespersonEventCreateInput {
  return {
    eventId: input.event_id,
    userId: input.user_id,
    type: input.type,
    displayName: input.display_name ?? null,
    areaPostcode: input.area_postcode ?? null,
    stripeConnectId: input.stripe_connect_id ?? null,
    source: input.source ?? "signup_handler",
    notes: input.notes ?? null,
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    occurredAt: new Date(input.occurred_at),
  };
}

function rowToEvent(
  row: NonNullable<SalespersonEventDb>,
): SalespersonEventRow {
  return {
    id: row.id,
    event_id: row.eventId,
    user_id: row.userId,
    type: row.type,
    display_name: row.displayName ?? undefined,
    area_postcode: row.areaPostcode ?? undefined,
    stripe_connect_id: row.stripeConnectId ?? undefined,
    source: row.source,
    notes: row.notes ?? undefined,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    occurred_at: row.occurredAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}
