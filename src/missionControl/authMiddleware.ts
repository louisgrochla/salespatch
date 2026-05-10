import { IncomingMessage } from "node:http";
import { timingSafeEqual } from "node:crypto";

const EXEMPT_PATHS = ["/api/health", "/api/outcomes/ingest"];

export function authenticateRequest(
  req: IncomingMessage,
  token: string | undefined,
): { ok: boolean; error?: string } {
  if (!token) {
    // No token configured — auth disabled (dev mode)
    return { ok: true };
  }

  const url = req.url ?? "";
  const path = url.split("?")[0];

  if (EXEMPT_PATHS.includes(path)) {
    return { ok: true };
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, error: "Missing or invalid Authorization header" };
  }

  const provided = authHeader.slice(7);
  if (!safeEqual(provided, token)) {
    return { ok: false, error: "Invalid token" };
  }

  return { ok: true };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
