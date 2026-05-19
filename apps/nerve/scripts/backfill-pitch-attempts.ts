/**
 * Backfill orphan pitch_attempts → NERVE PitchLog.
 *
 * After the Phase B HMAC migration (see PR #131), every iOS pitch
 * submitted via sales-dashboard between 2026-05-10 and the deploy of
 * the fix landed in Supabase `pitch_attempts.raw_payload` but never
 * reached NERVE — sales-dashboard's legacy NERVE_PITCH_SECRET signature
 * was rejected with 401 while the status cascade (which uses the
 * unified secret) kept succeeding. Result: leads stuck in `pitched`
 * stage in Lead Intelligence with no matching row in Sales Intelligence.
 *
 * This script reads every pitch_attempts row where forwarded_at is null
 * (or forward_error is populated), re-POSTs the original raw_payload to
 * the now-fixed NERVE /api/ingest/pitch endpoint, and on success updates
 * pitch_attempts.{nerve_pitch_id,quality_flag,forwarded_at,forward_error}
 * exactly the way the live route does.
 *
 * Idempotent: NERVE upserts on supabasePitchId so re-runs are no-ops for
 * already-forwarded pitches.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OUTCOME_INGEST_SECRET     — must match NERVE's value
 *   NERVE_BASE_URL            — defaults to https://nerve.salespatch.co.uk
 *
 * Usage:
 *   npx tsx scripts/backfill-pitch-attempts.ts --dry-run    # default
 *   npx tsx scripts/backfill-pitch-attempts.ts --apply
 *   npx tsx scripts/backfill-pitch-attempts.ts --apply --business "Chatty Patty"
 */

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

interface PitchAttemptRow {
  id: string;
  lead_id: string;
  user_id: string;
  assignment_id: string;
  outcome: string;
  raw_payload: Record<string, unknown> | null;
  pitched_at: string;
  forwarded_at: string | null;
  forward_error: string | null;
  nerve_pitch_id: string | null;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const dryRun = !apply;
  const businessFilter = readFlag("--business");

  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const ingestSecret = required("OUTCOME_INGEST_SECRET");
  const nerveBase = process.env.NERVE_BASE_URL ?? "https://nerve.salespatch.co.uk";

  const sb = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Pull every pitch_attempts row that hasn't successfully forwarded.
  // forwarded_at NULL is the "never reached NERVE" case; forward_error
  // not null is the "reached NERVE but it 401'd / 5xx'd" case. Both
  // need a retry.
  const { data, error } = await sb
    .from("pitch_attempts")
    .select(
      "id, lead_id, user_id, assignment_id, outcome, raw_payload, pitched_at, forwarded_at, forward_error, nerve_pitch_id",
    )
    .or("forwarded_at.is.null,forward_error.not.is.null")
    .order("pitched_at", { ascending: true });

  if (error) {
    console.error("[backfill] supabase read failed:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as PitchAttemptRow[];
  console.log(
    `[backfill] mode=${dryRun ? "dry-run" : "apply"} candidates=${rows.length}` +
      (businessFilter ? ` filter="${businessFilter}"` : ""),
  );

  let attempted = 0;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.raw_payload) {
      console.warn(`[skip] ${row.id} — raw_payload empty`);
      skipped += 1;
      continue;
    }

    const payload = row.raw_payload as Record<string, unknown>;
    const businessName = (payload.business_name as string | undefined) ?? "?";

    if (businessFilter && !businessName.toLowerCase().includes(businessFilter.toLowerCase())) {
      continue;
    }

    attempted += 1;

    const summary = `${row.pitched_at} · ${businessName} · ${row.outcome} (${row.user_id})`;

    if (dryRun) {
      console.log(`[would replay] ${summary}`);
      continue;
    }

    const result = await forwardOnce(payload, ingestSecret, nerveBase);
    if (result.ok === true) {
      succeeded += 1;
      console.log(`[ok] ${summary} → nerve=${result.nervePitchId} quality=${result.qualityFlag}`);
      await sb
        .from("pitch_attempts")
        .update({
          nerve_pitch_id: result.nervePitchId,
          quality_flag: result.qualityFlag,
          forwarded_at: new Date().toISOString(),
          forward_error: null,
        })
        .eq("id", row.id);
      continue;
    }
    failed += 1;
    console.error(`[fail] ${summary} — ${result.error}`);
    await sb
      .from("pitch_attempts")
      .update({ forward_error: result.error })
      .eq("id", row.id);
  }

  console.log(
    `[backfill] done · attempted=${attempted} succeeded=${succeeded} failed=${failed} skipped=${skipped}`,
  );
  if (dryRun) {
    console.log("[backfill] dry-run only — re-run with --apply to commit");
  }
}

async function forwardOnce(
  payload: Record<string, unknown>,
  secret: string,
  baseUrl: string,
): Promise<
  | { ok: true; nervePitchId: string; qualityFlag: string }
  | { ok: false; error: string }
> {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  try {
    const res = await fetch(`${baseUrl}/api/ingest/pitch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingest-Signature": signature,
      },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as {
      pitchId?: string;
      qualityFlag?: string;
      error?: string;
    };
    if (!res.ok || json.error || !json.pitchId) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      nervePitchId: json.pitchId,
      qualityFlag: json.qualityFlag ?? "unknown",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[backfill] missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

function readFlag(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  const v = process.argv[idx + 1];
  return v && !v.startsWith("--") ? v : null;
}

main().catch((e) => {
  console.error("[backfill] fatal:", e);
  process.exit(1);
});
