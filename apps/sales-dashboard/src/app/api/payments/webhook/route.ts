/**
 * POST /api/payments/webhook
 *
 * Stripe webhook receiver. Signature-verified, idempotent (via stripe_events
 * table). The ONLY place commission accrues — never at QR-gen, never anywhere
 * else. Hard requirement: payment_status must be 'paid' before any state
 * change.
 *
 * Events handled:
 *   checkout.session.completed     → flip lead to sold, mark commission,
 *                                    create £25/mo subscription with 30d trial
 *   checkout.session.expired       → mark cached lead_payment_sessions row expired
 *   payment_intent.payment_failed  → record payment_failed_at, no status change
 *   customer.subscription.created  → log subscription_id on assignment
 *   invoice.payment_succeeded      → log £25/mo invoice for revenue tracking
 *   invoice.payment_failed         → log + ops alert (no lead status change)
 *   charge.refunded                → log only (refund handling is v2)
 */
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getStripe, getStripeWebhookSecret, getStripeHostingPriceId } from '@/lib/stripe';
import { claimStripeEvent, markStripeEventProcessed } from '@/lib/stripe-events';
import { sendCustomerWelcome } from '@/lib/email';
import { formatPenceAsPounds, getMonthlyPence } from '@/lib/payments';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    let secret: string;
    try {
      secret = getStripeWebhookSecret();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Webhook secret not configured';
      return NextResponse.json({ error: message }, { status: 500 });
    }
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook verification failed';
    console.error('[payments/webhook] Signature verification failed:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = getSupabase();
  let claim: 'claimed' | 'already_processed';
  try {
    claim = await claimStripeEvent(supabase, event.id, event.type);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Idempotency check failed';
    console.error('[payments/webhook] Idempotency claim failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (claim === 'already_processed') {
    console.log(`[payments/webhook] Skipping duplicate event ${event.id} (${event.type})`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await dispatch(supabase, event);
    await markStripeEventProcessed(supabase, event.id);
    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook handler error';
    console.error(`[payments/webhook] Handler error on ${event.type}:`, message);
    // processed_at stays NULL so Stripe's retry will re-claim and re-run.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function dispatch(supabase: SupabaseClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session);
      return;
    case 'checkout.session.expired':
      await handleCheckoutExpired(supabase, event.data.object as Stripe.Checkout.Session);
      return;
    case 'payment_intent.payment_failed':
      await handlePaymentFailed(supabase, event.data.object as Stripe.PaymentIntent);
      return;
    case 'customer.subscription.created':
      await handleSubscriptionCreated(supabase, event.data.object as Stripe.Subscription);
      return;
    case 'invoice.payment_succeeded':
      await handleInvoicePaid(supabase, event.data.object as Stripe.Invoice);
      return;
    case 'invoice.payment_failed':
      console.warn(`[payments/webhook] invoice.payment_failed: ${(event.data.object as Stripe.Invoice).id}`);
      return;
    case 'charge.refunded':
      console.warn(`[payments/webhook] charge.refunded received — refund handling is v2: ${(event.data.object as Stripe.Charge).id}`);
      return;
    default:
      console.log(`[payments/webhook] Unhandled event type: ${event.type}`);
      return;
  }
}

// ---------------------------------------------------------------------------
// checkout.session.completed — the ONLY place commission accrues
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  // HARD GUARD: never act on a session that isn't actually paid.
  if (session.payment_status !== 'paid') {
    console.warn(
      `[payments/webhook] checkout.session.completed with payment_status=${session.payment_status} on session ${session.id} — ignoring`,
    );
    return;
  }

  const leadAssignmentId = session.metadata?.lead_assignment_id;
  const salespersonId = session.metadata?.salesperson_id;

  if (!leadAssignmentId || !salespersonId) {
    console.error(
      `[payments/webhook] Missing metadata on session ${session.id}: lead_assignment_id=${leadAssignmentId} salesperson_id=${salespersonId}`,
    );
    return;
  }

  // Idempotency at the business level: if the assignment is already sold,
  // don't double-pay. (Belt-and-braces — stripe_events should already gate.)
  const { data: assignment, error: aErr } = await supabase
    .from('lead_assignments')
    .select('id, user_id, status')
    .eq('id', leadAssignmentId)
    .maybeSingle();
  if (aErr) throw new Error(`assignment lookup: ${aErr.message}`);
  if (!assignment) {
    console.error(`[payments/webhook] assignment ${leadAssignmentId} not found`);
    return;
  }
  if (assignment.status === 'sold') {
    console.log(`[payments/webhook] assignment ${leadAssignmentId} already sold — skipping`);
    return;
  }
  if (assignment.user_id !== salespersonId) {
    console.error(
      `[payments/webhook] metadata salesperson_id (${salespersonId}) does not match assignment.user_id (${assignment.user_id}) — refusing to credit`,
    );
    return;
  }

  // Read commission from sales_users — never hardcoded.
  const { data: sp, error: spErr } = await supabase
    .from('sales_users')
    .select('commission_amount_pence')
    .eq('id', salespersonId)
    .maybeSingle();
  if (spErr) throw new Error(`sales_users lookup: ${spErr.message}`);
  if (!sp) {
    console.error(`[payments/webhook] sales_user ${salespersonId} not found`);
    return;
  }
  const commissionPence = sp.commission_amount_pence ?? 0;

  // Pull customer details from the Stripe session.
  const customerEmail = session.customer_details?.email ?? session.customer_email ?? null;
  const customerPhone = session.customer_details?.phone ?? null;
  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

  // Mark assignment sold + write commission. The .neq('status', 'sold')
  // guard means we never overwrite a sold row's data — defence-in-depth
  // against any double-fire that slips past the stripe_events claim.
  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('lead_assignments')
    .update({
      status: 'sold',
      sold_at: nowIso,
      // paid_at is the explicit "real money has landed" stamp the iOS
      // app uses to distinguish Confirmed from Projected sales. In live
      // Stripe this equals sold_at; in test/manual flows it stays NULL.
      paid_at: nowIso,
      commission_amount_pence: commissionPence,
      // legacy float-pounds column kept in sync for backwards compat.
      commission_amount: commissionPence / 100,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      stripe_session_id: session.id,
      stripe_customer_id: stripeCustomerId,
    })
    .eq('id', leadAssignmentId)
    .neq('status', 'sold');
  if (updErr) throw new Error(`assignment update: ${updErr.message}`);

  // Mark cached payment session completed so the preview page won't
  // try to refresh it.
  await supabase
    .from('lead_payment_sessions')
    .update({ status: 'completed', completed_at: nowIso })
    .eq('stripe_session_id', session.id);

  // Log Stripe fee estimate for cost tracking. Failure here is
  // non-critical — the lead is already flipped to sold + commission
  // written; we just lose the cost-ledger entry. Log loudly so ops
  // can spot a missing cost_log table or RLS issue.
  const amountPaid = session.amount_total ?? 0;
  const stripeFeeEstimate = Math.round(amountPaid * 0.014) + 20; // 1.4% + 20p UK card
  const { error: costErr } = await supabase.from('cost_log').insert({
    service: 'stripe',
    amount_gbp: stripeFeeEstimate / 100,
    description: `Checkout ${session.id} — assignment ${leadAssignmentId}`,
    metadata: {
      session_id: session.id,
      payment_intent: session.payment_intent,
      lead_assignment_id: leadAssignmentId,
      salesperson_id: salespersonId,
    },
  });
  if (costErr) {
    console.warn(`[payments/webhook] cost_log insert failed (non-fatal): ${costErr.message}`);
  }

  // Spin up the £25/mo subscription with a 30-day trial. Customer's card was
  // saved off-session at checkout, so the subscription's first charge lands
  // on the saved PM at trial end.
  if (stripeCustomerId) {
    await createMonthlySubscription({
      customerId: stripeCustomerId,
      leadAssignmentId,
      salespersonId,
    });
  } else {
    console.warn(
      `[payments/webhook] No customer_id on session ${session.id} — cannot create monthly subscription`,
    );
  }

  console.log(
    `[payments/webhook] SOLD: assignment=${leadAssignmentId} sp=${salespersonId} commission_pence=${commissionPence}`,
  );

  // Welcome email to the customer. Best-effort — failure here doesn't
  // unwind the sale; the sale is already committed in the DB and Stripe.
  // We log loudly so a missing RESEND_API_KEY or unverified domain
  // surfaces in Vercel logs, not as a silent customer-experience gap.
  if (customerEmail) {
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const deliveryBy = new Date(Date.now() + sevenDays);
    const trialEnds = new Date(Date.now() + thirtyDays);
    const fmtDate = (d: Date) =>
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    // Best-effort business name lookup — fall back to "your business".
    let businessName = 'your business';
    try {
      const { data } = await supabase
        .from('lead_assignments')
        .select('notes')
        .eq('id', leadAssignmentId)
        .maybeSingle();
      if (data?.notes) {
        const parsed = JSON.parse(data.notes as string) as Record<string, unknown>;
        if (typeof parsed.business_name === 'string' && parsed.business_name.trim()) {
          businessName = parsed.business_name;
        }
      }
    } catch { /* fall through with default */ }

    const result = await sendCustomerWelcome({
      to: customerEmail,
      businessName,
      amountPaidPence: amountPaid,
      setupFeePoundsLabel: formatPenceAsPounds(amountPaid),
      monthlyPoundsLabel: `${formatPenceAsPounds(getMonthlyPence())}/mo`,
      trialEndsLabel: fmtDate(trialEnds),
      deliveryByLabel: fmtDate(deliveryBy),
      previewUrl: `https://salespatch.co.uk/preview/${leadAssignmentId}`,
      assignmentId: leadAssignmentId,
    });
    if (result.ok) {
      console.log(`[payments/webhook] welcome email sent: ${result.id} to ${customerEmail}`);
    } else {
      console.warn(`[payments/webhook] welcome email FAILED to ${customerEmail}: ${result.error}`);
    }
  } else {
    console.warn(`[payments/webhook] no customer_email on session ${session.id} — welcome email skipped`);
  }
}

async function createMonthlySubscription(args: {
  customerId: string;
  leadAssignmentId: string;
  salespersonId: string;
}): Promise<void> {
  const priceId = getStripeHostingPriceId();
  if (!priceId) {
    console.warn(
      `[payments/webhook] STRIPE_HOSTING_PRICE_ID unset — skipping subscription for assignment ${args.leadAssignmentId}. The setup fee is captured; ops must manually attach the £25/mo subscription.`,
    );
    return;
  }

  const stripe = getStripe();
  const trialEndUnix = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  try {
    const sub = await stripe.subscriptions.create({
      customer: args.customerId,
      items: [{ price: priceId }],
      trial_end: trialEndUnix,
      metadata: {
        lead_assignment_id: args.leadAssignmentId,
        salesperson_id: args.salespersonId,
      },
    });
    console.log(
      `[payments/webhook] Created subscription ${sub.id} for assignment ${args.leadAssignmentId}, trial ends ${new Date(trialEndUnix * 1000).toISOString()}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'subscription create failed';
    // Don't fail the whole webhook — the setup fee is captured. Log loudly so ops
    // can manually create the subscription if this happens.
    console.error(
      `[payments/webhook] FAILED to create subscription for assignment ${args.leadAssignmentId} (customer ${args.customerId}): ${message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Other event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutExpired(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  await supabase
    .from('lead_payment_sessions')
    .update({ status: 'expired' })
    .eq('stripe_session_id', session.id);
  console.log(`[payments/webhook] Session expired: ${session.id}`);
}

async function handlePaymentFailed(
  supabase: SupabaseClient,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const leadAssignmentId = pi.metadata?.lead_assignment_id;
  if (!leadAssignmentId) return;
  await supabase
    .from('lead_assignments')
    .update({ payment_failed_at: new Date().toISOString() })
    .eq('id', leadAssignmentId);
  console.warn(`[payments/webhook] payment_failed on assignment ${leadAssignmentId}: ${pi.last_payment_error?.message ?? 'unknown'}`);
}

async function handleSubscriptionCreated(
  supabase: SupabaseClient,
  sub: Stripe.Subscription,
): Promise<void> {
  const leadAssignmentId = sub.metadata?.lead_assignment_id;
  if (!leadAssignmentId) return;
  await supabase
    .from('lead_assignments')
    .update({ stripe_subscription_id: sub.id })
    .eq('id', leadAssignmentId);
  console.log(`[payments/webhook] subscription_created ${sub.id} on assignment ${leadAssignmentId}`);
}

async function handleInvoicePaid(
  supabase: SupabaseClient,
  invoice: Stripe.Invoice,
): Promise<void> {
  // Stripe SDK 21+: subscription id moved under invoice.parent.subscription_details.
  const subDetails = invoice.parent?.subscription_details;
  const subRef = subDetails?.subscription ?? null;
  const subscriptionId =
    typeof subRef === 'string' ? subRef : subRef ? subRef.id : null;
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;

  // Used for tracking £25/mo recurring revenue. No lead-status change.
  const { error: invoiceCostErr } = await supabase.from('cost_log').insert({
    service: 'stripe-invoice',
    amount_gbp: (invoice.amount_paid ?? 0) / 100,
    description: `Invoice ${invoice.id} paid (subscription ${subscriptionId ?? 'n/a'})`,
    metadata: {
      invoice_id: invoice.id,
      subscription_id: subscriptionId,
      customer_id: customerId,
    },
  });
  if (invoiceCostErr) {
    console.warn(`[payments/webhook] invoice cost_log insert failed: ${invoiceCostErr.message}`);
  }
}
