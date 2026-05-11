import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { businessIdentityStore } from "@/lib/sl-mas/businessIdentityStore";

// GET /api/read/business-identity/lookup?name=<businessName>&postcode=<postcode>
//
// F1 read endpoint. Returns the canonical BusinessIdentity row for a
// (name, postcode) pair if one exists, or 404 if not. The skill layer
// calls this before scaffolding a new lead so that variations
// ("noose-and-needle" vs "noose-needle", "The Bandit Bakery" vs "Bandit
// Bakery") collapse onto the same canonical row regardless of how the
// founder typed the name.
//
// HMAC pattern matches /api/read/strategies + /api/read/lead-profiles/
// winning-features: signed canonical query string, X-Read-Signature header,
// OUTCOME_INGEST_SECRET. Skill calls in dev set
// OUTCOME_INGEST_ALLOW_UNSIGNED=true.

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

  const name = url.searchParams.get("name");
  const postcode = url.searchParams.get("postcode");
  if (!name || name.length === 0) {
    return NextResponse.json(
      { error: "name query parameter required" },
      { status: 400 },
    );
  }

  const row = await businessIdentityStore.lookup(name, postcode);
  if (!row) {
    return NextResponse.json(
      { found: false, normalised_query: { name, postcode } },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  return NextResponse.json(
    { found: true, identity: row },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

function canonicalQuery(params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    entries.push([key, value]);
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}
