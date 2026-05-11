import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { siteBriefStore } from "@/lib/sl-mas/siteBriefStore";
import { demoArtefactStore } from "@/lib/sl-mas/demoArtefactStore";
import { pitchBriefStore } from "@/lib/sl-mas/pitchBriefStore";
import { brandAnalysisStore } from "@/lib/sl-mas/brandAnalysisStore";
import { leadProfileStore } from "@/lib/sl-mas/leadProfileStore";
import { qaResultStore } from "@/lib/sl-mas/qaResultStore";
import { businessIdentityStore } from "@/lib/sl-mas/businessIdentityStore";

// GET /api/read/lead-bundle?slug=<canonical_slug>
//
// F2(c) read endpoint. Returns the full lead bundle for a single slug so
// the admin import handler can construct a sales-dashboard-shaped
// `lead_assignments.notes` JSON in one round-trip. Separate from
// /api/read/pending-assignments because that listing intentionally
// strips heavy bodies (demo HTML, brief markdown) to keep the queue
// fast — the import path needs them.
//
// Bundle composition:
//   - business_identity (F1 canonical row if it exists)
//   - site_brief        (latest, full markdown)
//   - demo_artefact     (latest, full html_inline)
//   - pitch_brief       (latest /lead-json playbook)
//   - brand_analysis    (latest, palette + typography + voice)
//   - lead_profile      (the upsert row)
//   - qa_result         (latest for the demo_artefact)
//
// All sections are independent — any one may be missing. The admin
// import handler decides what to do with each based on shape.
//
// Same HMAC pattern as /api/read/pending-assignments + the other
// /api/read/* endpoints: canonical query string signed with
// OUTCOME_INGEST_SECRET, sent as X-Read-Signature header.

export const dynamic = "force-dynamic";

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

  const slug = url.searchParams.get("slug");
  if (!slug || slug.length === 0) {
    return NextResponse.json(
      { error: "slug query parameter required" },
      { status: 400 },
    );
  }

  const [
    identity,
    latestBrief,
    latestDemo,
    latestPitch,
    leadProfile,
  ] = await Promise.all([
    businessIdentityStore.findBySlug(slug),
    siteBriefStore.latestForLead(slug),
    demoArtefactStore.latestForLead(slug),
    pitchBriefStore.latestForLead(slug),
    leadProfileStore.getByLeadId(slug),
  ]);

  // Brand analysis: prefer the one keyed on the latest brief, fall back
  // to the most recent for the lead. Same heuristic the E1 lead viewer
  // page uses.
  const brandAnalysis = latestBrief
    ? (await brandAnalysisStore.getByBriefId(latestBrief.brief_id)) ??
      (await brandAnalysisStore.latestForLead(slug))
    : await brandAnalysisStore.latestForLead(slug);

  const qaResult = latestDemo
    ? await qaResultStore.latestForArtefact(latestDemo.artefact_id)
    : null;

  if (!latestBrief && !latestDemo && !latestPitch && !leadProfile) {
    return NextResponse.json(
      { error: "no bundle data for slug", slug },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      slug,
      business_identity: identity ?? null,
      site_brief: latestBrief ?? null,
      demo_artefact: latestDemo ?? null,
      pitch_brief: latestPitch ?? null,
      brand_analysis: brandAnalysis ?? null,
      lead_profile: leadProfile ?? null,
      qa_result: qaResult ?? null,
      queried_at: new Date().toISOString(),
    },
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
