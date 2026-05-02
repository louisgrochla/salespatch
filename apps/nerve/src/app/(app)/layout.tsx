import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
import { Sidebar, type SidebarCounts } from "@/components/Sidebar";
import { SessionProvider } from "@/components/SessionProvider";
import { prisma } from "@/lib/db";

async function loadCounts(): Promise<SidebarCounts> {
  try {
    const [
      pitches,
      operations,
      revenue,
      prompts,
      demos,
      leads,
      literature,
      sections,
      brand,
      legal,
    ] = await Promise.all([
      prisma.pitchLog.count(),
      prisma.operationsLog.count(),
      prisma.revenueEntry.count(),
      prisma.promptLibraryEntry.count(),
      prisma.demoRecord.count(),
      prisma.leadRecord.count(),
      prisma.literatureEntry.count(),
      prisma.dissertationSection.count(),
      prisma.brandDocument.count(),
      prisma.legalDocument.count(),
    ]);
    return {
      pitches, operations, revenue, prompts, demos, leads,
      literature, sections, brand, legal,
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
