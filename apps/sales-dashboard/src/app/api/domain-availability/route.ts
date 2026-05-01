/**
 * GET /api/domain-availability?domain=example.co.uk
 *
 * Public, no auth. Customer-facing check used in /onboarding so we never
 * suggest (or accept) a domain that's already taken.
 *
 * Backed by free RDAP via the rdap.org public bootstrap gateway, which
 * auto-routes to the right registry per TLD (Nominet for .uk, Verisign for
 * .com/.net, PIR for .org, etc.). One endpoint, no per-TLD branching.
 *
 * Status semantics:
 *   - HTTP 200 → domain is REGISTERED → available: false
 *   - HTTP 404 → domain is UNREGISTERED → available: true
 *   - any other → checked: false (don't lie about availability)
 *
 * Response: { domain, available: boolean | null, checked: boolean, reason?: string }
 *
 * In-memory cache with 5-minute TTL keyed by domain. Lambda cold-starts will
 * empty it; that's fine — the customer's typing burst stays warm within one
 * session.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface CacheEntry {
  result: AvailabilityResult;
  expires_at: number;
}

interface AvailabilityResult {
  domain: string;
  available: boolean | null;
  checked: boolean;
  reason?: string;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function rdapUrl(domain: string): string {
  return `https://rdap.org/domain/${encodeURIComponent(domain)}`;
}

function normaliseDomain(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  // Allow http(s):// and trailing slash; strip them.
  const stripped = trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  // Basic shape check — must have at least one dot and only valid chars.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(stripped)) return null;
  if (stripped.length > 253) return null;
  return stripped;
}

async function checkDomain(domain: string): Promise<AvailabilityResult> {
  const cached = cache.get(domain);
  if (cached && cached.expires_at > Date.now()) return cached.result;

  let result: AvailabilityResult;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 4500);
    const res = await fetch(rdapUrl(domain), {
      signal: ctrl.signal,
      headers: { Accept: 'application/rdap+json, application/json' },
      redirect: 'follow',
      cache: 'no-store',
    });
    clearTimeout(timeout);

    if (res.status === 200) {
      result = { domain, available: false, checked: true };
    } else if (res.status === 404) {
      result = { domain, available: true, checked: true };
    } else {
      result = {
        domain,
        available: null,
        checked: false,
        reason: `rdap_status_${res.status}`,
      };
    }
  } catch (err) {
    result = {
      domain,
      available: null,
      checked: false,
      reason: err instanceof Error ? err.message : 'rdap_error',
    };
  }

  cache.set(domain, { result, expires_at: Date.now() + TTL_MS });
  return result;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('domain');
  const domain = normaliseDomain(raw);
  if (!domain) {
    return NextResponse.json(
      { error: 'Invalid or missing domain', available: null, checked: false },
      { status: 400 },
    );
  }
  const result = await checkDomain(domain);
  return NextResponse.json(result);
}
