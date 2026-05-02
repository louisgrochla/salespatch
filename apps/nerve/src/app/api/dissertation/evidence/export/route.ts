import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  const rows = await prisma.evidenceLog.findMany({
    orderBy: { createdAt: "desc" },
    include: { dissertationSection: { select: { chapter: true } } },
  });

  const flat = rows.map((r) => ({
    id: r.id,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    dissertationSection: r.dissertationSection?.chapter ?? null,
    annotation: r.annotation,
    phaseLabel: r.phaseLabel,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `nerve-evidence-${stamp}.${format}`;

  if (format === "json") {
    return new NextResponse(JSON.stringify(flat, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const columns: { key: keyof (typeof flat)[number] & string }[] = [
    { key: "id" }, { key: "sourceType" }, { key: "sourceId" },
    { key: "dissertationSection" }, { key: "annotation" }, { key: "phaseLabel" },
    { key: "createdAt" }, { key: "updatedAt" },
  ];
  return new NextResponse(toCsv(flat, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
