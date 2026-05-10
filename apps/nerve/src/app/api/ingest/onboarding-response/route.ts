import { NextRequest, NextResponse } from "next/server";
import {
  onboardingResponseStore,
  type OnboardingResponseInput,
} from "@/lib/sl-mas/onboardingResponseStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// POST /api/ingest/onboarding-response
//
// HMAC-signed mirror of the customer's post-sale onboarding form.
// Called by the sales-dashboard onboarding POST handler after the
// Supabase upsert returns the cumulative row.
//
// Idempotent via natural key (`lead_assignment_id` unique). The form
// auto-saves on every keystroke, so each ingest upserts in place — the
// row always reflects the cumulative latest state. `save_count`
// increments on each ingest for drop-off analytics.
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

  let payload: OnboardingResponseInput;
  try {
    payload = JSON.parse(raw) as OnboardingResponseInput;
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

  const result = await onboardingResponseStore.ingest(payload);
  return NextResponse.json({
    lead_assignment_id: result.lead_assignment_id,
    inserted: result.inserted,
    save_count: result.save_count,
    completed: result.completed,
    id: result.row.id,
    last_saved_at: result.row.last_saved_at,
  });
}

function validatePayload(
  p: Partial<OnboardingResponseInput>,
): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (
    typeof p.lead_assignment_id !== "string" ||
    p.lead_assignment_id.length === 0
  )
    return "lead_assignment_id required";
  if (
    isPresent(p.has_existing_domain) &&
    typeof p.has_existing_domain !== "boolean"
  )
    return "has_existing_domain must be boolean";
  if (
    isPresent(p.domain_preferences) &&
    (!Array.isArray(p.domain_preferences) ||
      !p.domain_preferences.every((s) => typeof s === "string"))
  )
    return "domain_preferences must be string[]";
  if (
    isPresent(p.photos) &&
    (!Array.isArray(p.photos) ||
      !p.photos.every(
        (e) =>
          e &&
          typeof e === "object" &&
          typeof (e as { url?: unknown }).url === "string" &&
          typeof (e as { filename?: unknown }).filename === "string",
      ))
  )
    return "photos must be [{url, filename, content_type?, uploaded_at?}]";
  if (
    isPresent(p.completed_at) &&
    (typeof p.completed_at !== "string" ||
      Number.isNaN(Date.parse(p.completed_at)))
  )
    return "completed_at must be ISO 8601 timestamp";
  if (
    isPresent(p.welcome_sent_at) &&
    (typeof p.welcome_sent_at !== "string" ||
      Number.isNaN(Date.parse(p.welcome_sent_at)))
  )
    return "welcome_sent_at must be ISO 8601 timestamp";
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
