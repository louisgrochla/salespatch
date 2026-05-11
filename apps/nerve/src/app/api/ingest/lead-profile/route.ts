import { NextRequest, NextResponse } from "next/server";
import { leadProfileStore, type LeadProfileInput } from "@/lib/sl-mas/leadProfileStore";
import { businessIdentityStore } from "@/lib/sl-mas/businessIdentityStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// POST /api/ingest/lead-profile
//
// HMAC-signed lead profile snapshot ingest. Called by:
//  - Pi `lead-profiler-agent` after a profiling run completes (autumn
//    enablement — see `src/agents/outreach/leadProfilerAgent.ts` for the
//    wire-up comment block; not active this summer).
//  - The manual `/build-demo` spec-site research workflow (skill posts
//    after assembling the brief).
//
// Idempotent on `lead_id`: re-profiling the same lead UPDATES the row in
// place — no error, no duplicate. The raw scout/profiler payloads are
// preserved verbatim for audit.
//
// /api/ingest/* is exempted from the NextAuth founder-session middleware,
// so the only auth here is the HMAC.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env) — shared with the outcome
// ingest endpoint to keep the Pi-side secret surface small.

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

  let payload: LeadProfileInput;
  try {
    payload = JSON.parse(raw) as LeadProfileInput;
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

  const row = await leadProfileStore.upsert(payload);

  // F1: keep BusinessIdentity in sync. Idempotent — collapses on
  // (normalised_name, postcode), so re-profiling the same business doesn't
  // create duplicates. Fire-and-forget pattern would be cleaner, but the
  // call is cheap enough that the await keeps the contract simple.
  await businessIdentityStore
    .lookupOrCreate({
      business_name: row.business_name,
      postcode: row.postcode ?? null,
      vertical: row.vertical ?? null,
      preferred_slug: row.lead_id,
    })
    .catch((err) => {
      console.warn(
        `[lead-profile-ingest] businessIdentity upsert failed for ${row.lead_id}:`,
        err,
      );
    });

  return NextResponse.json({
    id: row.id,
    lead_id: row.lead_id,
    profiled_at: row.profiled_at,
    updated_at: row.updated_at,
  });
}

function validatePayload(p: Partial<LeadProfileInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.lead_id !== "string" || p.lead_id.length === 0)
    return "lead_id required";
  if (typeof p.business_name !== "string" || p.business_name.length === 0)
    return "business_name required";
  // Optional fields: treat null and undefined as "not supplied". Without the
  // null check, callers get a 400 for sending JSON nulls (idiomatic for
  // unknown values), which the type contract permits.
  if (
    isPresent(p.qualifier_verdict) &&
    p.qualifier_verdict !== "qualified" &&
    p.qualifier_verdict !== "rejected" &&
    p.qualifier_verdict !== "uncertain"
  )
    return "qualifier_verdict must be qualified|rejected|uncertain";
  if (
    isPresent(p.profiled_at) &&
    (typeof p.profiled_at !== "string" || Number.isNaN(Date.parse(p.profiled_at)))
  )
    return "profiled_at must be ISO timestamp";
  if (
    isPresent(p.qualification_score) &&
    (typeof p.qualification_score !== "number" ||
      p.qualification_score < 0 ||
      p.qualification_score > 1)
  )
    return "qualification_score must be number in [0,1]";
  if (
    isPresent(p.website_quality_score) &&
    (typeof p.website_quality_score !== "number" ||
      p.website_quality_score < 0 ||
      p.website_quality_score > 100)
  )
    return "website_quality_score must be number in [0,100]";
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
