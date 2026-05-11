import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySignature } from "@/lib/sl-mas/hmac";
import { demoArtefactStore } from "@/lib/sl-mas/demoArtefactStore";
import { siteBriefStore } from "@/lib/sl-mas/siteBriefStore";
import { pitchBriefStore } from "@/lib/sl-mas/pitchBriefStore";
import { qaResultStore } from "@/lib/sl-mas/qaResultStore";
import { businessIdentityStore } from "@/lib/sl-mas/businessIdentityStore";

// GET /api/read/pending-assignments
//
// F2(a) read endpoint. Returns the queue of NERVE-built leads ready for
// admin to assign to a salesperson — every lead that has a
// `demo_artefacts` row but no `lead_assignment_events` row yet.
//
// Dedups against canonical BusinessIdentity (F1) so the same physical
// business doesn't appear twice if two slug variations both have demos.
//
// The card payload is intentionally lean — no full HTML, no markdown
// bodies. The admin import handler (F2 PR 2) re-queries NERVE with the
// `latest_artefact_id` / `latest_brief_id` / `latest_pitch_brief_id`
// returned here to fetch full bodies at assignment time.
//
// Same HMAC pattern as /api/read/strategies + /api/read/lead-profiles/
// winning-features + /api/read/business-identity/lookup: signed canonical
// query string, X-Read-Signature header, OUTCOME_INGEST_SECRET.
//
// Query params (all optional):
//   - vertical=<string>  filter to one vertical
//   - limit=<number>     default 50, max 200
//
// Response:
//   {
//     pending: PendingAssignment[],
//     total: number,
//     queried_at: ISO timestamp
//   }

export const dynamic = "force-dynamic";

interface PendingAssignment {
  /** Canonical slug — same as BusinessIdentity.slug; fall back to demo_artefacts.lead_id when no canonical row exists yet. */
  canonical_slug: string;
  canonical_id: string | null;
  business_name: string;
  vertical: string | null;
  postcode: string | null;
  // Demo card surface
  latest_demo_at: string;
  latest_artefact_id: string;
  demo_count: number;
  demo_size_kb: number;
  photo_count: number;
  aesthetic_positioning: string | null;
  dominant_hex: string | null;
  // Site brief (latest, optional)
  latest_brief_id: string | null;
  diagnosis: string | null;
  pitch_angle: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  instagram_handle: string | null;
  // Pitch brief (latest, optional) — produced by /lead-json
  latest_pitch_brief_id: string | null;
  hook: string | null;
  contact_name: string | null;
  // QA score (latest, optional)
  qa_score: number | null;
  qa_passed: boolean | null;
}

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

  const verticalFilter = url.searchParams.get("vertical");
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 50, 1),
    200,
  );

  // 1. Every lead_id that ever produced a demo_artefact.
  const demoLeadRows = await prisma.demoArtefact.findMany({
    distinct: ["leadId"],
    select: { leadId: true },
  });
  const demoLeadIds = demoLeadRows.map((r) => r.leadId);

  if (demoLeadIds.length === 0) {
    return emptyResponse();
  }

  // 2. Lead_ids that already have at least one assignment event — excluded.
  const assignedRows = await prisma.leadAssignmentEvent.findMany({
    where: { leadId: { in: demoLeadIds } },
    distinct: ["leadId"],
    select: { leadId: true },
  });
  const assignedIds = new Set(assignedRows.map((r) => r.leadId));

  const pendingSlugs = demoLeadIds.filter((id) => !assignedIds.has(id));
  if (pendingSlugs.length === 0) {
    return emptyResponse();
  }

  // 3. Demo count per slug (denormalised for the "X versions" badge).
  const demoCounts = await prisma.demoArtefact.groupBy({
    by: ["leadId"],
    where: { leadId: { in: pendingSlugs } },
    _count: { _all: true },
  });
  const countBySlug = new Map(
    demoCounts.map((r) => [r.leadId, r._count._all]),
  );

  // 4. For each pending slug, fetch enrichments in parallel.
  const enriched: PendingAssignment[] = await Promise.all(
    pendingSlugs.map(async (slug) => {
      const [latestDemo, identity, latestBrief, latestPitch] = await Promise.all([
        demoArtefactStore.latestForLead(slug),
        businessIdentityStore.findBySlug(slug),
        siteBriefStore.latestForLead(slug),
        pitchBriefStore.latestForLead(slug),
      ]);

      // latestDemo is guaranteed (the slug came from demo_artefacts), but
      // narrow defensively for TS.
      if (!latestDemo) {
        // Shouldn't happen given step 1, but skip rather than throw.
        return null as unknown as PendingAssignment;
      }

      const latestQa = await qaResultStore.latestForArtefact(
        latestDemo.artefact_id,
      );

      const profile = await prisma.leadProfile.findUnique({
        where: { leadId: slug },
        select: {
          googleRating: true,
          googleReviewCount: true,
          instagramHandle: true,
          postcode: true,
        },
      });

      return {
        canonical_slug: identity?.slug ?? slug,
        canonical_id: identity?.id ?? null,
        business_name:
          identity?.business_name ??
          latestPitch?.business_name ??
          latestBrief?.business_name ??
          latestDemo.business_name,
        vertical:
          identity?.vertical ??
          latestDemo.vertical ??
          latestBrief?.vertical ??
          null,
        postcode:
          identity?.postcode ??
          profile?.postcode ??
          latestBrief?.postcode ??
          latestPitch?.postcode ??
          null,
        latest_demo_at: latestDemo.generated_at,
        latest_artefact_id: latestDemo.artefact_id,
        demo_count: countBySlug.get(slug) ?? 1,
        demo_size_kb: Math.round(latestDemo.html_size_bytes / 1024),
        photo_count: latestDemo.photo_count,
        aesthetic_positioning: latestDemo.aesthetic_positioning ?? null,
        dominant_hex: latestDemo.dominant_hex ?? null,
        latest_brief_id: latestBrief?.brief_id ?? null,
        diagnosis: latestBrief?.diagnosis ?? null,
        pitch_angle: latestBrief?.pitch_angle ?? null,
        google_rating:
          latestBrief?.google_rating ?? profile?.googleRating ?? null,
        google_review_count:
          latestBrief?.google_review_count ??
          profile?.googleReviewCount ??
          null,
        instagram_handle:
          latestBrief?.instagram_handle ??
          profile?.instagramHandle ??
          null,
        latest_pitch_brief_id: latestPitch?.pitch_brief_id ?? null,
        hook: latestPitch?.hook ?? null,
        contact_name: latestPitch?.contact_name ?? null,
        qa_score: latestQa?.score ?? null,
        qa_passed: latestQa?.passed ?? null,
      };
    }),
  );

  // 5. Drop any nulls (shouldn't occur) and dedup against canonical identity.
  const valid = enriched.filter((e): e is PendingAssignment => e !== null);

  const byCanonical = new Map<string, PendingAssignment>();
  for (const card of valid) {
    const key = card.canonical_id ?? card.canonical_slug;
    const existing = byCanonical.get(key);
    if (!existing || existing.latest_demo_at < card.latest_demo_at) {
      byCanonical.set(key, card);
    }
  }

  let deduped = Array.from(byCanonical.values());

  // 6. Optional vertical filter.
  if (verticalFilter) {
    deduped = deduped.filter((c) => c.vertical === verticalFilter);
  }

  // 7. Sort by latest_demo_at DESC and apply limit.
  deduped.sort((a, b) => (b.latest_demo_at < a.latest_demo_at ? -1 : 1));
  const out = deduped.slice(0, limit);

  return NextResponse.json(
    {
      pending: out,
      total: out.length,
      queried_at: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

function emptyResponse(): NextResponse {
  return NextResponse.json(
    { pending: [], total: 0, queried_at: new Date().toISOString() },
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
