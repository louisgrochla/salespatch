import { NextRequest, NextResponse } from "next/server";
import { qaVisualResultStore } from "@/lib/sl-mas/qaVisualResultStore";

// GET /api/read/qa-visual/baselines?vertical=<slug>
//
// PR-G: cohort baselines for visual-QA grading. Returns the vertical's
// median grades + cohort rates so producers can attach a per-demo
// baseline_comparison to fresh runs.
//
// Vertical filter is optional — when omitted, returns vertical-agnostic
// baselines across every visual-QA run in the warehouse. Useful for
// debugging / system-wide health monitoring; producers should pass a
// specific vertical for the per-demo comparison.
//
// Below n=10 the medians are noise; the endpoint returns
// `baselines_available: false` with a `sample_size_warning` so producers
// know to attach the field with empty dimensions rather than treat
// missing baselines as a failure.
//
// Read endpoints exempt from HMAC; founder-session middleware applies
// per the (app) layout.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const verticalParam = searchParams.get("vertical");
  const vertical = verticalParam && verticalParam.length > 0 ? verticalParam : null;

  try {
    const summary = await qaVisualResultStore.computeBaselines(vertical);
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: `baselines query failed: ${String(e)}` },
      { status: 500 },
    );
  }
}
