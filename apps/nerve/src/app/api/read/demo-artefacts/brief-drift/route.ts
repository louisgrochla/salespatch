import { NextRequest, NextResponse } from "next/server";
import { demoArtefactStore } from "@/lib/sl-mas/demoArtefactStore";
import { verifySignature } from "@/lib/sl-mas/hmac";

// GET /api/read/demo-artefacts/brief-drift[?vertical=hospitality]
//
// HMAC-signed read endpoint for the brief→build photo-role drift signal.
//
// PR #80 introduced the drift shape inside
// `demo_artefacts.metadata.photo_classifications`:
//   { filename: { role, brief_role, drift } }
// Legacy rows (pre-#80 Blackbird/Nevermind/Cult-of-Coffee) carry the
// older flat shape `{ filename: role_string }` — this endpoint counts
// those toward `no_brief_role_count` because there was no commitment to
// drift against.
//
// Lets the AI layer query "for vertical=barber, what fraction of
// brief.product_close survives to demo.product_close?" without parsing
// rendered HTML or running ad-hoc warehouse SQL.
//
// HMAC pattern mirrors /api/read/strategies — same secret
// (OUTCOME_INGEST_SECRET), same canonical-string signing, just the
// canonical string is the sorted query string. Kept behind HMAC because
// the drift breakdown leaks our learning loop's evidence base, not
// aggregate dissertation signal.

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

  const summary = await demoArtefactStore.briefDriftSummary(vertical);

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
