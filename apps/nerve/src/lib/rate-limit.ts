// Best-effort in-process rate limiter. Counts are per Vercel function
// instance — on a multi-instance deployment, the effective ceiling is
// (perMinute * concurrent_instances). Good enough to deflect casual
// scraping; real protection needs Upstash Redis or similar.
//
// Usage:
//   const ok = takeToken(`metrics:${ip}`, 60); // 60 per minute per ip
//   if (!ok) return new Response("rate limited", { status: 429 });

interface Bucket {
  windowStart: number;
  count: number;
}

const buckets: Map<string, Bucket> = new Map();
const WINDOW_MS = 60_000;
const MAX_BUCKETS = 5_000; // hard cap; oldest evicted

export function takeToken(key: string, perMinute: number): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    b = { windowStart: now, count: 0 };
    buckets.set(key, b);
  }
  b.count++;
  if (buckets.size > MAX_BUCKETS) {
    // Drop the oldest bucket (Map iteration is insertion-order).
    const firstKey = buckets.keys().next().value;
    if (firstKey != null) buckets.delete(firstKey);
  }
  return b.count <= perMinute;
}

export function ipFromRequest(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
