import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// Export includes the FULL version history per prompt — never deleted,
// per spec. JSON nests; CSV emits one row per version.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  const prompts = await prisma.promptLibraryEntry.findMany({
    orderBy: { name: "asc" },
    include: { versions: { orderBy: { versionNumber: "asc" } } },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `nerve-prompts-${stamp}.${format}`;

  if (format === "json") {
    const out = prompts.map((p) => ({
      id: p.id,
      name: p.name,
      currentVersion: p.versionNumber,
      currentModel: p.model,
      currentText: p.fullText,
      currentPerformanceNotes: p.performanceNotes,
      tags: p.tags,
      phaseLabel: p.phaseLabel,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      versions: p.versions.map((v) => ({
        versionNumber: v.versionNumber,
        model: v.model,
        fullText: v.fullText,
        performanceNotes: v.performanceNotes,
        createdAt: v.createdAt,
      })),
    }));
    return new NextResponse(JSON.stringify(out, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // CSV: one row per version, with the prompt name + tag stamp on each.
  const flat = prompts.flatMap((p) =>
    p.versions.map((v) => ({
      promptId: p.id,
      promptName: p.name,
      tags: p.tags,
      versionNumber: v.versionNumber,
      model: v.model,
      fullText: v.fullText,
      performanceNotes: v.performanceNotes,
      versionCreatedAt: v.createdAt,
      isCurrent: v.versionNumber === p.versionNumber,
      phaseLabel: p.phaseLabel,
    })),
  );

  const cols: { key: keyof (typeof flat)[number] & string }[] = [
    { key: "promptId" }, { key: "promptName" }, { key: "tags" },
    { key: "versionNumber" }, { key: "model" }, { key: "fullText" },
    { key: "performanceNotes" }, { key: "versionCreatedAt" },
    { key: "isCurrent" }, { key: "phaseLabel" },
  ];
  return new NextResponse(toCsv(flat, cols), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
