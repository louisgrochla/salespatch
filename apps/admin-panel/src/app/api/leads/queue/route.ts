import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminFromRequest } from '@/lib/admin-auth';
import { nerveGet } from '@/lib/nerve-read';

// GET /api/leads/queue
//
// Proxies NERVE's /api/read/pending-assignments to the admin-panel UI.
// Server-side because the HMAC secret cannot leak to the browser.
//
// The browser hits this endpoint with admin session auth; this route
// re-signs with OUTCOME_INGEST_SECRET and forwards. NERVE returns the
// queue of leads with a demo_artefact but no lead_assignment_event yet,
// deduped against canonical BusinessIdentity (F1).

export const dynamic = 'force-dynamic';

interface PendingAssignment {
  canonical_slug: string;
  canonical_id: string | null;
  business_name: string;
  vertical: string | null;
  postcode: string | null;
  latest_demo_at: string;
  latest_artefact_id: string;
  demo_count: number;
  demo_size_kb: number;
  photo_count: number;
  aesthetic_positioning: string | null;
  dominant_hex: string | null;
  latest_brief_id: string | null;
  diagnosis: string | null;
  pitch_angle: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  instagram_handle: string | null;
  latest_pitch_brief_id: string | null;
  hook: string | null;
  contact_name: string | null;
  qa_score: number | null;
  qa_passed: boolean | null;
}

interface PendingResponse {
  pending: PendingAssignment[];
  total: number;
  queried_at: string;
}

export async function GET(req: NextRequest) {
  const admin = resolveAdminFromRequest(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const vertical = searchParams.get('vertical') ?? undefined;
  const limit = searchParams.get('limit') ?? undefined;

  const result = await nerveGet<PendingResponse>('/api/read/pending-assignments', {
    vertical,
    limit,
  });

  if (!result.ok || !result.data) {
    return NextResponse.json(
      {
        error: `NERVE read failed: HTTP ${result.status}`,
        detail: result.error ?? result.data,
      },
      { status: result.status === 503 ? 503 : 502 },
    );
  }

  return NextResponse.json(result.data, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
