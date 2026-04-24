import { NextRequest, NextResponse } from 'next/server';
import { resolveUserFromRequest } from '@/lib/auth';
import { getAssignment } from '@/lib/leads-db';
import type { LeadDetail, ReviewItem, ObjectionPair } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = resolveUserFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Auth required', code: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const row = await getAssignment(params.id, auth.user_id);
  if (!row) {
    return NextResponse.json({ error: 'Lead not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const n = safeParse<Record<string, unknown>>(row.notes, {});
  const lead: LeadDetail = {
    assignment_id: row.id,
    assignment_status: row.status ?? 'new',
    assigned_at: row.assigned_at,
    lead_id: row.lead_id,
    business_name: (n.business_name as string) ?? 'Unknown',
    business_type: (n.business_type as string | null) ?? null,
    address: (n.address as string | null) ?? null,
    postcode: (n.postcode as string | null) ?? null,
    phone: (n.phone as string | null) ?? null,
    email: (n.email as string | null) ?? null,
    website_url: (n.website_url as string | null) ?? null,
    google_rating: (n.google_rating as number | null) ?? null,
    google_review_count: (n.google_review_count as number | null) ?? null,
    has_website: !!n.has_website,
    website_quality_score: (n.website_quality_score as number | null) ?? null,
    description: (n.description as string | null) ?? null,
    services: toStringArray(n.services),
    pain_points: toStringArray(n.pain_points),
    opening_hours: toStringArray(n.opening_hours),
    best_reviews: toReviews(n.best_reviews),
    brand_colours: (n.brand_colours as Record<string, string> | null) ?? null,
    logo_filename: (n.logo_filename as string | null) ?? null,
    gallery_filenames: toStringArray(n.gallery_filenames),
    demo_site_html: (n.demo_site_html as string | null) ?? null,
    demo_site_domain: (n.demo_site_domain as string | null) ?? null,
    demo_site_qa_score: (n.demo_site_qa_score as number | null) ?? null,
    has_demo_site: !!n.demo_site_domain,
    trust_badges: toStringArray(n.trust_badges),
    avoid_topics: toStringArray(n.avoid_topics),
    hero_headline: (n.hero_headline as string | null) ?? null,
    cta_text: (n.cta_text as string | null) ?? null,
    // Sales-brief extensions
    hook: (n.hook as string | null) ?? null,
    opener: (n.opener as string | null) ?? null,
    demo_moments: toStringArray(n.demo_moments),
    specific_objections: toObjections(n.specific_objections),
    close_script: (n.close_script as string | null) ?? null,
    next_visit_reason: (n.next_visit_reason as string | null) ?? null,
    pain_points_extended: (n.pain_points_extended as string | null) ?? null,
    notes: (n.user_notes as string | null) ?? null,
    commission_amount: row.commission_amount,
    visited_at: row.visited_at,
    pitched_at: row.pitched_at,
    sold_at: row.sold_at,
    follow_up_at: row.follow_up_at,
    follow_up_note: row.follow_up_note,
    contact_name: row.contact_name,
    contact_role: row.contact_role,
  };

  return NextResponse.json({ data: lead });
}

function safeParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}
function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}
function toObjections(v: unknown): ObjectionPair[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      objection: String((x as any).objection ?? ''),
      response: String((x as any).response ?? ''),
    }))
    .filter((p) => p.objection.length > 0);
}
function toReviews(v: unknown): ReviewItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      author: String((x as any).author ?? ''),
      rating: Number((x as any).rating ?? 0),
      text: String((x as any).text ?? ''),
    }));
}
