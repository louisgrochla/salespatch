import { NextRequest, NextResponse } from 'next/server';
import { validateAdminToken } from '@/lib/admin-auth';
import { hashPin } from '@/lib/auth';
import { getSupabaseServer } from '@/lib/supabase';

function requireAdmin(req: NextRequest): NextResponse | null {
  const token = req.cookies.get('admin_token')?.value;
  if (!token || !validateAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * GET /api/admin/salespeople/[id] — full per-user view: profile, aggregated
 * stats, recent leads with full notes, and an activity timeline derived
 * from lead_assignments status timestamps.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const sb = getSupabaseServer();
  const [userRes, leadsRes] = await Promise.all([
    sb
      .from('sales_users')
      .select(
        'id, name, email, phone, area_postcode, commission_rate, commission_amount_pence, stripe_connect_id, active, device_type, created_at, last_active_at',
      )
      .eq('id', params.id)
      .maybeSingle(),
    sb
      .from('lead_assignments')
      .select('*')
      .eq('user_id', params.id)
      .order('assigned_at', { ascending: false }),
  ]);

  if (userRes.error || !userRes.data) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const leads = (leadsRes.data ?? []) as Array<Record<string, unknown>>;

  // Aggregate stats
  const stats = {
    total_assigned: leads.length,
    new: leads.filter((r) => r.status === 'new').length,
    visited: leads.filter((r) => r.status === 'visited').length,
    pitched: leads.filter((r) => r.status === 'pitched').length,
    sold: leads.filter((r) => r.status === 'sold').length,
    rejected: leads.filter((r) => r.status === 'rejected').length,
    total_commission: leads.reduce((a, r) => a + (typeof r.commission_amount === 'number' ? r.commission_amount : 0), 0),
    avg_days_to_close: avgDaysToClose(leads),
    close_rate_pct: closeRate(leads),
    last_activity_at: latestTimestamp(leads),
  };

  // Recent leads (top 12), unwrap notes JSON for display
  const recent_leads = leads.slice(0, 12).map((r) => {
    const n = safeParse(r.notes as string | null, {} as any);
    return {
      assignment_id: r.id,
      lead_id: r.lead_id,
      status: r.status,
      assigned_at: r.assigned_at,
      visited_at: r.visited_at,
      pitched_at: r.pitched_at,
      sold_at: r.sold_at,
      rejected_at: r.rejected_at,
      follow_up_at: r.follow_up_at,
      commission_amount: r.commission_amount,
      business_name: n.business_name ?? 'Unknown',
      business_type: n.business_type ?? null,
      postcode: n.postcode ?? null,
      google_rating: n.google_rating ?? null,
    };
  });

  // Sold leads with payout state — what the admin uses to trigger transfers.
  const sold_payouts = leads
    .filter((r) => r.status === 'sold')
    .map((r) => {
      const n = safeParse(r.notes as string | null, {} as any);
      return {
        assignment_id: r.id,
        business_name: n.business_name ?? 'Unknown',
        sold_at: r.sold_at,
        commission_amount_pence:
          (typeof r.commission_amount_pence === 'number' && r.commission_amount_pence) ||
          (typeof r.commission_amount === 'number' ? Math.round(r.commission_amount * 100) : 0),
        payout_status: (r.payout_status as string) ?? 'pending',
        payout_transfer_id: (r.payout_transfer_id as string | null) ?? null,
        payout_paid_out_at: (r.payout_paid_out_at as string | null) ?? null,
        payout_failed_at: (r.payout_failed_at as string | null) ?? null,
        payout_failure_reason: (r.payout_failure_reason as string | null) ?? null,
      };
    });

  // Activity timeline — every status transition, newest first
  const activity: Array<{
    action: string;
    business_name: string;
    at: string;
    color: string;
  }> = [];
  for (const r of leads) {
    const n = safeParse(r.notes as string | null, {} as any);
    const businessName = (n.business_name as string) ?? '—';
    const push = (action: string, at: unknown, color: string) => {
      if (typeof at === 'string') activity.push({ action, business_name: businessName, at, color });
    };
    push('Assigned', r.assigned_at, 'cream');
    push('Visited', r.visited_at, 'cream');
    push('Pitched', r.pitched_at, 'amber');
    push('Sold', r.sold_at, 'signal');
    push('Rejected', r.rejected_at, 'muted');
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return NextResponse.json({
    data: {
      user: userRes.data,
      stats,
      recent_leads,
      sold_payouts,
      recent_activity: activity.slice(0, 30),
    },
  });
}

/**
 * PATCH /api/admin/salespeople/[id] — admin actions on a user.
 * Body: { active?: boolean, pin?: string, commission_amount_pence?: number }
 *   - active: enable/disable the user (login fails if false).
 *   - pin: reset their PIN (returned ONCE so admin can share).
 *   - commission_amount_pence: flat commission per confirmed sale, in pence.
 *     0..100000 (£0..£1000). Default for new contractors is 15000 (£150).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const body = (await req.json()) as {
    active?: boolean;
    pin?: string;
    commission_amount_pence?: number;
  };
  const sb = getSupabaseServer();

  const update: Record<string, unknown> = {};
  if (typeof body.active === 'boolean') update.active = body.active;
  if (typeof body.pin === 'string') {
    const pin = body.pin.trim();
    if (!/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4–6 digits' }, { status: 400 });
    }
    update.pin_hash = hashPin(pin);
  }
  if (typeof body.commission_amount_pence === 'number') {
    const v = Math.round(body.commission_amount_pence);
    if (!Number.isFinite(v) || v < 0 || v > 100000) {
      return NextResponse.json(
        { error: 'commission_amount_pence must be 0..100000 (£0..£1000)' },
        { status: 400 },
      );
    }
    update.commission_amount_pence = v;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await sb.from('sales_users').update(update).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: {
      id: params.id,
      ...update,
      // Echo new PIN back ONCE so admin can copy/share
      ...(typeof body.pin === 'string' ? { pin: body.pin.trim() } : {}),
    },
  });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function safeParse<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function latestTimestamp(rows: Array<Record<string, unknown>>): string | null {
  let latest: string | null = null;
  const fields = ['sold_at', 'pitched_at', 'visited_at', 'rejected_at', 'assigned_at'];
  for (const r of rows) {
    for (const f of fields) {
      const v = r[f];
      if (typeof v === 'string' && (!latest || v > latest)) latest = v;
    }
  }
  return latest;
}

function avgDaysToClose(rows: Array<Record<string, unknown>>): number | null {
  const closed = rows.filter((r) => r.status === 'sold' && r.sold_at && r.assigned_at);
  if (closed.length === 0) return null;
  const days = closed.map((r) => {
    const start = new Date(r.assigned_at as string).getTime();
    const end = new Date(r.sold_at as string).getTime();
    return (end - start) / 86_400_000;
  });
  return Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10;
}

function closeRate(rows: Array<Record<string, unknown>>): number | null {
  if (rows.length === 0) return null;
  const sold = rows.filter((r) => r.status === 'sold').length;
  return Math.round((sold / rows.length) * 100);
}
