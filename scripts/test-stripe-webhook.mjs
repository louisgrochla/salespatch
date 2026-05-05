#!/usr/bin/env node
/**
 * Webhook smoke test — sends a properly-signed mock
 * checkout.session.completed event to the prod webhook endpoint.
 *
 * Verifies end-to-end:
 *   - signature verification passes (so STRIPE_WEBHOOK_SECRET on Vercel matches)
 *   - the route flips a real lead_assignment to status='sold'
 *   - paid_at + sold_at + commission_amount_pence get populated
 *   - cost_log row gets inserted
 *
 * What this DOES NOT test (because the customer is fake):
 *   - the £25/mo subscription creation will fail at Stripe (logged, non-fatal)
 *   - actual money transfer (no real card touched)
 *
 * Usage:
 *   STRIPE_WEBHOOK_SECRET=whsec_xxxxx \
 *   ASSIGNMENT_ID=<real-lead_assignments.id> \
 *   node scripts/test-stripe-webhook.mjs
 *
 * Optional:
 *   ENDPOINT=https://salespatch.co.uk/api/payments/webhook (default)
 */
import crypto from 'node:crypto';

const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const ASSIGNMENT_ID = process.env.ASSIGNMENT_ID;
const ENDPOINT =
  process.env.ENDPOINT ?? 'https://salespatch.co.uk/api/payments/webhook';

if (!SECRET) {
  console.error('ERROR: STRIPE_WEBHOOK_SECRET env var required (whsec_…)');
  process.exit(1);
}
if (!ASSIGNMENT_ID) {
  console.error(
    'ERROR: ASSIGNMENT_ID env var required (paste a real lead_assignments.id)',
  );
  process.exit(1);
}

// We need salesperson_id too — the webhook validates it against the
// assignment row. Look it up via your Supabase service role key, OR
// pass it directly:
const SALESPERSON_ID =
  process.env.SALESPERSON_ID ??
  (() => {
    console.error(
      'ERROR: SALESPERSON_ID env var required. Run this in Supabase first:\n' +
        `  SELECT user_id FROM lead_assignments WHERE id = '${ASSIGNMENT_ID}';\n` +
        'Then re-run with SALESPERSON_ID=<that user_id>.',
    );
    process.exit(1);
  })();

// Construct a minimal but valid checkout.session.completed event.
// Stripe verifies signatures over the raw JSON body, so the shape only
// needs the fields the webhook handler actually reads.
const sessionId = `cs_test_${crypto.randomBytes(8).toString('hex')}`;
const eventId = `evt_test_${crypto.randomBytes(8).toString('hex')}`;
const fakeCustomerId = `cus_test_${crypto.randomBytes(8).toString('hex')}`;
const nowSec = Math.floor(Date.now() / 1000);

const event = {
  id: eventId,
  object: 'event',
  api_version: '2024-12-18.acacia',
  created: nowSec,
  type: 'checkout.session.completed',
  livemode: true,
  data: {
    object: {
      id: sessionId,
      object: 'checkout.session',
      payment_status: 'paid',
      amount_total: 29900,
      currency: 'gbp',
      customer: fakeCustomerId,
      customer_email: 'webhook-smoke-test@example.com',
      customer_details: {
        email: 'webhook-smoke-test@example.com',
        phone: null,
      },
      payment_intent: `pi_test_${crypto.randomBytes(8).toString('hex')}`,
      metadata: {
        lead_assignment_id: ASSIGNMENT_ID,
        salesperson_id: SALESPERSON_ID,
      },
    },
  },
};

const rawBody = JSON.stringify(event);

// Stripe signature scheme: timestamp.signed_payload signed with HMAC-SHA256.
// Header format: t=<timestamp>,v1=<signature>
const timestamp = nowSec;
const signedPayload = `${timestamp}.${rawBody}`;
const signature = crypto
  .createHmac('sha256', SECRET)
  .update(signedPayload, 'utf8')
  .digest('hex');
const stripeSigHeader = `t=${timestamp},v1=${signature}`;

console.log(`POST ${ENDPOINT}`);
console.log(`  event:        ${eventId}`);
console.log(`  session:      ${sessionId}`);
console.log(`  assignment:   ${ASSIGNMENT_ID}`);
console.log(`  salesperson:  ${SALESPERSON_ID}`);
console.log(`  amount:       £${(event.data.object.amount_total / 100).toFixed(2)}`);
console.log('');

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'stripe-signature': stripeSigHeader,
  },
  body: rawBody,
});

const responseText = await res.text();
console.log(`HTTP ${res.status}`);
console.log(responseText);
console.log('');

if (res.status === 200) {
  console.log('✅ Webhook accepted the event.');
  console.log('');
  console.log('Verify the side effects in Supabase:');
  console.log('');
  console.log(`  SELECT id, status, sold_at, paid_at, commission_amount_pence,`);
  console.log(`         stripe_session_id, customer_email`);
  console.log(`  FROM lead_assignments WHERE id = '${ASSIGNMENT_ID}';`);
  console.log('');
  console.log(`  SELECT service, amount_gbp, description`);
  console.log(`  FROM cost_log ORDER BY created_at DESC LIMIT 1;`);
  console.log('');
  console.log('Expected:');
  console.log('  status=sold, sold_at + paid_at populated,');
  console.log('  commission_amount_pence > 0, stripe_session_id set,');
  console.log("  customer_email='webhook-smoke-test@example.com',");
  console.log("  cost_log top row service='stripe', amount_gbp ≈ 4.39");
  console.log('');
  console.log('To revert the test row:');
  console.log('');
  console.log(`  UPDATE lead_assignments`);
  console.log(`  SET status='pitched', sold_at=NULL, paid_at=NULL,`);
  console.log(`      commission_amount_pence=NULL, commission_amount=NULL,`);
  console.log(`      stripe_session_id=NULL, stripe_customer_id=NULL,`);
  console.log(`      customer_email=NULL`);
  console.log(`  WHERE id = '${ASSIGNMENT_ID}';`);
} else {
  console.log('❌ Webhook rejected the event.');
  console.log('');
  if (responseText.includes('signature') || responseText.includes('signatures')) {
    console.log('→ Likely cause: STRIPE_WEBHOOK_SECRET on Vercel does not match');
    console.log('  the secret on this Stripe webhook endpoint. Re-copy from');
    console.log('  Stripe Dashboard → Webhooks → endpoint → Signing secret,');
    console.log('  paste into Vercel, redeploy.');
  }
  process.exit(2);
}
