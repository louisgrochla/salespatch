import { NextRequest, NextResponse } from "next/server";
import {
  salespersonEventStore,
  type SalespersonEventInput,
} from "@/lib/sl-mas/salespersonEventStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// POST /api/ingest/salesperson-event
//
// HMAC-signed Tier 2 SP lifecycle event ingest. Called by the sales-
// dashboard signup handler, admin profile-edit handler, and payments-
// connect handler after the source-of-truth write succeeds.
//
// Idempotent on caller-supplied `event_id` (convention:
// `<user_id>:<type>:<iso_no_colons>`). Retries collapse onto the same
// row.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (shared with all other ingest endpoints).

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

  let payload: SalespersonEventInput;
  try {
    payload = JSON.parse(raw) as SalespersonEventInput;
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

  const result = await salespersonEventStore.ingest(payload);
  return NextResponse.json({
    event_id: result.event_id,
    inserted: result.inserted,
    id: result.row.id,
    user_id: result.row.user_id,
    type: result.row.type,
    occurred_at: result.row.occurred_at,
  });
}

function validatePayload(
  p: Partial<SalespersonEventInput>,
): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.event_id !== "string" || p.event_id.length === 0)
    return "event_id required";
  if (typeof p.user_id !== "string" || p.user_id.length === 0)
    return "user_id required";
  if (typeof p.type !== "string" || p.type.length === 0)
    return "type required";
  if (
    typeof p.occurred_at !== "string" ||
    Number.isNaN(Date.parse(p.occurred_at))
  )
    return "occurred_at must be ISO 8601 timestamp";
  return undefined;
}
