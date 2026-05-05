import { NextRequest, NextResponse } from 'next/server';
import { resolveUserFromRequest } from '@/lib/auth';
import { listAssignments, expandDemoUrl, type LeadAssignmentRow } from '@/lib/leads-db';
import type { LeadCard } from '@/lib/types';

export async function GET(req: NextRequest) {
  const auth = resolveUserFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: 'Auth required', code: 'AUTH_REQUIRED' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const rows = await listAssignments(auth.user_id, { status, search });
  const leads: LeadCard[] = rows
    .map((r) => rowToCard(r))
    .sort(statusOrderThenDate);

  return NextResponse.json({ data: leads });
}

function rowToCard(r: LeadAssignmentRow): LeadCard {
  const n = safeParse<Record<string, unknown>>(r.notes, {});
  return {
    assignment_id: r.id,
    assignment_status: r.status ?? 'new',
    assigned_at: r.assigned_at,
    lead_id: r.lead_id,
    business_name: (n.business_name as string) ?? 'Unknown Business',
    business_type: (n.business_type as string | null) ?? null,
    address: (n.address as string | null) ?? null,
    postcode: (n.postcode as string | null) ?? null,
    phone: (n.phone as string | null) ?? null,
    google_rating: (n.google_rating as number | null) ?? null,
    google_review_count: (n.google_review_count as number | null) ?? null,
    has_website: !!n.has_website,
    website_quality_score: (n.website_quality_score as number | null) ?? null,
    has_demo_site: !!n.demo_site_domain,
    demo_site_domain: expandDemoUrl(n.demo_site_domain as string | null | undefined),
    follow_up_at: r.follow_up_at,
    follow_up_note: r.follow_up_note,
    contact_name: r.contact_name,
    contact_role: r.contact_role,
    visited_at: r.visited_at,
    pitched_at: r.pitched_at,
    sold_at: r.sold_at,
    paid_at: r.paid_at,
    commission_amount_pence: r.commission_amount_pence,
  };
}

function statusOrderThenDate(a: LeadCard, b: LeadCard): number {
  const order = ['new', 'visited', 'pitched', 'sold', 'rejected'];
  const oa = order.indexOf(a.assignment_status);
  const ob = order.indexOf(b.assignment_status);
  if (oa !== ob) return oa - ob;
  return (b.assigned_at ?? '').localeCompare(a.assigned_at ?? '');
}

function safeParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}
