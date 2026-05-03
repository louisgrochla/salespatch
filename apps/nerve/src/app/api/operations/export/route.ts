import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function buildWhere(p: URLSearchParams): Prisma.OperationsLogWhereInput {
  const where: Prisma.OperationsLogWhereInput = {};
  const t = p.get("type");
  if (t === "weekly" || t === "decision" || t === "failure" || t === "iteration") {
    where.type = t;
  }
  if (p.get("phase")) where.phaseLabel = p.get("phase")!;
  if (p.get("tag")) where.tags = { has: p.get("tag")! };
  return where;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const where = buildWhere(url.searchParams);

  const rows = await prisma.operationsLog.findMany({
    where,
    orderBy: { date: "desc" },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `nerve-operations-${stamp}.${format}`;

  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const columns: { key: keyof (typeof rows)[number] & string; header?: string }[] = [
    { key: "id" },
    { key: "date" },
    { key: "type" },
    { key: "body" },
    { key: "decision" },
    { key: "reasoning" },
    { key: "outcome" },
    { key: "whatFailed" },
    { key: "why" },
    { key: "whatChanged" },
    { key: "beforeState" },
    { key: "afterState" },
    { key: "tags" },
    { key: "phaseLabel" },
    { key: "createdAt" },
    { key: "updatedAt" },
  ];

  const csv = toCsv(rows, columns);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
