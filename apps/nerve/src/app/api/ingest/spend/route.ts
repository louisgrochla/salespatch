import { NextRequest, NextResponse } from "next/server";
import {
  spendLedgerStore,
  type SpendLedgerInput,
} from "@/lib/sl-mas/spendLedgerStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// POST /api/ingest/spend
//
// HMAC-signed per-call API spend ingest. Pi runtime calls this fire-and-
// forget after each successful (or failed) outbound API call to a paid
// provider — OpenRouter, Apify, Google Places, etc.
//
// /api/ingest/* is exempt from the NextAuth founder-session middleware,
// so the only auth here is the HMAC.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env) — reused; one HMAC secret
//         covers all ingest endpoints to keep Pi/NERVE config simple.

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

  let payload: SpendLedgerInput;
  try {
    payload = JSON.parse(raw) as SpendLedgerInput;
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
    const row = await spendLedgerStore.record(payload);
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    return NextResponse.json(
      { error: `record failed: ${String(e)}` },
      { status: 500 },
    );
  }
}

function validatePayload(p: Partial<SpendLedgerInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.provider !== "string" || p.provider.length === 0)
    return "provider required";
  if (typeof p.cost_usd !== "number" || !Number.isFinite(p.cost_usd))
    return "cost_usd required (finite number)";
  if (p.cost_usd < 0) return "cost_usd must be >= 0";
  if (typeof p.occurred_at !== "string" || Number.isNaN(Date.parse(p.occurred_at)))
    return "occurred_at must be ISO timestamp";
  return undefined;
}
