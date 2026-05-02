import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { toCsv } from "@/lib/csv";
import { anonContractor } from "@/lib/anonymise";

export const dynamic = "force-dynamic";

// Anonymised pitch export — no business name, no contractor id, no notes,
// no deal value. Same data the supervisor sees on /supervisor/pitches.

function buildWhere(p: URLSearchParams): Prisma.PitchLogWhereInput {
  const where: Prisma.PitchLogWhereInput = {};
  if (p.get("phase")) where.phaseLabel = p.get("phase")!;
  const out = p.get("outcome");
  if (out === "closed" || out === "rejected" || out === "follow_up") {
    where.outcome = out;
  }
  if (p.get("sector")) where.sector = p.get("sector")!;
  if (p.get("after") || p.get("before")) {
    where.date = {};
    if (p.get("after")) where.date.gte = new Date(p.get("after")!);
    if (p.get("before")) where.date.lte = new Date(p.get("before")!);
  }
  return where;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "supervisor") {
    return NextResponse.json({ error: "supervisor only" }, { status: 403 });
  }

  const url = new URL(req.url);
  const where = buildWhere(url.searchParams);

  const rows = await prisma.pitchLog.findMany({
    where, orderBy: { date: "desc" },
    select: {
      id: true, date: true, businessType: true, sector: true, location: true,
      leadSource: true, demoVersion: true, outcome: true,
      contractorId: true, pitchDuration: true, consentFlag: true,
      phaseLabel: true, createdAt: true,
      objections: { include: { objection: true } },
    },
  });

  const flat = rows.map((r) => ({
    pitchId: r.id, date: r.date,
    businessType: r.businessType, sector: r.sector, location: r.location,
    leadSource: r.leadSource, demoVersion: r.demoVersion, outcome: r.outcome,
    contractorAnonId: anonContractor(r.contractorId),
    pitchDuration: r.pitchDuration, consentFlag: r.consentFlag,
    objections: r.objections.map((o) => o.objection.name),
    phaseLabel: r.phaseLabel, createdAt: r.createdAt,
  }));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cols: { key: keyof (typeof flat)[number] & string }[] = [
    { key: "pitchId" }, { key: "date" }, { key: "businessType" }, { key: "sector" },
    { key: "location" }, { key: "leadSource" }, { key: "demoVersion" }, { key: "outcome" },
    { key: "contractorAnonId" }, { key: "pitchDuration" }, { key: "consentFlag" },
    { key: "objections" }, { key: "phaseLabel" }, { key: "createdAt" },
  ];

  return new NextResponse(toCsv(flat, cols), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nerve-supervisor-pitches-${stamp}.csv"`,
    },
  });
}
