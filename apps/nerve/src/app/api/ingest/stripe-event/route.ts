import { NextRequest, NextResponse } from "next/server";
import {
  stripeEventStore,
  type StripeEventInput,
} from "@/lib/sl-mas/stripeEventStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// POST /api/ingest/stripe-event
//
// HMAC-signed Tier 2 Stripe event mirror. Called by the sales-dashboard
// payment webhook after it verifies the Stripe signature, before it
// dispatches to local handlers. Fire-and-forget — Stripe's own retry
// and the dashboard's local stripe_events idempotency table own the
// "did the payment actually settle" decision; NERVE just gets the
// complete event log.
//
// Idempotent on Stripe's globally unique `evt_...` ID — retries when
// Stripe re-fires after a 500 collapse onto the same row.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (shared with the other ingest endpoints
// so the producer-side secret surface stays at one entry).

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

  let payload: StripeEventInput;
  try {
    payload = JSON.parse(raw) as StripeEventInput;
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

  const result = await stripeEventStore.ingest(payload);
  return NextResponse.json({
    stripe_event_id: result.stripe_event_id,
    inserted: result.inserted,
    id: result.row.id,
    type: result.row.type,
    occurred_at: result.row.occurred_at,
  });
}

function validatePayload(p: Partial<StripeEventInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (
    typeof p.stripe_event_id !== "string" ||
    p.stripe_event_id.length === 0
  )
    return "stripe_event_id required";
  if (typeof p.type !== "string" || p.type.length === 0)
    return "type required";
  if (
    typeof p.occurred_at !== "string" ||
    Number.isNaN(Date.parse(p.occurred_at))
  )
    return "occurred_at must be ISO 8601 timestamp";
  if (!p.body_json || typeof p.body_json !== "object")
    return "body_json required";
  if (
    isPresent(p.amount_total_pence) &&
    (typeof p.amount_total_pence !== "number" ||
      p.amount_total_pence < 0 ||
      !Number.isFinite(p.amount_total_pence))
  )
    return "amount_total_pence must be a non-negative number";
  if (
    isPresent(p.livemode) &&
    typeof p.livemode !== "boolean"
  )
    return "livemode must be boolean";
  if (
    isPresent(p.currency) &&
    (typeof p.currency !== "string" || p.currency.length === 0)
  )
    return "currency must be a non-empty string";
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
