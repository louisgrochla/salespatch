import { createHmac } from 'crypto';

// HMAC-signed GET helper for NERVE /api/read/* endpoints. Mirrors the
// canonical-query-string signing scheme used by the existing
// `nerve-ingest.ts` POST helper, and by `~/.claude/scripts/nerve/
// get-ingest.sh`.
//
// Caller passes the endpoint path (e.g. "/api/read/pending-assignments")
// and an optional query map. Helper sorts the query keys alphabetically,
// joins as `k=v&...`, signs that exact string with OUTCOME_INGEST_SECRET,
// and sends the result as `X-Read-Signature: sha256=<hex>`.
//
// Returns a normalised result envelope so callers don't have to guess
// between thrown errors and non-2xx responses. Reuses the same env vars
// the B1 producer wires (OUTCOME_INGEST_SECRET) — already set in the
// sales-dashboard Vercel project.

const DEFAULT_BASE_URL = 'https://nerve.salespatch.co.uk';

export interface NerveReadResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

export async function nerveGet<T = unknown>(
  endpoint: string,
  query: Record<string, string | number | undefined | null> = {},
): Promise<NerveReadResult<T>> {
  const secret = process.env.OUTCOME_INGEST_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      data: null,
      error: 'OUTCOME_INGEST_SECRET not configured on sales-dashboard',
    };
  }
  const baseUrl = process.env.NERVE_BASE_URL ?? DEFAULT_BASE_URL;
  const canonical = canonicalQuery(query);
  const url = canonical ? `${baseUrl}${endpoint}?${canonical}` : `${baseUrl}${endpoint}`;
  const sig = `sha256=${createHmac('sha256', secret).update(canonical).digest('hex')}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-Read-Signature': sig },
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 500, data: null, error: String(err) };
  }
}

function canonicalQuery(
  params: Record<string, string | number | undefined | null>,
): string {
  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    entries.push([k, String(v)]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${v}`).join('&');
}
