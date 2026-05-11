import { NextRequest, NextResponse } from 'next/server';
import { validateAdminToken } from '@/lib/admin-auth';
import { nerveGet } from '@/lib/nerve-read';

// GET /api/admin/queue
//
// Server-side proxy from the admin browser surface to NERVE's
// /api/read/pending-assignments. Re-signs with OUTCOME_INGEST_SECRET
// (already set in the sales-dashboard Vercel project for the B1
// producer). The browser cannot hold the HMAC secret.
//
// Auth: existing admin_token cookie via validateAdminToken.

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

function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('admin_token')?.value;
  if (!token || !validateAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

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
