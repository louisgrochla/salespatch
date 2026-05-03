import { NextRequest, NextResponse } from "next/server";
import { loadPublicMetrics } from "@/lib/public-metrics";
import { takeToken, ipFromRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RATE_PER_MINUTE = 60;

export async function GET(req: NextRequest) {
  const ip = ipFromRequest(req);
  if (!takeToken(`public-metrics:${ip}`, RATE_PER_MINUTE)) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    const data = await loadPublicMetrics();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        // Allow programmatic consumption (e.g. supervisor opens the page
        // from another origin); content is intentionally public.
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
