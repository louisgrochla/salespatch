import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, type AppRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
import { Sidebar, type SidebarCounts } from "@/components/Sidebar";
import { SessionProvider } from "@/components/SessionProvider";
import { prisma } from "@/lib/db";
import { countPendingBuilds } from "@/lib/supabase-builds";

async function loadCounts(): Promise<SidebarCounts> {
  try {
    const [
      pitches,
      operations,
      revenue,
      prompts,
      demos,
      leads,
      builds,
      literature,
      sections,
      brand,
      legal,
      changelog,
      notes,
      qaVisual,
    ] = await Promise.all([
      prisma.pitchLog.count(),
      prisma.operationsLog.count(),
      prisma.revenueEntry.count(),
      prisma.promptLibraryEntry.count(),
      // R7: sidebar count reflects the actively-populated DemoArtefact
      // table (every /build-demo skill run) rather than the legacy
      // DemoRecord manual-entry table.
      prisma.demoArtefact.count(),
      prisma.leadRecord.count(),
      // Pending-builds count comes from Supabase, not Prisma — wrap so a
      // missing service-role key never breaks the layout shell.
      countPendingBuilds().catch(() => 0),
      prisma.literatureEntry.count(),
      prisma.dissertationSection.count(),
      prisma.brandDocument.count(),
      prisma.legalDocument.count(),
      prisma.changelogEntry.count(),
      prisma.note.count(),
      prisma.qaVisualResult.count(),
    ]);
    return {
      pitches, operations, revenue, prompts, demos, leads, builds,
      literature, sections, brand, legal, changelog, notes, qaVisual,
    };
  } catch {
    // DB not provisioned yet — render with empty counts so the shell still loads.
    return {};
  }
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  // Defence-in-depth role enforcement on top of middleware. A
  // supervisor session signed in via /supervisor/login MUST NOT see
  // founder content even if middleware misconfigures.
  const role = (session.user as { role?: AppRole }).role ?? "founder";
  if (role !== "founder") redirect("/supervisor");

  const counts = await loadCounts();

  return (
    <SessionProvider>
      <div className="flex min-h-screen">
        <Sidebar counts={counts} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </SessionProvider>
  );
}
