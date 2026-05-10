import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { buildLearningContextForAgent } from "@/lib/sl-mas/learningContext";

// GET /api/read/decisions/learning-context?agent_id=<id>[&limit=N]
//
// D2 read side. Returns the same shape as the Pi-side
// DecisionStore.buildLearningContext so the autumn `withLearning` wrapper
// can fetch it via fetch+HMAC and inject straight into the agent prompt.
//
// HMAC pattern matches /api/read/strategies and
// /api/read/lead-profiles/winning-features:
//   - signed canonical query string in X-Read-Signature header
//   - secret = OUTCOME_INGEST_SECRET (reused)
//   - api/read is exempted from the NextAuth founder gate in middleware.ts

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const canonical = canonicalQuery(url.searchParams);

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
    const signature = req.headers.get("x-read-signature");
    if (!verifySignature(canonical, signature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const agentId = url.searchParams.get("agent_id");
  if (!agentId || agentId.length === 0) {
    return NextResponse.json(
      { error: "agent_id query parameter required" },
      { status: 400 },
    );
  }

  const limitParam = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return NextResponse.json(
        { error: `limit must be 1..${MAX_LIMIT}` },
        { status: 400 },
      );
    }
    limit = parsed;
  }

  const context = await buildLearningContextForAgent(agentId, limit);
  return NextResponse.json(context, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function canonicalQuery(params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}
