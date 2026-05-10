import { NextRequest, NextResponse } from "next/server";
import {
  qaResultStore,
  type QaResultInput,
} from "@/lib/sl-mas/qaResultStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// POST /api/ingest/qa-result
//
// HMAC-signed site-QA result ingest. Called from the autumn Pi
// `siteQaAgent` after every QA pass, or from a manual review tool.
// Stores per-artefact QA scores (HTML validity, accessibility, contrast,
// performance) plus an overall pass/fail so the analytics layer can
// answer "do high-QA demos close better?".
//
// /api/ingest/* is exempt from the NextAuth founder-session middleware,
// so the only auth here is the HMAC. Shares OUTCOME_INGEST_SECRET with
// the rest of the SL-MAS ingest endpoints.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env)
//
// Idempotent on `qa_id` (caller-supplied, conventional format
// `<artefact_id>-qa-<iso_no_colons>`). Replay returns 200 with
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

  let payload: QaResultInput;
  try {
    payload = JSON.parse(raw) as QaResultInput;
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
    const result = await qaResultStore.ingest(payload);
    return NextResponse.json({
      qa_id: result.qa_id,
      inserted: result.inserted,
      id: result.row.id,
      passed: result.row.passed,
      score: result.row.score,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `ingest failed: ${String(e)}` },
      { status: 500 },
    );
  }
}

function validatePayload(p: Partial<QaResultInput>): string | undefined {
  if (!p || typeof p !== "object") return "payload required";
  if (typeof p.qa_id !== "string" || p.qa_id.length === 0)
    return "qa_id required";
  if (typeof p.artefact_id !== "string" || p.artefact_id.length === 0)
    return "artefact_id required";
  if (typeof p.lead_id !== "string" || p.lead_id.length === 0)
    return "lead_id required";
  if (typeof p.score !== "number" || p.score < 0 || p.score > 100)
    return "score required (number in [0,100])";
  if (typeof p.passed !== "boolean") return "passed required (boolean)";
  // Optional fields: null and undefined both mean "not supplied".
  if (
    isPresent(p.ran_at) &&
    (typeof p.ran_at !== "string" || Number.isNaN(Date.parse(p.ran_at)))
  )
    return "ran_at must be ISO timestamp";
  for (const k of [
    "accessibility_score",
    "contrast_score",
    "performance_score",
  ] as const) {
    const v = p[k];
    if (isPresent(v) && (typeof v !== "number" || v < 0 || v > 100))
      return `${k} must be number in [0,100]`;
  }
  for (const k of ["html_warnings", "html_errors"] as const) {
    const v = p[k];
    if (isPresent(v) && (typeof v !== "number" || v < 0))
      return `${k} must be non-negative number`;
  }
  return undefined;
}

function isPresent<T>(v: T | undefined | null): v is T {
  return v !== undefined && v !== null;
}
