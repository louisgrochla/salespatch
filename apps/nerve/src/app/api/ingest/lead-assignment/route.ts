import { NextRequest, NextResponse } from "next/server";
import {
  leadAssignmentEventStore,
  VALID_STATUSES,
  type LeadAssignmentEventInput,
} from "@/lib/sl-mas/leadAssignmentEventStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// POST /api/ingest/lead-assignment
//
// HMAC-signed Tier 2 funnel event ingest. Called by the sales-dashboard
// status PATCH + pitch cascade handlers after the Supabase write succeeds
// (and eventually by a Supabase realtime poller for paths that bypass
// our own API, e.g. webhook-driven status changes from Stripe).
//
// Idempotent on `event_id` (caller convention: `<assignmentId>:<status>:
// <iso_no_colons>`). Retries from a flaky network round-trip collapse
// onto the same row.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (shared with the other ingest endpoints
// to keep the producer-side secret surface to one entry).
//
// Append-only — no UPDATE path. A future correction would be a new event
// with source="backfill" and an explicit prev_status.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const signature = req.headers.get("x-ingest-signature");
  const secret = process.env.OUTCOME_INGEST_SECRET;
  const allowUnsigned =
    process.env.NODE_ENV !== "production" &&
    process.env.OUTCOME_INGEST_ALLOW_UNSIGNED === "true";

  if (!allowUnsigned) {
    if (!secret) {
      return NextResponse.json(
        { error: "OUTCOME_INGEST_SECRET not configured" },
        { status: 503 },
      );
    }
    if (!verifySignature(raw, signature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let payload: LeadAssignmentEventInput;
  try {
    payload = JSON.parse(raw) as LeadAssignmentEventInput;
  } catch (e) {
    return NextResponse.json(
      { error: `bad json: ${String(e)}` },
      { status: 400 },
    );
  }

  const validation = validatePayload(payload);
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  const result = await leadAssignmentEventStore.ingest(payload);
  return NextResponse.json({
    event_id: result.event_id,
    inserted: result.inserted,
    id: result.row.id,
    assignment_id: result.row.assignment_id,
    transition: result.row.transition,
    occurred_at: result.row.occurred_at,
  });
}

function validatePayload(
  p: Partial<LeadAssignmentEventInput>,
): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.event_id !== "string" || p.event_id.length === 0)
    return "event_id required";
  if (typeof p.assignment_id !== "string" || p.assignment_id.length === 0)
    return "assignment_id required";
  if (typeof p.lead_id !== "string" || p.lead_id.length === 0)
    return "lead_id required";
  if (typeof p.status !== "string")
    return "status required";
  if (!VALID_STATUSES.includes(p.status as (typeof VALID_STATUSES)[number]))
    return `status must be one of: ${VALID_STATUSES.join(", ")}`;
  if (
    isPresent(p.prev_status) &&
    !VALID_STATUSES.includes(
      p.prev_status as (typeof VALID_STATUSES)[number],
    )
  )
    return `prev_status must be one of: ${VALID_STATUSES.join(", ")} or null`;
  if (
    typeof p.occurred_at !== "string" ||
    Number.isNaN(Date.parse(p.occurred_at))
  )
    return "occurred_at must be ISO 8601 timestamp";
  if (
    isPresent(p.commission_amount_pence) &&
    (typeof p.commission_amount_pence !== "number" ||
      p.commission_amount_pence < 0 ||
      !Number.isFinite(p.commission_amount_pence))
  )
    return "commission_amount_pence must be a non-negative number";
  if (
    isPresent(p.latitude) &&
    (typeof p.latitude !== "number" ||
      p.latitude < -90 ||
      p.latitude > 90)
  )
    return "latitude must be number in [-90, 90]";
  if (
    isPresent(p.longitude) &&
    (typeof p.longitude !== "number" ||
      p.longitude < -180 ||
      p.longitude > 180)
  )
    return "longitude must be number in [-180, 180]";
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
