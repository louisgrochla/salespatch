import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { resolveAdminFromRequest } from '@/lib/admin-auth';
import { queryOne, run, transaction } from '@/lib/db';
import { nerveGet } from '@/lib/nerve-read';

// POST /api/leads/import-from-nerve
//
// F2(c) — the bridge between "NERVE has a built demo for this slug" and
// "Supabase has a lead_assignment row the salesperson sees". Replaces
// the founder's manual submit-folder drag with one click.
//
// Body: { slug: string, user_id: string }
//   - slug    : canonical lead slug from /api/read/pending-assignments
//   - user_id : sales_users.id of the salesperson receiving the lead
//
// Flow:
//   1. Auth — owner/manager only (matches /api/leads/[id]/assign).
//   2. Reject if there's already an active assignment on this slug.
//   3. Fetch the full bundle from NERVE via /api/read/lead-bundle.
//   4. Map the bundle into the notes JSON shape sales-dashboard's
//      manual `/api/admin/leads` POST writes (so iOS + sales-dashboard
//      render the lead the same way regardless of source).
//   5. Insert lead_assignments + sales_activity_log in one tx using the
//      slug as lead_id — that's the join key NERVE recognises, so the
//      B1 producer's status events will trace back to the demo on the
//      same key.
//
// `demo_site_domain` points at NERVE's public demo route
// (/api/public/demo/<slug>) so the SP gets a live, shareable URL with
// no Supabase upload required. The demo HTML lives in NERVE Postgres
// as inline JSONB — sales-dashboard renders it the same way it renders
// a Supabase-hosted demo.

const NERVE_PUBLIC_BASE_URL =
  process.env.NERVE_BASE_URL ?? 'https://nerve.salespatch.co.uk';

interface ImportBody {
  slug?: string;
  user_id?: string;
}

interface LeadBundle {
  slug: string;
  business_identity: BusinessIdentity | null;
  site_brief: SiteBrief | null;
  demo_artefact: DemoArtefact | null;
  pitch_brief: PitchBrief | null;
  brand_analysis: BrandAnalysis | null;
  lead_profile: LeadProfile | null;
  qa_result: QaResult | null;
  queried_at: string;
}

interface BusinessIdentity {
  id: string;
  slug: string;
  business_name: string;
  vertical: string | null;
  postcode: string | null;
}

interface SiteBrief {
  brief_id: string;
  business_name: string;
  business_type?: string;
  vertical?: string;
  postcode?: string;
  address?: string;
  diagnosis?: string;
  pitch_angle?: string;
  google_rating?: number;
  google_review_count?: number;
  instagram_handle?: string;
  brief_markdown: string;
}

interface DemoArtefact {
  artefact_id: string;
  business_name: string;
  vertical?: string;
  photo_count: number;
  aesthetic_positioning?: string;
  dominant_hex?: string;
  generated_at: string;
}

interface PitchBrief {
  pitch_brief_id: string;
  business_name: string;
  business_type: string | null;
  postcode: string | null;
  address: string | null;
  description: string | null;
  hero_headline: string | null;
  cta_text: string | null;
  services: string[];
  pain_points: string[];
  opening_hours: string[];
  trust_badges: string[];
  avoid_topics: string[];
  contact_name: string | null;
  contact_role: string | null;
  brand_primary_hex: string | null;
  brand_accent_hex: string | null;
  demo_site_domain: string | null;
  hook: string | null;
  opener: string | null;
  demo_moments: string[];
  close_script: string | null;
  next_visit_reason: string | null;
  specific_objections: Array<{ objection: string; response: string }>;
}

interface BrandAnalysis {
  analysis_id: string;
  dominant_hex?: string;
  neutral_hex?: string;
  accent_hex?: string;
}

interface LeadProfile {
  lead_id: string;
  business_name: string;
  business_type?: string;
  vertical?: string;
  postcode?: string;
  phone?: string;
  email?: string;
  website_url?: string;
  google_rating?: number;
  google_review_count?: number;
  best_reviews?: Array<{ author: string; rating: number; text: string; date?: string }>;
  instagram_handle?: string;
  opening_hours: string[];
}

interface QaResult {
  qa_id: string;
  score: number;
  passed: boolean;
}

export async function POST(req: NextRequest) {
  const admin = resolveAdminFromRequest(req);
  if (!admin || admin.role === 'viewer') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const slug = body.slug?.trim();
  const user_id = body.user_id?.trim();
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  // Validate the salesperson exists + is active.
  const sp = queryOne<{ id: string; name: string; active: number }>(
    'SELECT id, name, active FROM sales_users WHERE id = ?',
    user_id,
  );
  if (!sp) return NextResponse.json({ error: 'salesperson not found' }, { status: 404 });
  if (sp.active !== 1) {
    return NextResponse.json(
      { error: 'salesperson is inactive' },
      { status: 400 },
    );
  }

  // Reject if there's already an active assignment for this slug — mirrors
  // the duplicate-guard in /api/leads/[id]/assign.
  const existing = queryOne<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM lead_assignments WHERE lead_id = ? AND status NOT IN ('rejected')",
    slug,
  );
  if (existing) {
    return NextResponse.json(
      {
        error: 'Lead already assigned',
        assignment_id: existing.id,
        assigned_to: existing.user_id,
      },
      { status: 409 },
    );
  }

  // Pull the full bundle from NERVE. The card-level pending-assignments
  // payload is intentionally lean (no full HTML), so this is a second
  // round-trip but a deliberate one — the queue page stays fast.
  const bundle = await nerveGet<LeadBundle>('/api/read/lead-bundle', { slug });
  if (!bundle.ok || !bundle.data) {
    return NextResponse.json(
      {
        error: `NERVE bundle fetch failed: HTTP ${bundle.status}`,
        detail: bundle.error ?? bundle.data,
      },
      { status: bundle.status === 503 ? 503 : 502 },
    );
  }

  const data = bundle.data;
  if (!data.demo_artefact) {
    return NextResponse.json(
      { error: 'no demo_artefact for slug — cannot import' },
      { status: 422 },
    );
  }

  const notes = buildNotes(data);
  const assignmentId = randomUUID();
  const now = new Date().toISOString();

  try {
    transaction(() => {
      run(
        `INSERT INTO lead_assignments (id, lead_id, user_id, status, assigned_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, 'new', ?, ?, ?, ?)`,
        assignmentId,
        slug,
        user_id,
        now,
        JSON.stringify(notes),
        now,
        now,
      );

      run(
        `INSERT INTO sales_activity_log (id, user_id, lead_id, assignment_id, action, notes, created_at)
         VALUES (?, ?, ?, ?, 'imported_from_nerve', ?, ?)`,
        randomUUID(),
        user_id,
        slug,
        assignmentId,
        `Imported from NERVE by admin ${admin.name}. artefact=${data.demo_artefact?.artefact_id ?? 'none'} brief=${data.site_brief?.brief_id ?? 'none'} pitch=${data.pitch_brief?.pitch_brief_id ?? 'none'}`,
        now,
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      assignment_id: assignmentId,
      lead_id: slug,
      user_id,
      user_name: sp.name,
      business_name: notes.business_name,
      demo_site_domain: notes.demo_site_domain,
    },
  });
}

// ── Bundle → notes JSON mapper ───────────────────────────────────────────
//
// Mirrors the field shape sales-dashboard's /api/admin/leads POST writes
// (apps/sales-dashboard/src/app/api/admin/leads/route.ts). That handler
// is the source of truth for what iOS + sales-dashboard expect to read
// from lead_assignments.notes; if it changes we update here too.

function buildNotes(b: LeadBundle): NotesPayload {
  const pitch = b.pitch_brief;
  const brief = b.site_brief;
  const profile = b.lead_profile;
  const brand = b.brand_analysis;
  const demo = b.demo_artefact;
  const identity = b.business_identity;

  const business_name =
    pitch?.business_name ??
    brief?.business_name ??
    profile?.business_name ??
    identity?.business_name ??
    demo?.business_name ??
    'Unknown';

  const postcode =
    pitch?.postcode ??
    profile?.postcode ??
    brief?.postcode ??
    identity?.postcode ??
    null;

  const business_type =
    pitch?.business_type ??
    profile?.business_type ??
    brief?.business_type ??
    null;

  const website_url = profile?.website_url ?? null;

  return {
    business_name,
    business_type,
    postcode: postcode ? postcode.toUpperCase() : null,
    address: pitch?.address ?? null,
    phone: profile?.phone ?? null,
    email: profile?.email ?? null,
    website_url,
    has_website: !!website_url,
    google_rating: brief?.google_rating ?? profile?.google_rating ?? null,
    google_review_count:
      brief?.google_review_count ?? profile?.google_review_count ?? null,
    description: pitch?.description ?? null,
    hero_headline: pitch?.hero_headline ?? null,
    cta_text: pitch?.cta_text ?? null,
    services: pitch?.services ?? [],
    pain_points: pitch?.pain_points ?? [],
    opening_hours: pitch?.opening_hours ?? profile?.opening_hours ?? [],
    best_reviews: profile?.best_reviews ?? [],
    brand_colours: brand
      ? {
          primary: brand.dominant_hex ?? pitch?.brand_primary_hex ?? null,
          accent: brand.accent_hex ?? pitch?.brand_accent_hex ?? null,
          neutral: brand.neutral_hex ?? null,
        }
      : pitch?.brand_primary_hex || pitch?.brand_accent_hex
        ? {
            primary: pitch.brand_primary_hex,
            accent: pitch.brand_accent_hex,
            neutral: null,
          }
        : null,
    trust_badges: pitch?.trust_badges ?? [],
    avoid_topics: pitch?.avoid_topics ?? [],
    demo_site_domain:
      pitch?.demo_site_domain ?? buildDemoUrl(b.slug, !!demo),
    demo_site_qa_score: b.qa_result?.score ?? null,
    contact_name: pitch?.contact_name ?? null,
    contact_role: pitch?.contact_role ?? null,
    hook: pitch?.hook ?? null,
    opener: pitch?.opener ?? null,
    demo_moments: pitch?.demo_moments ?? [],
    specific_objections: pitch?.specific_objections ?? [],
    close_script: pitch?.close_script ?? null,
    next_visit_reason: pitch?.next_visit_reason ?? null,
    pain_points_extended: null,
    // Trace fields — let future debugging tie a row back to NERVE.
    nerve_slug: b.slug,
    nerve_canonical_id: identity?.id ?? null,
    nerve_artefact_id: demo?.artefact_id ?? null,
    nerve_brief_id: brief?.brief_id ?? null,
    nerve_pitch_brief_id: pitch?.pitch_brief_id ?? null,
    diagnosis: brief?.diagnosis ?? null,
    pitch_angle: brief?.pitch_angle ?? null,
    aesthetic_positioning: demo?.aesthetic_positioning ?? null,
    instagram_handle: profile?.instagram_handle ?? brief?.instagram_handle ?? null,
  };
}

function buildDemoUrl(slug: string, hasDemo: boolean): string | null {
  if (!hasDemo) return null;
  return `${NERVE_PUBLIC_BASE_URL}/api/public/demo/${encodeURIComponent(slug)}`;
}

interface NotesPayload {
  business_name: string;
  business_type: string | null;
  postcode: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  has_website: boolean;
  google_rating: number | null;
  google_review_count: number | null;
  description: string | null;
  hero_headline: string | null;
  cta_text: string | null;
  services: string[];
  pain_points: string[];
  opening_hours: string[];
  best_reviews: Array<{ author: string; rating: number; text: string; date?: string }>;
  brand_colours: { primary: string | null; accent: string | null; neutral: string | null } | null;
  trust_badges: string[];
  avoid_topics: string[];
  demo_site_domain: string | null;
  demo_site_qa_score: number | null;
  contact_name: string | null;
  contact_role: string | null;
  hook: string | null;
  opener: string | null;
  demo_moments: string[];
  specific_objections: Array<{ objection: string; response: string }>;
  close_script: string | null;
  next_visit_reason: string | null;
  pain_points_extended: string | null;
  nerve_slug: string;
  nerve_canonical_id: string | null;
  nerve_artefact_id: string | null;
  nerve_brief_id: string | null;
  nerve_pitch_brief_id: string | null;
  diagnosis: string | null;
  pitch_angle: string | null;
  aesthetic_positioning: string | null;
  instagram_handle: string | null;
}
