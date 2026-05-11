import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { validateAdminToken } from '@/lib/admin-auth';
import { isSupabaseMode } from '@/lib/auth-db';
import { getSupabaseServer } from '@/lib/supabase';
import { queryOne, run, transaction } from '@/lib/db';
import { nerveGet } from '@/lib/nerve-read';
import { buildEventId, postLeadAssignmentEvent } from '@/lib/nerve-ingest';

// POST /api/admin/import-from-nerve
//
// F2(c) — the bridge between "NERVE has a built demo for this slug" and
// "the salesperson sees the lead in their dashboard". One click instead
// of: download submit folder → open manual upload form → drag photos
// → paste 25 fields → upload demo to Supabase → pick SP → save.
//
// Body: { slug: string, user_id: string }
//
// Flow:
//   1. Auth — existing admin_token cookie pattern.
//   2. Reject if there's already an active assignment on this slug.
//   3. Fetch the full bundle from NERVE via /api/read/lead-bundle.
//   4. Map the bundle → notes JSON shape matching the manual
//      /api/admin/leads POST handler (so iOS + sales-dashboard render
//      the lead identically regardless of source).
//   5. Insert lead_assignments using the slug as lead_id — that's the
//      join key NERVE recognises, so the existing B1 producer's status
//      events trace back to the demo on the same key automatically.
//
// `demo_site_domain` points at NERVE's public demo route
// (/api/public/demo/<slug>) so the SP gets a live, shareable URL with
// no Supabase upload required. The demo HTML lives in NERVE Postgres
// as inline JSONB; sales-dashboard + iOS treat the NERVE URL like any
// external demo URL.
//
// Dual-mode (Supabase prod, SQLite dev) matching the existing
// /api/admin/leads POST handler.

const NERVE_PUBLIC_BASE_URL =
  process.env.NERVE_BASE_URL ?? 'https://nerve.salespatch.co.uk';

function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('admin_token')?.value;
  if (!token || !validateAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

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
  const denied = requireAdmin(req);
  if (denied) return denied;

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

  // Validate the salesperson exists + is active, and check for an existing
  // active assignment on this slug. Dual-mode: Supabase prod, SQLite dev.
  const supabaseMode = isSupabaseMode();
  let userName = '';

  if (supabaseMode) {
    const sb = getSupabaseServer();
    const { data: sp, error: spErr } = await sb
      .from('sales_users')
      .select('id, name, active')
      .eq('id', user_id)
      .maybeSingle();
    if (spErr) {
      return NextResponse.json(
        { error: `Supabase sales_users lookup failed: ${spErr.message}` },
        { status: 500 },
      );
    }
    if (!sp) {
      return NextResponse.json({ error: 'salesperson not found' }, { status: 404 });
    }
    if (sp.active !== true && sp.active !== 1) {
      return NextResponse.json(
        { error: 'salesperson is inactive' },
        { status: 400 },
      );
    }
    userName = (sp.name as string) ?? '';

    const { data: existing, error: exErr } = await sb
      .from('lead_assignments')
      .select('id, user_id, status')
      .eq('lead_id', slug)
      .neq('status', 'rejected')
      .maybeSingle();
    if (exErr) {
      return NextResponse.json(
        { error: `Supabase lead_assignments lookup failed: ${exErr.message}` },
        { status: 500 },
      );
    }
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
  } else {
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
    userName = sp.name;

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
  }

  // Pull the full bundle from NERVE.
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
  const occurredAt = new Date().toISOString();
  const contact_name = data.pitch_brief?.contact_name ?? null;
  const contact_role = data.pitch_brief?.contact_role ?? null;

  if (supabaseMode) {
    const sb = getSupabaseServer();
    const { error } = await sb.from('lead_assignments').insert({
      id: assignmentId,
      lead_id: slug,
      user_id,
      status: 'new',
      notes: JSON.stringify(notes),
      contact_name,
      contact_role,
    });
    if (error) {
      return NextResponse.json(
        { error: `Supabase insert failed: ${error.message}` },
        { status: 500 },
      );
    }
  } else {
    try {
      transaction(() => {
        run(
          `INSERT INTO lead_assignments (id, lead_id, user_id, status, notes, contact_name, contact_role)
           VALUES (?, ?, ?, 'new', ?, ?, ?)`,
          assignmentId,
          slug,
          user_id,
          JSON.stringify(notes),
          contact_name,
          contact_role,
        );
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Fire the B1 producer so NERVE's lead_assignment_events table holds
  // the initial assignment row. Without this the F2 queue would keep
  // re-listing this lead (the queue filter is "demo_artefact exists AND
  // no lead_assignment_event yet"). Fire-and-forget — never blocks the
  // response: if NERVE is down the Supabase row is still valid and the
  // queue dedup just stays stale until the next status flip.
  const eventId = buildEventId(assignmentId, 'new', occurredAt);
  postLeadAssignmentEvent({
    event_id: eventId,
    assignment_id: assignmentId,
    lead_id: slug,
    user_id,
    prev_status: null,
    status: 'new',
    source: 'nerve_import',
    occurred_at: occurredAt,
    metadata: {
      imported_by: 'admin',
      nerve_artefact_id: data.demo_artefact?.artefact_id ?? null,
      nerve_brief_id: data.site_brief?.brief_id ?? null,
      nerve_pitch_brief_id: data.pitch_brief?.pitch_brief_id ?? null,
    },
  }).catch((err) => {
    // Log; do not surface to caller — the Supabase row is already written.
    console.warn('[import-from-nerve] postLeadAssignmentEvent failed', err);
  });

  return NextResponse.json({
    data: {
      assignment_id: assignmentId,
      lead_id: slug,
      user_id,
      user_name: userName,
      business_name: notes.business_name,
      demo_site_domain: notes.demo_site_domain,
    },
  });
}

// ── Bundle → notes JSON mapper ───────────────────────────────────────────
//
// Mirrors the field shape /api/admin/leads POST writes. If that handler
// changes we update here too.

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
