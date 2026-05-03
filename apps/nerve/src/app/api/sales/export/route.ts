import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function buildWhere(p: URLSearchParams): Prisma.PitchLogWhereInput {
  const where: Prisma.PitchLogWhereInput = {};
  const outcome = p.get("outcome");
  const validOutcomes = ["closed", "rejected", "follow_up", "closed_now", "closed_followup", "not_pitched"] as const;
  if (outcome && (validOutcomes as readonly string[]).includes(outcome)) {
    where.outcome = outcome as (typeof validOutcomes)[number];
  }
  if (p.get("phase")) where.phaseLabel = p.get("phase")!;
  if (p.get("sector")) where.sector = p.get("sector");
  if (p.get("businessType")) where.businessType = p.get("businessType");
  if (p.get("leadSource")) where.leadSource = p.get("leadSource");
  if (p.get("demoVersion")) where.demoVersion = p.get("demoVersion");
  if (p.get("contractorId")) where.contractorId = p.get("contractorId");
  if (p.get("q")) where.businessName = { contains: p.get("q")!, mode: "insensitive" };
  return where;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const where = buildWhere(url.searchParams);

  const pitches = await prisma.pitchLog.findMany({
    where,
    orderBy: { date: "desc" },
    include: { objections: { include: { objection: true } } },
  });

  const flat = pitches.map((p) => ({
    id: p.id,
    date: p.date,
    businessName: p.businessName,
    businessType: p.businessType,
    sector: p.sector,
    location: p.location,
    leadSource: p.leadSource,
    demoVersion: p.demoVersion,
    outcome: p.outcome,
    contractorId: p.contractorId,
    pitchDuration: p.pitchDuration,
    consentFlag: p.consentFlag,
    notes: p.notes,
    objections: p.objections.map((o) => o.objection.name),
    phaseLabel: p.phaseLabel,
    source: p.source,
    supabasePitchId: p.supabasePitchId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `nerve-pitches-${stamp}.${format}`;

  if (format === "json") {
    return new NextResponse(JSON.stringify(flat, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const columns: { key: keyof (typeof flat)[number] & string; header?: string }[] = [
    { key: "id" },
    { key: "date" },
    { key: "businessName" },
    { key: "businessType" },
    { key: "sector" },
    { key: "location" },
    { key: "leadSource" },
    { key: "demoVersion" },
    { key: "outcome" },
    { key: "contractorId" },
    { key: "pitchDuration" },
    { key: "consentFlag" },
    { key: "notes" },
    { key: "objections" },
    { key: "phaseLabel" },
    { key: "source" },
    { key: "supabasePitchId" },
    { key: "createdAt" },
    { key: "updatedAt" },
  ];

  const csv = toCsv(flat, columns);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
