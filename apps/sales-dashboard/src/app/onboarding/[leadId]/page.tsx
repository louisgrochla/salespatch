/**
 * /onboarding/[leadId] — server shell.
 *
 * Loads the lead_assignment, parses business_name + demo_site_domain from
 * notes, then either redirects to /paid (already sold) or renders the
 * client-side OnboardingClient with the demo iframe peeking through the top
 * of the screen above the form sheet.
 *
 * The form logic, auto-save, photo upload, checkout-URL warm-up, and the
 * bottom-sheet UI all live in OnboardingClient.tsx.
 */
import { createClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import OnboardingClient from './OnboardingClient';
import {
  getSetupFeePence,
  formatPenceAsPounds,
} from '@/lib/payments';

export const dynamic = 'force-dynamic';

interface AssignmentRow {
  id: string;
  status: string;
  notes: string | null;
  paid_at: string | null;
  agreed_price_pence: number | null;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

interface ParsedNotes {
  business_name: string;
  demo_site_domain: string | null;
}

function parseNotes(raw: string | null): ParsedNotes {
  if (!raw) return { business_name: 'your business', demo_site_domain: null };
  try {
    const n = JSON.parse(raw) as Record<string, unknown>;
    const businessName =
      typeof n.business_name === 'string' && n.business_name.trim()
        ? n.business_name
        : 'your business';
    const rawDomain =
      typeof n.demo_site_domain === 'string' && n.demo_site_domain.trim()
        ? n.demo_site_domain.trim()
        : null;
    return { business_name: businessName, demo_site_domain: resolveDemoUrl(rawDomain) };
  } catch {
    return { business_name: 'your business', demo_site_domain: null };
  }
}

/** Same resolution rules as /preview — see preview/[leadId]/page.tsx. */
function resolveDemoUrl(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.replace(/^https?:\/\/(?=https?:\/\/)/, '');
  const supabaseMatch = v.match(
    /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/demo-sites\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/i,
  );
  if (supabaseMatch) {
    return `/api/demo-site/${encodeURIComponent(supabaseMatch[1])}`;
  }
  if (/^https?:\/\//i.test(v)) return v;
  return `/api/demo-site/${encodeURIComponent(v)}`;
}

export default async function OnboardingPage({
  params,
}: {
  params: { leadId: string };
}) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('lead_assignments')
    .select('id, status, notes, paid_at, agreed_price_pence')
    .eq('id', params.leadId)
    .maybeSingle();
  if (error) {
    console.error('[onboarding] assignment lookup error:', error.message);
    notFound();
  }
  const assignment = data as AssignmentRow | null;
  if (!assignment) notFound();

  // Redirect only when money has actually landed (paid_at), not when the SP
  // claims sold. Sold-unpaid leads (relationship sales) still need the
  // onboarding form so payment can be collected before launch.
  if (assignment.paid_at) {
    redirect(`/paid/${assignment.id}`);
  }

  const { business_name, demo_site_domain } = parseNotes(assignment.notes);
  // When agreed_price_pence is set the SP negotiated a flat one-time deal;
  // pass through so the CTA + InfoStrip can show the actual price + suppress
  // the £25/mo recurring copy.
  const flatOneTime = assignment.agreed_price_pence != null;
  const setupLabel = formatPenceAsPounds(assignment.agreed_price_pence ?? getSetupFeePence());

  return (
    <OnboardingClient
      leadId={assignment.id}
      businessName={business_name}
      demoUrl={demo_site_domain}
      setupLabel={setupLabel}
      flatOneTime={flatOneTime}
    />
  );
}
