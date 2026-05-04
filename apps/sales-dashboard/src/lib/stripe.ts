/**
 * Stripe client — mode-aware (test vs live).
 *
 * STRIPE_MODE=test → uses STRIPE_TEST_* env vars (sk_test_…)
 * STRIPE_MODE=live (default) → uses STRIPE_* env vars (sk_live_…)
 *
 * The mode/key prefix check is defence-in-depth: if STRIPE_MODE=test but
 * the key starts with sk_live_, we refuse to instantiate. This stops
 * "accidentally charged a real card in dev" failures cold.
 *
 * Lazy instantiation — initialising at module-load throws during Vercel's
 * "Collecting page data" build step if env is missing. We defer to first
 * request so non-payment routes are unaffected when Stripe isn't configured.
 */
import Stripe from 'stripe';

export type StripeMode = 'test' | 'live';

let _client: Stripe | null = null;
let _clientMode: StripeMode | null = null;

export function getStripeMode(): StripeMode {
  const raw = process.env.STRIPE_MODE ?? 'live';
  if (raw !== 'test' && raw !== 'live') {
    throw new Error(`Invalid STRIPE_MODE: "${raw}". Must be 'test' or 'live'.`);
  }
  return raw;
}

export function getStripeSecretKey(): string {
  const mode = getStripeMode();
  const envName = mode === 'test' ? 'STRIPE_TEST_SECRET_KEY' : 'STRIPE_SECRET_KEY';
  const key = process.env[envName];
  if (!key) {
    throw new Error(`${envName} is not set (STRIPE_MODE=${mode}).`);
  }
  const expectedPrefix = mode === 'test' ? 'sk_test_' : 'sk_live_';
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(
      `${envName} does not start with ${expectedPrefix} (STRIPE_MODE=${mode}). Refusing to use.`,
    );
  }
  return key;
}

export function getStripePublishableKey(): string | null {
  const mode = getStripeMode();
  const key =
    mode === 'test'
      ? process.env.STRIPE_TEST_PUBLISHABLE_KEY
      : process.env.STRIPE_PUBLISHABLE_KEY;
  return key ?? null;
}

export function getStripeWebhookSecret(): string {
  const mode = getStripeMode();
  const envName =
    mode === 'test' ? 'STRIPE_TEST_WEBHOOK_SECRET' : 'STRIPE_WEBHOOK_SECRET';
  const secret = process.env[envName];
  if (!secret) {
    throw new Error(`${envName} is not set (STRIPE_MODE=${mode}).`);
  }
  return secret;
}

/**
 * Stripe Price ID for the £25/mo "Hosting & support" subscription.
 *
 * Must be set up once in the Stripe Dashboard per mode:
 *   STRIPE_TEST_HOSTING_PRICE_ID  — for STRIPE_MODE=test
 *   STRIPE_HOSTING_PRICE_ID       — for STRIPE_MODE=live
 *
 * The webhook reads this when creating the £25/mo subscription after a
 * successful setup payment (£299 beta price, see lib/payments.ts). If
 * unset, the subscription is skipped and the setup fee still captures —
 * ops can manually attach a subscription.
 */
export function getStripeHostingPriceId(): string | null {
  const mode = getStripeMode();
  const envName =
    mode === 'test' ? 'STRIPE_TEST_HOSTING_PRICE_ID' : 'STRIPE_HOSTING_PRICE_ID';
  return process.env[envName] ?? null;
}

export function getStripe(): Stripe {
  const mode = getStripeMode();
  if (_client && _clientMode === mode) return _client;
  _client = new Stripe(getStripeSecretKey());
  _clientMode = mode;
  return _client;
}

export function isStripeConfigured(): boolean {
  try {
    getStripeSecretKey();
    return true;
  } catch {
    return false;
  }
}
