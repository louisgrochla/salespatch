import { NextRequest, NextResponse } from "next/server";
import { qaResultStore } from "@/lib/sl-mas/qaResultStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// GET /api/read/qa-results/by-outcome[?vertical=hospitality]
//
// HMAC-signed read endpoint that closes the QA-to-outcome learning loop.
//
// Methodology:
//   - One QA score per artefact (latest by ran_at)
//   - One outcome per lead (latest lead_assignment_events.status)
//   - Buckets scores into closed / rejected / pitched_pending /
//     visited_no_pitch / no_visit
//   - Optional vertical filter via demo_artefacts.vertical
//
// Until at least one bucket reaches n>=10, the response carries a
// `sample_size_warning`. With zero closed leads in the warehouse today
// the endpoint will mostly return nulls — the loop activates as outcomes
// land in lead_assignment_events.
//
// HMAC pattern mirrors /api/read/strategies + /api/read/demo-artefacts/
// brief-drift — same secret (OUTCOME_INGEST_SECRET), same canonical-
// query-string signing.

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

  const vertical = url.searchParams.get("vertical") ?? undefined;

  const summary = await qaResultStore.byOutcome(vertical);

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

// Canonical query string: keys sorted alphabetically, joined with "&".
// Empty string for no params. Matches /api/read/strategies.
function canonicalQuery(params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}
