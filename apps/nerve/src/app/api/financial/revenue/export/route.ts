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

  const rows = await prisma.revenueEntry.findMany({ orderBy: { date: "desc" } });
  const flat = rows.map((r) => ({
    id: r.id, date: r.date, dealReference: r.dealReference,
    amount: Number(r.amount), notes: r.notes, phaseLabel: r.phaseLabel,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  }));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `nerve-revenue-${stamp}.${format}`;

  if (format === "json") {
    return new NextResponse(JSON.stringify(flat, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const cols: { key: keyof (typeof flat)[number] & string }[] = [
    { key: "id" }, { key: "date" }, { key: "dealReference" }, { key: "amount" },
    { key: "notes" }, { key: "phaseLabel" }, { key: "createdAt" }, { key: "updatedAt" },
  ];
  return new NextResponse(toCsv(flat, cols), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
