import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { validateAdminToken } from '@/lib/admin-auth';
import { isSupabaseMode } from '@/lib/auth-db';
import { getSupabaseServer } from '@/lib/supabase';
import { run } from '@/lib/db';

function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('admin_token')?.value;
  if (!token || !validateAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * GET /api/admin/leads — list every lead assignment (for admin overview).
 */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  if (isSupabaseMode()) {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from('lead_assignments')
      .select('*')
      .order('assigned_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }
  return NextResponse.json({ data: [] });
}

/**
 * POST /api/admin/leads — create a new lead and assign it to a salesperson.
 * Body: {
 *   user_id,                      // sales_users.id (the friend receiving the lead)
 *   business_name,
 *   business_type?, postcode?, address?, phone?, email?, website_url?,
 *   google_rating?, google_review_count?,
 *   description?, hero_headline?, cta_text?,
 *   services?, pain_points?, opening_hours?,           // arrays of strings
 *   best_reviews?,                                     // [{author,rating,text}]
 *   brand_colours?,                                    // {primary,accent,neutral}
 *   trust_badges?, avoid_topics?,                      // arrays of strings
 *   demo_site_domain?, demo_site_qa_score?,
 *   contact_name?, contact_role?,
 * }
 */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as Record<string, unknown>;
  const user_id = body.user_id as string | undefined;
  const business_name = body.business_name as string | undefined;

  if (!user_id) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
  }
  if (!business_name || business_name.trim().length < 2) {
    return NextResponse.json({ error: 'business_name is required' }, { status: 400 });
  }

  const notes = {
    business_name: String(business_name).trim(),
    business_type: strOrNull(body.business_type),
    postcode: upOrNull(body.postcode),
    address: strOrNull(body.address),
    phone: strOrNull(body.phone),
    email: strOrNull(body.email),
    website_url: strOrNull(body.website_url),
    has_website: !!body.website_url,
    google_rating: numOrNull(body.google_rating),
    google_review_count: numOrNull(body.google_review_count),
    description: strOrNull(body.description),
    hero_headline: strOrNull(body.hero_headline),
    cta_text: strOrNull(body.cta_text),
    services: arrOfStr(body.services),
    pain_points: arrOfStr(body.pain_points),
    opening_hours: arrOfStr(body.opening_hours),
    best_reviews: arrOfReviews(body.best_reviews),
    brand_colours: (body.brand_colours && typeof body.brand_colours === 'object' ? body.brand_colours : null) as unknown,
    trust_badges: arrOfStr(body.trust_badges),
    avoid_topics: arrOfStr(body.avoid_topics),
    demo_site_domain: strOrNull(body.demo_site_domain),
    demo_site_qa_score: numOrNull(body.demo_site_qa_score),
  };

  const assignmentId = randomUUID();
  const leadId = randomUUID();
  const contact_name = strOrNull(body.contact_name);
  const contact_role = strOrNull(body.contact_role);

  if (isSupabaseMode()) {
    const sb = getSupabaseServer();
    const { error } = await sb.from('lead_assignments').insert({
      id: assignmentId,
      lead_id: leadId,
      user_id,
      status: 'new',
      notes: JSON.stringify(notes),
      contact_name,
      contact_role,
    });
    if (error) {
      console.error('[admin/leads POST] insert failed', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    run(
      `INSERT INTO lead_assignments (id, lead_id, user_id, status, notes, contact_name, contact_role)
       VALUES (?, ?, ?, 'new', ?, ?, ?)`,
      assignmentId,
      leadId,
      user_id,
      JSON.stringify(notes),
      contact_name,
      contact_role,
    );
  }

  return NextResponse.json({
    data: {
      assignment_id: assignmentId,
      lead_id: leadId,
      user_id,
      business_name: notes.business_name,
    },
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}
function upOrNull(v: unknown): string | null {
  const s = strOrNull(v);
  return s ? s.toUpperCase() : null;
}
function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}
function arrOfStr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim().length > 0) as string[];
  if (typeof v === 'string') {
    return v
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter((s) => s.length);
  }
  return [];
}
function arrOfReviews(v: unknown): Array<{ author: string; rating: number; text: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      author: String((x as any).author ?? ''),
      rating: Number((x as any).rating ?? 5),
      text: String((x as any).text ?? ''),
    }));
}
