import { NextRequest, NextResponse } from "next/server";
import { strategicStore } from "@/lib/sl-mas/strategicStore";
import { verifySignature } from "@/lib/sl-mas/hmac";
import type { StrategyStatus } from "@/lib/sl-mas/types";

// GET /api/read/strategies?vertical=barber[&region=Aberdeen][&status=champion]
//
// HMAC-signed read endpoint for SL-MAS strategy rows. Read companion to
// /api/ingest/* — same secret (OUTCOME_INGEST_SECRET), same canonical-string
// signing pattern, just the canonical string is the sorted query string
// instead of the JSON body.
//
// Built for the manual /build-demo skill to consult winning design
// combinations before generating a demo (D1 of NERVE-ROADMAP.md). Kept
// behind HMAC rather than /api/public/* because the parameter+close-rate
// data is competitively meaningful, not aggregate dissertation signal.

const VALID_STATUSES: ReadonlyArray<StrategyStatus> = [
  "new",
  "testing",
  "active",
  "champion",
  "deprecated",
];

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
  const region = url.searchParams.get("region") ?? undefined;
  const statusParam = url.searchParams.get("status") ?? undefined;
  const status = statusParam
    ? VALID_STATUSES.find((s) => s === statusParam)
    : undefined;

  if (statusParam && !status) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  // If a vertical is supplied, use getRelevant — it applies the lifecycle
  // priority sort the strategicStore is designed around (champion > active
  // > testing > new), which is exactly what a skill consulting "what's
  // winning" wants. Without vertical, fall back to list with optional
  // status filter.
  const strategies = vertical
    ? await strategicStore.getRelevant(vertical, region, 50)
    : await strategicStore.list({ status });

  const filtered = status
    ? strategies.filter((s) => s.status === status)
    : strategies;

  return NextResponse.json(
    {
      vertical: vertical ?? null,
      region: region ?? null,
      status_filter: status ?? null,
      count: filtered.length,
      strategies: filtered,
      generated_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

// Canonical query string: keys sorted alphabetically, joined with "&".
// Empty query string for no params. Mirrors how `verifySignature` treats
// the POST body as a single canonical string.
function canonicalQuery(params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}
