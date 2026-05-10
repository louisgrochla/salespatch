import { NextRequest, NextResponse } from "next/server";
import { outcomeIngester } from "@/lib/sl-mas/outcomeIngest";
import { verifySignature } from "@/lib/sl-mas/hmac";
import type {
  OutcomeIngestPayload,
  OutcomeIngestResult,
} from "@/lib/sl-mas/types";

// POST /api/ingest/outcome
//
// HMAC-signed outcome ingest. Called by external sources that produce
// pitch outcomes — sales-dashboard admin tools, Supabase poller running
// elsewhere, etc. NERVE's own pitch webhook (apps/nerve/src/app/api/ingest/
// pitch/route.ts) calls outcomeIngester.ingest() directly without going
// through this HTTP hop.
//
// /api/ingest/* is exempted from the NextAuth founder-session middleware,
// so the only auth here is the HMAC.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env)

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

  let payload: OutcomeIngestPayload;
  try {
    payload = JSON.parse(raw) as OutcomeIngestPayload;
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

  const result: OutcomeIngestResult = await outcomeIngester.ingest(payload);
  return NextResponse.json(result);
}

function validatePayload(p: Partial<OutcomeIngestPayload>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.source !== "string") return "source required";
  if (typeof p.external_id !== "string" || p.external_id.length === 0)
    return "external_id required";
  if (typeof p.outcome_type !== "string") return "outcome_type required";
  if (p.result !== "positive" && p.result !== "negative" && p.result !== "neutral")
    return "result must be positive|negative|neutral";
  if (typeof p.occurred_at !== "string" || Number.isNaN(Date.parse(p.occurred_at)))
    return "occurred_at must be ISO timestamp";
  if (!p.lead_id && !p.business_name)
    return "lead_id or business_name required for matching";
  return undefined;
}
