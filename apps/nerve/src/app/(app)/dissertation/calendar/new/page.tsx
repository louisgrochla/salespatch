import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { CalendarForm } from "../_form";
import { createCalendarItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCalendarPage() {
  const sections = await prisma.dissertationSection.findMany({
    orderBy: { chapter: "asc" }, select: { id: true, chapter: true },
  });
  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader title="New Milestone" />
      <CalendarForm action={createCalendarItem} sections={sections}
        cancelHref="/dissertation/calendar" submitLabel="Create milestone" />
    </div>
  );
}
