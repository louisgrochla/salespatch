import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// ── Wire-format types ────────────────────────────────────────────────────

export interface StripeEventInput {
  stripe_event_id: string; // evt_... — natural idempotency key
  type: string;
  api_version?: string | null;
  livemode?: boolean;
  account_id?: string | null;
  request_id?: string | null;
  idempotency_key?: string | null;
  // Denormalised business keys; producer extracts from event metadata.
  assignment_id?: string | null;
  salesperson_id?: string | null;
  customer_id?: string | null;
  session_id?: string | null;
  subscription_id?: string | null;
  payment_intent_id?: string | null;
  invoice_id?: string | null;
  amount_total_pence?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  body_json: Record<string, unknown>;
  occurred_at: string; // ISO 8601, from Stripe `event.created`
}

export interface StripeEventRow {
  id: string;
  stripe_event_id: string;
  type: string;
  api_version?: string;
  livemode: boolean;
  account_id?: string;
  request_id?: string;
  idempotency_key?: string;
  assignment_id?: string;
  salesperson_id?: string;
  customer_id?: string;
  session_id?: string;
  subscription_id?: string;
  payment_intent_id?: string;
  invoice_id?: string;
  amount_total_pence?: number;
  currency?: string;
  payment_status?: string;
  body_json: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
}

export interface StripeEventIngestResult {
  stripe_event_id: string;
  inserted: boolean;
  row: StripeEventRow;
}

/**
 * NERVE-side store for `stripe_events`. Idempotent on Stripe's globally
 * unique `evt_...` id — retries when Stripe re-fires after a 500 collapse
 * onto the same row. Append-only by design; corrections happen via new
 * events (Stripe never edits past events).
 *
 * Read helpers are deliberately keyed on the denormalised business fields
 * (assignmentId, sessionId, customerId, subscriptionId) so the "did this
 * pitch's payment actually settle" question is one indexed lookup.
 */
export const stripeEventStore = {
  async ingest(input: StripeEventInput): Promise<StripeEventIngestResult> {
    const existing = await prisma.stripeEvent.findUnique({
      where: { stripeEventId: input.stripe_event_id },
    });
    if (existing) {
      return {
        stripe_event_id: existing.stripeEventId,
        inserted: false,
        row: rowToEvent(existing),
      };
    }
    const row = await prisma.stripeEvent.create({
      data: inputToCreate(input),
    });
    return {
      stripe_event_id: row.stripeEventId,
      inserted: true,
      row: rowToEvent(row),
    };
  },

  async getById(stripeEventId: string): Promise<StripeEventRow | null> {
    const row = await prisma.stripeEvent.findUnique({
      where: { stripeEventId },
    });
    return row ? rowToEvent(row) : null;
  },

  async listForAssignment(
    assignmentId: string,
    limit = 50,
  ): Promise<StripeEventRow[]> {
    const rows = await prisma.stripeEvent.findMany({
      where: { assignmentId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  },

  // R2: lead-detail page needs events across every assignment a lead has
  // ever had (in case the lead has been re-assigned). Empty `assignmentIds`
  // short-circuits to avoid Prisma generating an `IN ()` Postgres syntax error.
  async listForAssignments(
    assignmentIds: string[],
    limit = 100,
  ): Promise<StripeEventRow[]> {
    if (assignmentIds.length === 0) return [];
    const rows = await prisma.stripeEvent.findMany({
      where: { assignmentId: { in: assignmentIds } },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  },

  async listByType(type: string, limit = 100): Promise<StripeEventRow[]> {
    const rows = await prisma.stripeEvent.findMany({
      where: { type },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  },

  async listForCustomer(
    customerId: string,
    limit = 50,
  ): Promise<StripeEventRow[]> {
    const rows = await prisma.stripeEvent.findMany({
      where: { customerId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  },

  async listForSession(sessionId: string): Promise<StripeEventRow[]> {
    const rows = await prisma.stripeEvent.findMany({
      where: { sessionId },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map(rowToEvent);
  },
};

// ── Mappers ──────────────────────────────────────────────────────────────

type StripeEventDb = Awaited<
  ReturnType<typeof prisma.stripeEvent.findUnique>
>;

function inputToCreate(
  input: StripeEventInput,
): Prisma.StripeEventCreateInput {
  return {
    stripeEventId: input.stripe_event_id,
    type: input.type,
    apiVersion: input.api_version ?? null,
    livemode: input.livemode ?? true,
    accountId: input.account_id ?? null,
    requestId: input.request_id ?? null,
    idempotencyKey: input.idempotency_key ?? null,
    assignmentId: input.assignment_id ?? null,
    salespersonId: input.salesperson_id ?? null,
    customerId: input.customer_id ?? null,
    sessionId: input.session_id ?? null,
    subscriptionId: input.subscription_id ?? null,
    paymentIntentId: input.payment_intent_id ?? null,
    invoiceId: input.invoice_id ?? null,
    amountTotalPence: input.amount_total_pence ?? null,
    currency: input.currency ?? null,
    paymentStatus: input.payment_status ?? null,
    bodyJson: input.body_json as Prisma.InputJsonValue,
    occurredAt: new Date(input.occurred_at),
  };
}

function rowToEvent(row: NonNullable<StripeEventDb>): StripeEventRow {
  return {
    id: row.id,
    stripe_event_id: row.stripeEventId,
    type: row.type,
    api_version: row.apiVersion ?? undefined,
    livemode: row.livemode,
    account_id: row.accountId ?? undefined,
    request_id: row.requestId ?? undefined,
    idempotency_key: row.idempotencyKey ?? undefined,
    assignment_id: row.assignmentId ?? undefined,
    salesperson_id: row.salespersonId ?? undefined,
    customer_id: row.customerId ?? undefined,
    session_id: row.sessionId ?? undefined,
    subscription_id: row.subscriptionId ?? undefined,
    payment_intent_id: row.paymentIntentId ?? undefined,
    invoice_id: row.invoiceId ?? undefined,
    amount_total_pence: row.amountTotalPence ?? undefined,
    currency: row.currency ?? undefined,
    payment_status: row.paymentStatus ?? undefined,
    body_json: row.bodyJson as Record<string, unknown>,
    occurred_at: row.occurredAt.toISOString(),
    created_at: row.createdAt.toISOString(),
  };
}
