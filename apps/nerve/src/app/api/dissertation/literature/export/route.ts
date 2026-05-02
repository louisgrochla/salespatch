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

  const where: Record<string, unknown> = {};
  if (url.searchParams.get("theme")) where.themeTags = { has: url.searchParams.get("theme") };
  const pos = url.searchParams.get("position");
  if (pos === "supports" || pos === "challenges" || pos === "contextualises") {
    where.position = pos;
  }

  const rows = await prisma.literatureEntry.findMany({
    where,
    orderBy: [{ year: "desc" }, { authors: "asc" }],
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `nerve-literature-${stamp}.${format}`;

  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const columns: { key: keyof (typeof rows)[number] & string }[] = [
    { key: "id" }, { key: "title" }, { key: "authors" }, { key: "year" },
    { key: "url" }, { key: "doi" }, { key: "abstract" }, { key: "themeTags" },
    { key: "position" }, { key: "personalNotes" }, { key: "phaseLabel" },
    { key: "createdAt" }, { key: "updatedAt" },
  ];
  return new NextResponse(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
