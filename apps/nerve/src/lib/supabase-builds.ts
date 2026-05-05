/**
 * Read-only Supabase client + queries for the customer builds dashboard.
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
function getSupabase(): SupabaseClient | null {
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
 * Fetch all leads relevant to the build dashboard. We include:
 *   - status='sold' (paid, build in progress)
 *   - status='pitched' (interested, may have entered email)
 * Sorted by paid_at desc (paid first, newest at top), then sold_at,
 * then a final fallback to onboarding updated_at so a still-unpaid
 * lead with recent activity surfaces near the top.
 */
export async function fetchBuilds(): Promise<BuildRow[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data: assignments, error: aErr } = await sb
    .from('lead_assignments')
    .select('id, status, notes, paid_at, sold_at, customer_email')
    .in('status', ['sold', 'pitched'])
    .order('paid_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (aErr) {
    console.error('[builds] lead_assignments fetch failed:', aErr.message);
    return [];
  }
  if (!assignments || assignments.length === 0) return [];

  const ids = (assignments as RawAssignment[]).map((a) => a.id);
  const { data: onboarding, error: oErr } = await sb
    .from('lead_onboarding_responses')
    .select(
      'lead_assignment_id, contact_email, contact_phone, top_changes, has_existing_domain, existing_domain, domain_preferences, anything_else, photos, completed_at, welcome_sent_at, updated_at',
    )
    .in('lead_assignment_id', ids);
  if (oErr) {
    console.error('[builds] onboarding fetch failed:', oErr.message);
  }

  const byLead = new Map<string, RawOnboarding>();
  for (const row of (onboarding ?? []) as RawOnboarding[]) {
    byLead.set(row.lead_assignment_id, row);
  }

  return (assignments as RawAssignment[]).map((a) => {
    const ob = byLead.get(a.id);
    const meta = parseNotes(a.notes);
    return {
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
    };
  });
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
