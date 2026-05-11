import { NextRequest, NextResponse } from "next/server";
import {
  pitchBriefStore,
  type PitchBriefInput,
} from "@/lib/sl-mas/pitchBriefStore";
import { businessIdentityStore } from "@/lib/sl-mas/businessIdentityStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// POST /api/ingest/pitch-brief
//
// HMAC-signed pitch-brief ingest. Called fire-and-forget from the manual
// `/lead-json` skill after the salesperson playbook (hook, opener,
// demo_moments, close_script, objections, lead-card surface) has been
// written to disk. The skill keeps emitting the local submit folder as
// before; this endpoint just mirrors the playbook into NERVE Postgres so
// the warehouse holds the prescription side of "did this pitch close".
//
// /api/ingest/* is exempt from the NextAuth founder-session middleware,
// so the only auth here is the HMAC. Shares OUTCOME_INGEST_SECRET with
// the rest of the SL-MAS ingest endpoints.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env)
//
// Idempotent on `pitch_brief_id` (caller-supplied, conventional format
// `<lead_slug>-pitch-<iso_no_colons>`). Replay returns 200 with
// inserted=false.

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

  let payload: PitchBriefInput;
  try {
    payload = JSON.parse(raw) as PitchBriefInput;
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

  try {
    const result = await pitchBriefStore.ingest(payload);

    // F1: keep BusinessIdentity in sync. Fire-and-forget — pitch-brief
    // write is the source of truth, canonical row is bookkeeping.
    await businessIdentityStore
      .lookupOrCreate({
        business_name: result.row.business_name,
        postcode: result.row.postcode,
        vertical: result.row.vertical,
        preferred_slug: result.row.lead_id,
      })
      .catch((err) => {
        console.warn(
          `[pitch-brief-ingest] businessIdentity upsert failed for ${result.row.lead_id}:`,
          err,
        );
      });

    return NextResponse.json({
      pitch_brief_id: result.pitch_brief_id,
      inserted: result.inserted,
      id: result.row.id,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `ingest failed: ${String(e)}` },
      { status: 500 },
    );
  }
}

function validatePayload(p: Partial<PitchBriefInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.pitch_brief_id !== "string" || p.pitch_brief_id.length === 0)
    return "pitch_brief_id required";
  if (typeof p.lead_id !== "string" || p.lead_id.length === 0)
    return "lead_id required";
  if (typeof p.business_name !== "string" || p.business_name.length === 0)
    return "business_name required";
  // Optional fields: null and undefined both mean "not supplied".
  if (
    isPresent(p.generated_at) &&
    (typeof p.generated_at !== "string" ||
      Number.isNaN(Date.parse(p.generated_at)))
  )
    return "generated_at must be ISO timestamp";
  // Loose array validation — null/undefined OK, but if present must be array.
  for (const field of [
    "services",
    "pain_points",
    "opening_hours",
    "trust_badges",
    "avoid_topics",
    "demo_moments",
  ] as const) {
    const v = p[field];
    if (isPresent(v) && !Array.isArray(v))
      return `${field} must be string[] when present`;
  }
  if (isPresent(p.specific_objections) && !Array.isArray(p.specific_objections))
    return "specific_objections must be array of {objection, response}";
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
