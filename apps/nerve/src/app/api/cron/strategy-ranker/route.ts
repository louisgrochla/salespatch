import { NextRequest, NextResponse } from "next/server";
import { runStrategyRankerOnce } from "@/lib/sl-mas/strategyRanker";

// GET /api/cron/strategy-ranker
//
// Scheduled by Vercel Cron (vercel.json). Runs the SL-MAS StrategyRanker
// nightly at 03:00 UTC. Auth: CRON_SECRET in the Authorization header per
// Vercel convention.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // seconds — Pro plan default; Hobby caps at 10

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel sends `Authorization: Bearer ${CRON_SECRET}` for protected crons.
  const auth = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runStrategyRankerOnce();
    return NextResponse.json({
      ok: true,
      ...result,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
