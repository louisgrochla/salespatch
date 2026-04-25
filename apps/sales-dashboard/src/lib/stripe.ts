/**
 * Lazy Stripe client accessor.
 *
 * Initialising Stripe at module-load time (the `new Stripe(process.env...!)`
 * pattern) throws during Vercel's "Collecting page data" build step if
 * STRIPE_SECRET_KEY isn't set, killing the whole build. We defer the
 * instantiation to the first request so:
 *   - builds never fail on missing Stripe credentials
 *   - non-payment routes are untouched when payments aren't configured
 *   - payment routes return a clean 503 instead of a build-time crash
 */
import Stripe from 'stripe';

let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Payment routes require Stripe credentials.',
    );
  }
  _client = new Stripe(key);
  return _client;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
