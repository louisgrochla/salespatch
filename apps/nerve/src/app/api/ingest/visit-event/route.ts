import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import {
  visitEventStore,
  VALID_TYPES,
  type VisitEventInput,
  type VisitEventType,
} from "@/lib/sl-mas/visitEventStore";

// POST /api/ingest/visit-event
//
// R9 — HMAC-signed Phase B mirror for SP visit events. Called by the
// mobile-api `POST /visits` and `PATCH /visits/:id` handlers after the
// local SQLite + Supabase writes succeed (fire-and-forget — NERVE
// failure must not surface to the SP).
//
// Idempotent on `event_id` (caller convention: `<assignmentId>:<type>:
// <iso_no_colons>`). Retries collapse onto the same row.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (shared with the other Phase B endpoints
// to keep the producer secret surface to one entry).
//
// Auto-embeds the `feedback` field on rows where it's present so the
// chunk reaches /ask, /search, and the per-lead scoped chat (R3 +
// getLeadSourceIds, extended in R9). The embedding's `phaseLabel` is
// derived from `occurred_at` so dissertation-phase auditability is
// preserved without VisitEvent itself carrying a phaseLabel column.

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

  let payload: VisitEventInput;
  try {
    payload = JSON.parse(raw) as VisitEventInput;
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

  const result = await visitEventStore.ingest(payload);

  // Embed the feedback text when present. Only embed on the insert path —
  // re-asserts would re-embed identical text. embedRecord is itself
  // idempotent (deletes-then-inserts) so this is a defensive optimisation
  // rather than a correctness requirement.
  if (result.inserted && result.row.feedback && result.row.feedback.trim().length > 0) {
    try {
      const phaseLabel = await phaseLabelFor(new Date(result.row.occurred_at));
      await embedRecord(
        {
          sourceType: "VisitEvent",
          sourceId: result.row.id,
          phaseLabel,
          metadata: {
            section: "visit-feedback",
            leadId: result.row.lead_id,
            userId: result.row.user_id,
            type: result.row.type,
            assignmentId: result.row.assignment_id,
          },
        },
        {
          feedback: result.row.feedback,
          rating: result.row.rating,
          type: result.row.type,
          occurredAt: result.row.occurred_at,
        },
      );
    } catch (e) {
      // Embedding failure must not block the ingest — the row is still
      // queryable via /leads ops view + the per-lead scoped chat can
      // re-embed on a future save. Surfaced via the same /system page
      // as other embed failures.
      console.error("[visit-event] embed failed:", e);
    }
  }

  return NextResponse.json({
    event_id: result.event_id,
    inserted: result.inserted,
    id: result.row.id,
    type: result.row.type,
    occurred_at: result.row.occurred_at,
  });
}

function validatePayload(p: Partial<VisitEventInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.event_id !== "string" || p.event_id.length === 0)
    return "event_id required";
  if (typeof p.assignment_id !== "string" || p.assignment_id.length === 0)
    return "assignment_id required";
  if (typeof p.lead_id !== "string" || p.lead_id.length === 0)
    return "lead_id required";
  if (typeof p.user_id !== "string" || p.user_id.length === 0)
    return "user_id required";
  if (typeof p.type !== "string") return "type required";
  if (!VALID_TYPES.includes(p.type as VisitEventType))
    return `type must be one of: ${VALID_TYPES.join(", ")}`;
  if (
    typeof p.occurred_at !== "string" ||
    Number.isNaN(Date.parse(p.occurred_at))
  )
    return "occurred_at must be ISO 8601 timestamp";
  if (
    isPresent(p.duration_minutes) &&
    (typeof p.duration_minutes !== "number" ||
      p.duration_minutes < 0 ||
      !Number.isFinite(p.duration_minutes))
  )
    return "duration_minutes must be non-negative number";
  if (
    isPresent(p.rating) &&
    (typeof p.rating !== "number" ||
      p.rating < 1 ||
      p.rating > 5 ||
      !Number.isInteger(p.rating))
  )
    return "rating must be integer in [1, 5]";
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
  if (isPresent(p.feedback) && typeof p.feedback !== "string")
    return "feedback must be string when present";
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
