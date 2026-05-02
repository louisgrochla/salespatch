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

  const rows = await prisma.dissertationSection.findMany({
    orderBy: { chapter: "asc" },
    include: { literatureLinks: { include: { literature: true } } },
  });

  const flat = rows.map((r) => ({
    id: r.id,
    chapter: r.chapter,
    status: r.status,
    wordCount: r.wordCount,
    wordCountTarget: r.wordCountTarget,
    content: r.content,
    supervisorFeedback: r.supervisorFeedback,
    linkedLiterature: r.literatureLinks.map((l) => `${l.literature.authors} (${l.literature.year ?? "n.d."})`),
    phaseLabel: r.phaseLabel,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `nerve-sections-${stamp}.${format}`;

  if (format === "json") {
    return new NextResponse(JSON.stringify(flat, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const columns: { key: keyof (typeof flat)[number] & string }[] = [
    { key: "id" }, { key: "chapter" }, { key: "status" }, { key: "wordCount" },
    { key: "wordCountTarget" }, { key: "content" }, { key: "supervisorFeedback" },
    { key: "linkedLiterature" }, { key: "phaseLabel" },
    { key: "createdAt" }, { key: "updatedAt" },
  ];
  const csv = toCsv(flat, columns);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
