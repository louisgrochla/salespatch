/**
 * Read-only Supabase client + queries for the customer builds dashboard
 * and the leads ops view (R8).
 *
 * Lives at /builds in NERVE. Pulls paid + sold leads with their onboarding
 * answers and photos so we can see who's awaiting delivery without bouncing
 * into the Supabase dashboard.
 *
 * Why service-role: NERVE is founder-only behind NextAuth; we already trust
 * this surface. Service-role gives us cross-table joins without per-row RLS
 * gymnastics.
 *
 * Env vars (set on Vercel — nerve project):
 *   NEXT_PUBLIC_SUPABASE_URL    — same as sales-dashboard
 *   SUPABASE_SERVICE_ROLE_KEY   — same as sales-dashboard
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export interface BuildPhoto {
  url: string;
  filename: string;
  content_type?: string;
  uploaded_at: string;
}

export interface BuildRow {
  leadId: string;
  status: string | null;
  businessName: string | null;
  address: string | null;
  paidAt: string | null;
  soldAt: string | null;
  customerEmail: string | null;
  // Onboarding row fields (may be null if customer never opened the form):
  contactEmail: string | null;
  contactPhone: string | null;
  topChanges: string | null;
  hasExistingDomain: boolean | null;
  existingDomain: string | null;
  domainPreferences: string[] | null;
  anythingElse: string | null;
  photos: BuildPhoto[];
  completedAt: string | null;
  welcomeSentAt: string | null;
  onboardingUpdatedAt: string | null;
}

interface RawAssignment {
  id: string;
  status: string | null;
  notes: string | null;
  paid_at: string | null;
  sold_at: string | null;
  customer_email: string | null;
}

interface RawOnboarding {
  lead_assignment_id: string;
  contact_email: string | null;
  contact_phone: string | null;
  top_changes: string | null;
  has_existing_domain: boolean | null;
  existing_domain: string | null;
  domain_preferences: string[] | null;
  anything_else: string | null;
  photos: BuildPhoto[] | null;
  completed_at: string | null;
  welcome_sent_at: string | null;
  updated_at: string | null;
}

/**
 * Fetch all leads relevant to the build dashboard.
 *
 * The customer flow auto-saves the moment they type into the onboarding
 * form (debounced 500ms) — so the SOURCE OF TRUTH for "is this customer
 * actively engaging" is the lead_onboarding_responses table, not the
 * lead_assignments status. We pull that first, then join the assignment
 * metadata for business name / paid_at / etc.
 *
 * We also union any paid/sold leads that don't yet have an onboarding row
 * (defensive — shouldn't happen in normal flow, but if it does we don't
 * want a paying customer to be invisible here).
 *
 * Result is sorted: paid first (newest paid at top), then unpaid by most-
 * recent onboarding activity. So a customer who literally JUST typed
 * their email lands at the top of the Pitched section.
 */
export async function fetchBuilds(): Promise<BuildRow[]> {
  const sb = getSupabase();
  if (!sb) return [];

  // Onboarding responses — every customer who's touched the form. Most
  // recent activity first so a returning visit / fresh edit surfaces.
  const { data: responses, error: oErr } = await sb
    .from('lead_onboarding_responses')
    .select(
      'lead_assignment_id, contact_email, contact_phone, top_changes, has_existing_domain, existing_domain, domain_preferences, anything_else, photos, completed_at, welcome_sent_at, updated_at',
    )
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (oErr) {
    console.error('[builds] onboarding fetch failed:', oErr.message);
  }
  const onboardingRows = (responses ?? []) as RawOnboarding[];

  // Defensive: also pull paid/sold leads in case any paid without leaving
  // an onboarding row (would be a bug in the customer flow, but we still
  // want them visible in the dashboard if it happens).
  const { data: paidAssignments, error: pErr } = await sb
    .from('lead_assignments')
    .select('id, status, notes, paid_at, sold_at, customer_email')
    .or('status.eq.sold,paid_at.not.is.null')
    .order('paid_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (pErr) {
    console.error('[builds] paid assignments fetch failed:', pErr.message);
  }

  // Union of leadIds we care about.
  const ids = new Set<string>();
  for (const r of onboardingRows) ids.add(r.lead_assignment_id);
  for (const a of (paidAssignments ?? []) as RawAssignment[]) ids.add(a.id);
  if (ids.size === 0) return [];

  // Fetch the assignment row for every leadId we care about, in one go.
  const { data: assignments, error: aErr } = await sb
    .from('lead_assignments')
    .select('id, status, notes, paid_at, sold_at, customer_email')
    .in('id', Array.from(ids));
  if (aErr) {
    console.error('[builds] lead_assignments fetch failed:', aErr.message);
    return [];
  }

  const assignmentByLead = new Map<string, RawAssignment>();
  for (const a of (assignments ?? []) as RawAssignment[]) assignmentByLead.set(a.id, a);

  const onboardingByLead = new Map<string, RawOnboarding>();
  for (const r of onboardingRows) onboardingByLead.set(r.lead_assignment_id, r);

  // Build rows for every unique leadId. Skip any whose assignment row has
  // disappeared (data inconsistency — worth logging).
  const rows: BuildRow[] = [];
  for (const id of ids) {
    const a = assignmentByLead.get(id);
    if (!a) {
      console.warn(`[builds] orphan onboarding row, no assignment for ${id}`);
      continue;
    }
    const ob = onboardingByLead.get(id);
    const meta = parseNotes(a.notes);
    rows.push({
      leadId: a.id,
      status: a.status,
      businessName: meta.business_name ?? null,
      address: meta.address ?? null,
      paidAt: a.paid_at,
      soldAt: a.sold_at,
      customerEmail: a.customer_email,
      contactEmail: ob?.contact_email ?? null,
      contactPhone: ob?.contact_phone ?? null,
      topChanges: ob?.top_changes ?? null,
      hasExistingDomain: ob?.has_existing_domain ?? null,
      existingDomain: ob?.existing_domain ?? null,
      domainPreferences: ob?.domain_preferences ?? null,
      anythingElse: ob?.anything_else ?? null,
      photos: Array.isArray(ob?.photos) ? (ob!.photos as BuildPhoto[]) : [],
      completedAt: ob?.completed_at ?? null,
      welcomeSentAt: ob?.welcome_sent_at ?? null,
      onboardingUpdatedAt: ob?.updated_at ?? null,
    });
  }

  // Sort: paid first (newest paid_at), then unpaid by most-recent
  // onboarding activity, then by sold_at as a final tiebreaker.
  rows.sort((a, b) => {
    if (a.paidAt && b.paidAt) return b.paidAt.localeCompare(a.paidAt);
    if (a.paidAt) return -1;
    if (b.paidAt) return 1;
    const aAct = a.onboardingUpdatedAt ?? a.soldAt ?? '';
    const bAct = b.onboardingUpdatedAt ?? b.soldAt ?? '';
    return bAct.localeCompare(aAct);
  });
  return rows;
}

/** Sidebar count: paid leads still awaiting delivery (sold but not yet
 *  marked delivered). For now, every "sold" lead counts. */
export async function countPendingBuilds(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const { count, error } = await sb
    .from('lead_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sold');
  if (error) {
    console.warn('[builds] count fetch failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

interface NotesMeta {
  business_name?: string;
  address?: string;
}

function parseNotes(raw: string | null): NotesMeta {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      business_name:
        typeof parsed.business_name === 'string' ? parsed.business_name : undefined,
      address: typeof parsed.address === 'string' ? parsed.address : undefined,
    };
  } catch {
    return {};
  }
}

// ─── R8 live-pull helpers ───────────────────────────────────────────────
//
// The R8 leads ops view needs two slices of Supabase data that NERVE doesn't
// (yet) mirror:
//
//   - SP identity — `lead_assignments.user_id` resolves to `sales_users.id`,
//     which only Supabase knows about. Without this lookup the "assigned
//     to" column would render a raw UUID. R9 may move salesperson identity
//     into NERVE via `SalespersonEvent`, but today the canonical name
//     lookup still lives in Supabase.
//   - Visit sessions — `visits` records SP time-on-business; R9 will move
//     these into NERVE via a `VisitEvent` ingest. For R8 we live-pull so
//     the column has something to render.
//
// Both degrade to empty arrays when `SUPABASE_SERVICE_ROLE_KEY` is missing
// (the local dev case) — the caller renders `—`.

export interface SalesUser {
  userId: string;
  displayName: string;
  areaPostcode: string | null;
}

interface RawSalesUser {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  area_postcode: string | null;
}

/**
 * Pull every salesperson so the ops view can map `userId` → display name.
 * Display-name fallback chain: explicit display_name → "First Last" →
 * raw user id (last-resort — uniquely identifies but ugly).
 */
export async function fetchSalesUsers(): Promise<SalesUser[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('sales_users')
    .select('id, display_name, first_name, last_name, area_postcode')
    .limit(1000);
  if (error) {
    console.error('[ops] sales_users fetch failed:', error.message);
    return [];
  }
  return ((data ?? []) as RawSalesUser[]).map((u) => ({
    userId: u.id,
    displayName: pickDisplayName(u),
    areaPostcode: u.area_postcode,
  }));
}

function pickDisplayName(u: RawSalesUser): string {
  if (u.display_name && u.display_name.trim()) return u.display_name.trim();
  const composed = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  return composed || u.id;
}

export interface VisitSummary {
  assignmentId: string;
  durationMinutes: number;
  startedAt: string | null;
}

interface RawVisit {
  lead_assignment_id: string | null;
  duration_minutes: number | null;
  started_at: string | null;
}

/**
 * Sum visit duration per assignment id. Filters out NULL durations (an
 * in-progress visit hasn't recorded a leave-time yet) and unknown
 * assignment ids. R9 supersedes this by reading from NERVE's
 * `visit_events`; this is the live-pull placeholder.
 */
export async function fetchVisits(
  assignmentIds: string[],
): Promise<Map<string, VisitSummary>> {
  const result = new Map<string, VisitSummary>();
  if (assignmentIds.length === 0) return result;
  const sb = getSupabase();
  if (!sb) return result;
  const { data, error } = await sb
    .from('visits')
    .select('lead_assignment_id, duration_minutes, started_at')
    .in('lead_assignment_id', assignmentIds);
  if (error) {
    console.error('[ops] visits fetch failed:', error.message);
    return result;
  }
  for (const v of (data ?? []) as RawVisit[]) {
    if (!v.lead_assignment_id) continue;
    const prev = result.get(v.lead_assignment_id) ?? {
      assignmentId: v.lead_assignment_id,
      durationMinutes: 0,
      startedAt: null as string | null,
    };
    if (typeof v.duration_minutes === 'number') {
      prev.durationMinutes += v.duration_minutes;
    }
    if (v.started_at && (!prev.startedAt || v.started_at > prev.startedAt)) {
      prev.startedAt = v.started_at;
    }
    result.set(v.lead_assignment_id, prev);
  }
  return result;
}
