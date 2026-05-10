import { createHmac, timingSafeEqual } from "node:crypto";
import type { OutcomeIngestPayload } from "./types";

/** Stable canonicalisation for HMAC signing. Keys sorted, JSON-stringified. */
export function canonicalBody(payload: OutcomeIngestPayload): string {
  return JSON.stringify(payload, Object.keys(payload).sort());
}

export function signBody(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const candidate = header.startsWith("sha256=") ? header.slice(7) : header;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (candidate.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
