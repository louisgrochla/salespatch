/**
 * Dual-mode lead/stats helpers.
 *
 * Same pattern as auth-db: Supabase on Vercel prod, SQLite locally.
 * Lead data lives in `lead_assignments` with rich JSON in the `notes` column —
 * the old `/api/leads` routes already parse that shape; these helpers return
 * the raw rows so callers can reuse the existing parse logic.
 */
import { queryAll, queryOne } from './db';
import { isSupabaseMode } from './auth-db';
import { getSupabaseServer } from './supabase';
import type { SalesStats } from './types';

/**
 * Expand a `demo_site_domain` value into a fully-qualified URL the iOS app
 * can hit directly.
 *
 * Background: admin/upload stores the demo HTML in Supabase Storage at
 * `<slug>.html`, and admin/assign stamps `notes.demo_site_domain` with the
 * BARE slug (e.g. "third-circle-coffee"). The iOS app's webview tried to
 * load that as a domain (`https://third-circle-coffee`) which DNS-fails →
 * "this demo hasn't been uploaded yet" fallback.
 *
 * Fix: at API response time, expand the slug to the public proxy URL
 * `https://salespatch.co.uk/api/demo-site/<slug>` which streams the HTML
 * back from Supabase Storage. The iOS code already handles full URLs in
 * its `domain.startsWith('http') ? domain : 'https://' + domain` check.
 *
 * Backwards-compatible: any existing rows with full URLs (or live-domain
 * strings like `barber-co.salesflow.site`) pass through unchanged.
 */
export function expandDemoUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Heuristic for "looks like a real domain we should leave alone":
  // contains a dot AND ends with a TLD-shaped suffix. Slugs are
  // dash-separated alphanumerics with no dots, so they'll fall through
  // to the proxy expansion.
  if (trimmed.includes('.') && /\.[a-z]{2,}$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://salespatch.co.uk/api/demo-site/${encodeURIComponent(trimmed)}`;
}

export interface LeadAssignmentRow {
  id: string;                    // assignment_id
  lead_id: string;
  user_id: string;
  status: 'new' | 'visited' | 'pitched' | 'sold' | 'rejected';
  assigned_at: string;
  visited_at: string | null;
  pitched_at: string | null;
  sold_at: string | null;
  paid_at: string | null;        // Stripe webhook stamps when money lands
  rejected_at: string | null;
  rejection_reason: string | null;
  notes: string | null;          // JSON blob with business details
  commission_amount: number | null;
  commission_amount_pence: number | null;
  follow_up_at: string | null;
  follow_up_note: string | null;
  contact_name: string | null;
  contact_role: string | null;
}

export async function listAssignments(
  userId: string,
  opts?: { status?: string | null; search?: string | null },
): Promise<LeadAssignmentRow[]> {
  if (isSupabaseMode()) {
    const sb = getSupabaseServer();
    let q = sb
      .from('lead_assignments')
      .select('*')
      .eq('user_id', userId)
      .order('assigned_at', { ascending: false });
    if (opts?.status && opts.status !== 'all') q = q.eq('status', opts.status);
    const { data, error } = await q;
    if (error) {
      console.error('[leads-db] listAssignments', error);
      return [];
    }
    let rows = (data ?? []) as LeadAssignmentRow[];
    if (opts?.search) {
      const needle = opts.search.toLowerCase();
      rows = rows.filter((r) => {
        try {
          const n = r.notes ? (JSON.parse(r.notes) as Record<string, unknown>) : {};
          return String(n.business_name ?? '').toLowerCase().includes(needle);
        } catch {
          return false;
        }
      });
    }
    return rows;
  }

  let sql = `SELECT * FROM lead_assignments WHERE user_id = ?`;
  const params: unknown[] = [userId];
  if (opts?.status && opts.status !== 'all') {
    sql += ' AND status = ?';
    params.push(opts.status);
  }
  if (opts?.search) {
    sql += ` AND json_extract(notes, '$.business_name') LIKE ?`;
    params.push(`%${opts.search}%`);
  }
  sql += `
    ORDER BY
      CASE status
        WHEN 'new' THEN 1
        WHEN 'visited' THEN 2
        WHEN 'pitched' THEN 3
        WHEN 'sold' THEN 4
        WHEN 'rejected' THEN 5
      END,
      assigned_at DESC
  `;
  return queryAll<LeadAssignmentRow>(sql, ...params);
}

export async function getAssignment(
  assignmentId: string,
  userId: string,
): Promise<LeadAssignmentRow | null> {
  if (isSupabaseMode()) {
    const sb = getSupabaseServer();
    const { data } = await sb
      .from('lead_assignments')
      .select('*')
      .eq('id', assignmentId)
      .eq('user_id', userId)
      .maybeSingle();
    return (data as LeadAssignmentRow | null) ?? null;
  }
  return (
    queryOne<LeadAssignmentRow>(
      'SELECT * FROM lead_assignments WHERE id = ? AND user_id = ?',
      assignmentId,
      userId,
    ) ?? null
  );
}

export async function getStats(userId: string): Promise<SalesStats> {
  if (isSupabaseMode()) {
    const sb = getSupabaseServer();
    const { data } = await sb
      .from('lead_assignments')
      .select('status, visited_at, pitched_at, sold_at, commission_amount')
      .eq('user_id', userId);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return aggregateStats(rows);
  }
  const rows = queryAll<Record<string, unknown>>(
    'SELECT status, visited_at, pitched_at, sold_at, commission_amount FROM lead_assignments WHERE user_id = ?',
    userId,
  );
  return aggregateStats(rows);
}

function aggregateStats(rows: Array<Record<string, unknown>>): SalesStats {
  const today = new Date();
  const sameDay = (isoOrDate: unknown) => {
    if (!isoOrDate) return false;
    const d = new Date(String(isoOrDate));
    if (Number.isNaN(d.getTime())) return false;
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  };
  let total_assigned = 0,
    new_count = 0,
    visited_count = 0,
    pitched_count = 0,
    sold_count = 0,
    rejected_count = 0,
    visits_today = 0,
    pitches_today = 0,
    sales_today = 0,
    total_commission = 0;

  for (const r of rows) {
    total_assigned++;
    const status = r.status as string;
    if (status === 'new') new_count++;
    else if (status === 'visited') visited_count++;
    else if (status === 'pitched') pitched_count++;
    else if (status === 'sold') sold_count++;
    else if (status === 'rejected') rejected_count++;

    if (sameDay(r.visited_at)) visits_today++;
    if (sameDay(r.pitched_at)) pitches_today++;
    if (sameDay(r.sold_at)) sales_today++;
    if (typeof r.commission_amount === 'number') total_commission += r.commission_amount;
  }

  return {
    total_assigned,
    new_count,
    visited_count,
    pitched_count,
    sold_count,
    rejected_count,
    visits_today,
    pitches_today,
    sales_today,
    total_commission,
  };
}
