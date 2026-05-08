import { createHash } from "node:crypto";

/**
 * A/B arm picker. Deterministic given a stable lead_id so a re-run of the
 * same lead picks the same arm — preserves split integrity across reruns
 * and crash recovery.
 *
 * Usage at solo-founder volumes (~50 demos/summer): you'll rarely have
 * enough volume per arm to make significance claims. The harness exists
 * so the path is in place for autumn 2026 when n>20 per arm becomes
 * achievable.
 */

export interface AbVariant<T = unknown> {
  arm: string;
  payload: T;
  /** Optional weight for non-50/50 splits (default 1). */
  weight?: number;
}

export interface AbAssignment<T = unknown> {
  arm: string;
  variant: AbVariant<T>;
  /** Hash bucket 0..999 — useful for quantile inspection. */
  bucket: number;
  /** Key components used to derive the bucket — helps debug "why this arm?". */
  key: string;
}

/**
 * Pick deterministically by lead_id. The experiment id is salt so you can
 * run two experiments against the same lead population without correlated
 * arm assignment.
 */
export function pickArm<T>(
  variants: AbVariant<T>[],
  context: { lead_id: string; experiment_id: string },
): AbAssignment<T> {
  if (variants.length === 0) throw new Error("pickArm: no variants supplied");
  if (variants.length === 1) {
    return {
      arm: variants[0].arm,
      variant: variants[0],
      bucket: 0,
      key: `${context.experiment_id}:${context.lead_id}`,
    };
  }

  const key = `${context.experiment_id}:${context.lead_id}`;
  const bucket = hashToBucket(key);

  const totalWeight = variants.reduce((s, v) => s + (v.weight ?? 1), 0);
  const scaled = (bucket / 1000) * totalWeight;

  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight ?? 1;
    if (scaled < cumulative) {
      return { arm: v.arm, variant: v, bucket, key };
    }
  }
  // Numerical edge — return last variant.
  const last = variants[variants.length - 1];
  return { arm: last.arm, variant: last, bucket, key };
}

function hashToBucket(key: string): number {
  const digest = createHash("sha256").update(key).digest();
  // Use first 4 bytes, modulo 1000.
  const n = digest.readUInt32BE(0);
  return n % 1000;
}
