/**
 * POST /api/payments/customer-checkout-url
 *
 * Customer-facing, no auth. Body: { lead_id }. Returns the active Stripe
 * Checkout session URL for this assignment, or `already_paid: true` if the
 * webhook has already flipped the assignment to 'sold'.
 *
 * The assignment UUID is the only credential — same model as the public
 * /preview/<id> and /onboarding/<id> pages. Created so the customer-facing
 * onboarding form (which now runs PRE-payment) can fetch the checkout URL
 * to redirect to on "Continue to payment".
 *
 * NOTE: The salesperson-authenticated equivalent at
 * /api/payments/create-checkout still exists and still requires auth — the
 * iOS app uses it to eager-warm the session and lock attribution.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getOrCreateActiveSession } from '@/lib/payments';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = body.lead_id ?? body.lead_assignment_id;
  const leadAssignmentId = typeof raw === 'string' ? raw : null;
  if (!leadAssignmentId) {
    return NextResponse.json(
      { error: 'Missing required field: lead_id' },
      { status: 400 },
    );
  }

  const supabase = getSupabase();

  const { data: assignment, error: aErr } = await supabase
    .from('lead_assignments')
    .select('id, status')
    .eq('id', leadAssignmentId)
    .maybeSingle();
  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }
  if (!assignment) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }
  if (assignment.status === 'sold') {
    return NextResponse.json({ already_paid: true, checkout_url: null });
  }

  try {
    const session = await getOrCreateActiveSession(supabase, leadAssignmentId);
    return NextResponse.json({
      already_paid: false,
      checkout_url: session.stripe_session_url,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to create session';
    console.error('[payments/customer-checkout-url] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
