import { NextRequest, NextResponse } from "next/server";
import {
  siteBriefStore,
  type SiteBriefInput,
} from "@/lib/sl-mas/siteBriefStore";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";

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

    // RAG embedding (PR 2). Selective fields only — full brief_markdown
    // is too long and would dominate the chunk budget. The diagnosis +
    // pitch angle + verdict reasoning is what queries like "what
    // alternatives did the brief consider for vertical=X" need. Skip
    // on dup (replay) since the row is unchanged. Failure is swallowed —
    // the brief row is still queryable structurally.
    if (result.inserted) {
      try {
        const meta = result.row.metadata ?? {};
        const phaseLabel = await phaseLabelFor(
          new Date(result.row.generated_at),
        );
        await embedRecord(
          {
            sourceType: "SiteBrief",
            sourceId: result.row.id,
            phaseLabel,
            metadata: {
              section: "site-brief",
              leadId: result.row.lead_id,
              briefId: result.row.brief_id,
            },
          },
          {
            business_name: result.row.business_name,
            business_type: result.row.business_type,
            vertical: result.row.vertical,
            verdict: result.row.verdict,
            verdict_reason: result.row.verdict_reason,
            diagnosis: result.row.diagnosis,
            pitch_angle: result.row.pitch_angle,
            test_of_success: result.row.test_of_success,
            verdict_reasoning_trace:
              typeof meta.verdict_reasoning_trace === "string"
                ? meta.verdict_reasoning_trace
                : null,
            diagnosis_alternatives_considered: Array.isArray(
              meta.diagnosis_alternatives_considered,
            )
              ? JSON.stringify(meta.diagnosis_alternatives_considered)
              : null,
          },
        );
      } catch (e) {
        console.error("[site-brief] embed failed:", e);
      }
    }

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
  // Optional fields: null and undefined both mean "not supplied".
  if (
    isPresent(p.generated_at) &&
    (typeof p.generated_at !== "string" || Number.isNaN(Date.parse(p.generated_at)))
  )
    return "generated_at must be ISO timestamp";
  if (
    isPresent(p.google_rating) &&
    (typeof p.google_rating !== "number" ||
      p.google_rating < 0 ||
      p.google_rating > 5)
  )
    return "google_rating must be number in [0,5]";
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
