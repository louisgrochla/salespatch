import { NextRequest, NextResponse } from "next/server";
import {
  siteBriefStore,
  type SiteBriefInput,
} from "@/lib/sl-mas/siteBriefStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// POST /api/ingest/site-brief
//
// HMAC-signed site-brief ingest. Called fire-and-forget from the manual
// `spec-site-brief` skill (or the autumn Pi `brief-generator-agent`) after
// the brief markdown has been written to disk. Stores the full markdown
// body inline plus the structured fields the AI layer wants directly
// queryable (verdict, diagnosis, pitch angle, blueprint sections).
//
// /api/ingest/* is exempt from the NextAuth founder-session middleware,
// so the only auth here is the HMAC. Shares OUTCOME_INGEST_SECRET with
// the rest of the SL-MAS ingest endpoints.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env)
//
// Idempotent on `brief_id` (caller-supplied, conventional format
// `<lead_slug>-<iso_no_colons>`). Replay returns 200 with inserted=false.

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

  let payload: SiteBriefInput;
  try {
    payload = JSON.parse(raw) as SiteBriefInput;
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
    const result = await siteBriefStore.ingest(payload);
    return NextResponse.json({
      brief_id: result.brief_id,
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

function validatePayload(p: Partial<SiteBriefInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.brief_id !== "string" || p.brief_id.length === 0)
    return "brief_id required";
  if (typeof p.lead_id !== "string" || p.lead_id.length === 0)
    return "lead_id required";
  if (typeof p.business_name !== "string" || p.business_name.length === 0)
    return "business_name required";
  if (typeof p.verdict !== "string" || p.verdict.length === 0)
    return "verdict required";
  if (typeof p.brief_markdown !== "string" || p.brief_markdown.length === 0)
    return "brief_markdown required";
  if (
    p.generated_at !== undefined &&
    (typeof p.generated_at !== "string" || Number.isNaN(Date.parse(p.generated_at)))
  )
    return "generated_at must be ISO timestamp";
  if (
    p.google_rating !== undefined &&
    (typeof p.google_rating !== "number" ||
      p.google_rating < 0 ||
      p.google_rating > 5)
  )
    return "google_rating must be number in [0,5]";
  return undefined;
}
