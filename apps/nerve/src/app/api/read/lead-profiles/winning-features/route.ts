import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { winningFeaturesForVertical } from "@/lib/sl-mas/winningFeatures";

// GET /api/read/lead-profiles/winning-features?vertical=barber
//
// Aggregates the lead-profile feature distribution across leads in
// `vertical` that have a closed PitchLog row. Returns medians + rates +
// top categories + a handful of example winners.
//
// Same HMAC pattern as /api/read/strategies — signed canonical query
// string, X-Read-Signature header, OUTCOME_INGEST_SECRET.
//
// If the vertical has zero closed pitches, the endpoint returns
// `data_available: false` with `total_profiled` so the caller can tell
// "no signal yet, but here's how many leads we've seen" apart from
// "vertical doesn't exist".

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

  const vertical = url.searchParams.get("vertical");
  if (!vertical || vertical.length === 0) {
    return NextResponse.json(
      { error: "vertical query parameter required" },
      { status: 400 },
    );
  }

  const summary = await winningFeaturesForVertical(vertical);
  return NextResponse.json(summary, {
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
