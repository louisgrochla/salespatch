import { NextRequest, NextResponse } from "next/server";
import { qaVisualResultStore } from "@/lib/sl-mas/qaVisualResultStore";

// GET /api/read/qa-visual/by-lead?lead_id=<slug>&limit=<int>
//
// Returns every visual-QA run for a given lead, newest first. Operator
// UI consumes this to surface "latest visual QA verdict for this lead"
// alongside the existing /api/read/qa-results/by-outcome (static QA).
//
// Read endpoints exempt from HMAC; founder-session middleware applies
// per the (app) layout.

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("lead_id");
  const limitParam = searchParams.get("limit");

  if (!leadId) {
    return NextResponse.json(
      { error: "lead_id query parameter required" },
      { status: 400 },
    );
  }
  const limit = limitParam ? Math.max(1, Math.min(200, Number(limitParam))) : 50;
  if (Number.isNaN(limit)) {
    return NextResponse.json(
      { error: "limit must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const rows = await qaVisualResultStore.listForLead(leadId, limit);
    return NextResponse.json({
      lead_id: leadId,
      count: rows.length,
      rows,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `read failed: ${String(e)}` },
      { status: 500 },
    );
  }
}
