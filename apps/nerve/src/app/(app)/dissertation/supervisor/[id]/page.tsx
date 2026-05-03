import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { MeetingForm } from "../_form";
import { updateMeeting, deleteMeeting } from "../actions";

export const dynamic = "force-dynamic";

export default async function MeetingDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const m = await prisma.supervisorMeeting.findUnique({ where: { id: params.id } });
  if (!m) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updateMeeting.bind(null, m.id);
  const deleteAction = deleteMeeting.bind(null, m.id);

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title={`Supervisor: ${format(m.date, "dd LLL yyyy")}`}
        subtitle={format(m.date, "EEE HH:mm")}
        actions={
          editing ? (
            <HeaderLink href={`/dissertation/supervisor/${m.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/dissertation/supervisor/${m.id}?edit=1`}>edit</HeaderLink>
              <Link href="/dissertation/supervisor" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <MeetingForm action={updateAction} cancelHref={`/dissertation/supervisor/${m.id}`} submitLabel="Save changes" initial={m} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <Block label="notes" value={m.notes} />
          <Block label="feedback" value={m.feedback} />
          <Block label="agreed actions" value={m.agreedActions} />
          <Block label="follow-up status" value={m.followUpStatus} />
        </div>
      )}
    </div>
  );
}

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2">
      <div className="h-section pt-0.5">{label}</div>
      <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{value ?? "—"}</pre>
    </div>
  );
}
