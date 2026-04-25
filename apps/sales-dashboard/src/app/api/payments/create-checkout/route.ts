import { NextRequest, NextResponse } from 'next/server';
import { getStripeSecretKey } from '@/lib/stripe';

const SETUP_FEE_PENCE = 34999; // £349.99 one-time
const MONTHLY_PENCE = 2500;    // £25/month (starts 30 days after payment)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { demo_id, salesperson_id, business_name, customer_email } = body;

    if (!demo_id || !salesperson_id || !business_name) {
      return NextResponse.json(
        { error: 'Missing required fields: demo_id, salesperson_id, business_name' },
        { status: 400 },
      );
    }

    let stripeKey: string;
    try {
      stripeKey = getStripeSecretKey();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stripe not configured';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const origin = req.headers.get('origin') ?? 'https://salesflow-sigma.vercel.app';

    // Payment mode: client pays £349.99 now.
    // We save their payment method (setup_future_usage) so we can create
    // a £25/month subscription via the webhook after payment succeeds.
    const params = new URLSearchParams();
    params.append('ui_mode', 'embedded');
    params.append('mode', 'payment');
    params.append('currency', 'gbp');

    // £349.99 setup fee
    params.append('line_items[0][price_data][currency]', 'gbp');
    params.append('line_items[0][price_data][unit_amount]', String(SETUP_FEE_PENCE));
    params.append('line_items[0][price_data][product_data][name]', `Website for ${business_name}`);
    params.append('line_items[0][price_data][product_data][description]', 'Custom-designed website. Includes first month of hosting & support. £25/month thereafter.');
    params.append('line_items[0][quantity]', '1');

    // Save card for future £25/month charges
    params.append('payment_intent_data[setup_future_usage]', 'off_session');

    params.append('metadata[demo_id]', demo_id);
    params.append('metadata[salesperson_id]', salesperson_id);
    params.append('metadata[business_name]', business_name);
    params.append('metadata[monthly_amount]', String(MONTHLY_PENCE));
    params.append('return_url', `${origin}/demo/${demo_id}?session_id={CHECKOUT_SESSION_ID}`);
    if (customer_email) params.append('customer_email', customer_email);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await res.json();

    if (!res.ok) {
      console.error('[payments/create-checkout] Stripe error:', session);
      return NextResponse.json({ error: session.error?.message || 'Stripe error' }, { status: 500 });
    }

    return NextResponse.json({ clientSecret: session.client_secret, session_id: session.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[payments/create-checkout] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
