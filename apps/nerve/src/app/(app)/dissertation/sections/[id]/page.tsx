import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { ResearchSubNav } from "../../_components/SubNav";
import { SectionForm, type LiteratureOption } from "../_components/SectionForm";
import { updateSection, deleteSection } from "../actions";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  not_started: "text-fg-dim",
  draft: "text-status-followup",
  in_progress: "text-phase-one",
  complete: "text-status-closed",
};

export default async function SectionDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string; history?: string };
}) {
  const section = await prisma.dissertationSection.findUnique({
    where: { id: params.id },
    include: {
      literatureLinks: { include: { literature: true } },
      versions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!section) notFound();

  const editing = searchParams.edit === "1";
  const showHistory = searchParams.history === "1";

  const literature = await prisma.literatureEntry.findMany({
    orderBy: [{ year: "desc" }, { authors: "asc" }],
    select: { id: true, title: true, authors: true, year: true },
  });
  const options: LiteratureOption[] = literature;

  const updateAction = updateSection.bind(null, section.id);
  const deleteAction = deleteSection.bind(null, section.id);

  const linkedIds = section.literatureLinks.map((l) => l.literatureId);
  const pct = section.wordCountTarget && section.wordCountTarget > 0
    ? Math.min(1, section.wordCount / section.wordCountTarget) : null;

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title={section.chapter}
        subtitle={
          <span>
            <span className={cn("uppercase", STATUS_COLOR[section.status])}>
              {section.status.replace("_", " ")}
            </span>
            <span className="ml-3">{section.wordCount.toLocaleString()} words</span>
            {section.wordCountTarget ? (
              <span className="ml-3 text-fg-dim">
                / {section.wordCountTarget.toLocaleString()} ({(pct! * 100).toFixed(0)}%)
              </span>
            ) : null}
            <span className="ml-3 text-fg-dim">
              updated {formatDistanceToNow(section.updatedAt, { addSuffix: true })}
            </span>
          </span>
        }
        actions={
          editing ? (
            <HeaderLink href={`/dissertation/sections/${section.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/dissertation/sections/${section.id}?history=${showHistory ? "0" : "1"}`}>
                {showHistory ? "hide" : "show"} history
              </HeaderLink>
              <HeaderLink href={`/dissertation/sections/${section.id}?edit=1`}>edit</HeaderLink>
              <Link
                href="/dissertation/sections"
                className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg
                           border border-border hover:border-border-strong px-2 py-1"
              >
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <SectionForm
          action={updateAction}
          literatureOptions={options}
          cancelHref={`/dissertation/sections/${section.id}`}
          submitLabel="Save changes"
          initial={{
            chapter: section.chapter,
            content: section.content,
            status: section.status,
            wordCountTarget: section.wordCountTarget,
            supervisorFeedback: section.supervisorFeedback,
            literatureIds: linkedIds,
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
          <div className="border border-border bg-bg-panel p-6 min-h-[20rem]">
            <Markdown source={section.content} />
          </div>
          <aside className="space-y-4">
            {section.supervisorFeedback && (
              <div className="border border-border bg-bg-panel">
                <div className="px-3 py-2 border-b border-border h-section">supervisor feedback</div>
                <pre className="px-3 py-2 font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">
                  {section.supervisorFeedback}
                </pre>
              </div>
            )}

            <div className="border border-border bg-bg-panel">
              <div className="px-3 py-2 border-b border-border h-section">linked literature</div>
              {section.literatureLinks.length === 0 ? (
                <div className="px-3 py-3 font-mono text-xs text-fg-dim">No links yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {section.literatureLinks.map(({ literature: l }) => (
                    <li key={l.id} className="px-3 py-2">
                      <Link href={`/dissertation/literature/${l.id}`} className="font-mono text-xs text-fg hover:underline">
                        {l.authors} ({l.year ?? "n.d."})
                      </Link>
                      <div className="font-mono text-2xs text-fg-dim mt-0.5">{l.title}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {showHistory && (
              <div className="border border-border bg-bg-panel">
                <div className="px-3 py-2 border-b border-border h-section">
                  version history ({section.versions.length})
                </div>
                {section.versions.length === 0 ? (
                  <div className="px-3 py-3 font-mono text-xs text-fg-dim">No revisions saved.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {section.versions.map((v) => (
                      <li key={v.id} className="px-3 py-2">
                        <div className="font-mono text-2xs text-fg-dim">
                          {format(v.createdAt, "dd LLL yyyy · HH:mm")}
                        </div>
                        <div className="font-mono text-xs text-fg mt-0.5">
                          {v.wordCount.toLocaleString()} words
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
