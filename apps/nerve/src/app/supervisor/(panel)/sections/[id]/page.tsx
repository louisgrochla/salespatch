import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { SupervisorSubNav } from "../../_components/SubNav";
import { Markdown } from "@/components/Markdown";
import { setSectionFeedback } from "../../../actions";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  not_started: "text-fg-dim",
  draft: "text-status-followup",
  in_progress: "text-phase-one",
  complete: "text-status-closed",
};

export default async function SupervisorSectionDetail({
  params,
}: {
  params: { id: string };
}) {
  const section = await prisma.dissertationSection.findUnique({
    where: { id: params.id },
    include: { literatureLinks: { include: { literature: true } } },
  });
  if (!section) notFound();

  const feedbackAction = setSectionFeedback.bind(null, section.id);

  return (
    <div className="space-y-4">
      <SupervisorSubNav />

      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-sans text-xl font-medium text-fg">{section.chapter}</h1>
          <div className="font-mono text-2xs text-fg-dim mt-1">
            <span className={cn("uppercase", STATUS_COLOR[section.status])}>{section.status.replace("_", " ")}</span>
            <span className="ml-3">{section.wordCount.toLocaleString()} words</span>
            {section.wordCountTarget && (
              <span className="ml-3">/ target {section.wordCountTarget.toLocaleString()}</span>
            )}
            <span className="ml-3">updated {formatDistanceToNow(section.updatedAt, { addSuffix: true })}</span>
          </div>
        </div>
        <Link href="/supervisor/sections" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">
          back
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
        <article className="border border-border bg-bg-panel p-6 min-h-[20rem]">
          <Markdown source={section.content} />
        </article>

        <aside className="space-y-4">
          <div className="border border-border bg-bg-panel">
            <div className="px-3 py-2 border-b border-border h-section">linked literature</div>
            {section.literatureLinks.length === 0 ? (
              <div className="px-3 py-3 font-mono text-xs text-fg-dim">No links yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {section.literatureLinks.map(({ literature: l }) => (
                  <li key={l.id} className="px-3 py-2">
                    <div className="font-mono text-xs text-fg">{l.authors} ({l.year ?? "n.d."})</div>
                    <div className="font-mono text-2xs text-fg-dim mt-0.5">{l.title}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form action={feedbackAction} className="border border-border bg-bg-panel">
            <div className="px-3 py-2 border-b border-border h-section flex items-center justify-between">
              <span>your feedback</span>
              <span className="font-mono text-2xs text-fg-dim">writes back to founder</span>
            </div>
            <textarea
              name="feedback"
              rows={8}
              defaultValue={section.supervisorFeedback ?? ""}
              placeholder="Comments, suggestions, references the founder should consider…"
              className="w-full bg-transparent text-fg font-mono text-xs px-3 py-3 outline-none resize-none"
            />
            <div className="border-t border-border px-3 py-2 flex items-center justify-between">
              <span className="font-mono text-2xs text-fg-dim">
                Your only write action — saved against this section.
              </span>
              <button type="submit" className="font-sans text-sm font-medium px-3 py-1 bg-fg text-bg hover:bg-fg-muted">
                Save
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
