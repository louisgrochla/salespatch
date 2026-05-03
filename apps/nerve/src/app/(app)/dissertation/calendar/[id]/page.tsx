import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { CalendarForm } from "../_form";
import { updateCalendarItem, deleteCalendarItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function CalendarDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const item = await prisma.academicCalendarItem.findUnique({
    where: { id: params.id },
    include: { dissertationSection: true },
  });
  if (!item) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updateCalendarItem.bind(null, item.id);
  const deleteAction = deleteCalendarItem.bind(null, item.id);

  const sections = await prisma.dissertationSection.findMany({
    orderBy: { chapter: "asc" }, select: { id: true, chapter: true },
  });

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title={item.milestone}
        subtitle={`${format(item.deadline, "EEE dd LLL yyyy")} · ${formatDistanceToNow(item.deadline, { addSuffix: true })}`}
        actions={
          editing ? (
            <HeaderLink href={`/dissertation/calendar/${item.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/dissertation/calendar/${item.id}?edit=1`}>edit</HeaderLink>
              <Link href="/dissertation/calendar" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <CalendarForm action={updateAction} sections={sections} cancelHref={`/dissertation/calendar/${item.id}`} submitLabel="Save changes"
          initial={{ milestone: item.milestone, deadline: item.deadline, status: item.status, dissertationSectionId: item.dissertationSectionId }} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <Row label="status">{item.status.replace("_", " ")}</Row>
          <Row label="linked section">
            {item.dissertationSection
              ? <Link href={`/dissertation/sections/${item.dissertationSection.id}`} className="text-accent underline">{item.dissertationSection.chapter}</Link>
              : "—"}
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2">
      <div className="h-section pt-0.5">{label}</div>
      <div className="font-mono text-xs text-fg">{children}</div>
    </div>
  );
}
