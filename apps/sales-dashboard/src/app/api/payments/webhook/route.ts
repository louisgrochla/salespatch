import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe'; // kept for type references (Stripe.Event, Stripe.Checkout.Session)
import { createClient } from '@supabase/supabase-js';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';

const COMMISSION_GBP = 5000; // £50 in pence

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

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
    }
    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Webhook handler error';
    console.error('[payments/webhook] Handler error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const demoId = session.metadata?.demo_id;
  const salespersonId = session.metadata?.salesperson_id;
  const paymentId = session.payment_intent as string;

  if (!demoId || !salespersonId) {
    console.error('[payments/webhook] Missing metadata on checkout session:', session.id);
    return;
  }

  const supabase = getSupabase();

  // 1. Update pitch_outcomes
  await supabase
    .from('pitch_outcomes')
    .update({
      stripe_payment_confirmed: true,
      stripe_payment_id: paymentId,
      outcome: 'closed',
      outcome_logged_at: new Date().toISOString(),
    })
    .eq('demo_id', demoId)
    .eq('salesperson_id', salespersonId);

  // 2. Update salesperson_metrics
  const { data: sp } = await supabase
    .from('salesperson_metrics')
    .select('total_pitches, total_closes, total_commission')
    .eq('id', salespersonId)
    .single();

  if (sp) {
    const newCloses = (sp.total_closes ?? 0) + 1;
    const newCommission = (sp.total_commission ?? 0) + (COMMISSION_GBP / 100);
    const newCloseRate = sp.total_pitches > 0 ? newCloses / sp.total_pitches : 0;

    await supabase
      .from('salesperson_metrics')
      .update({
        total_closes: newCloses,
        total_commission: newCommission,
        close_rate: newCloseRate,
      })
      .eq('id', salespersonId);
  }

  // 3. Log Stripe fees
  const amountPaid = session.amount_total ?? 0;
  const stripeFeeEstimate = Math.round(amountPaid * 0.014) + 20;
  await supabase.from('cost_log').insert({
    service: 'stripe',
    amount_gbp: stripeFeeEstimate / 100,
    description: `Checkout ${session.id} — payment for demo ${demoId}`,
    metadata: { session_id: session.id, payment_intent: paymentId, demo_id: demoId, salesperson_id: salespersonId },
  });

  console.log(`[payments/webhook] Checkout completed: demo=${demoId}, sp=${salespersonId}`);
}
