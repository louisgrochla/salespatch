import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { ResearchSubNav } from "../../_components/SubNav";
import { LiteratureForm } from "../_components/LiteratureForm";
import { updateLiterature, deleteLiterature } from "../actions";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const POSITION_COLOR: Record<string, string> = {
  supports: "text-status-closed",
  challenges: "text-status-rejected",
  contextualises: "text-phase-one",
};

export default async function LiteratureDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const e = await prisma.literatureEntry.findUnique({
    where: { id: params.id },
    include: { sectionLinks: { include: { section: true } } },
  });
  if (!e) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updateLiterature.bind(null, e.id);
  const deleteAction = deleteLiterature.bind(null, e.id);

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title={e.title}
        subtitle={
          <span>
            <span className="font-mono">{e.authors}</span>
            <span className="ml-2 text-fg-dim">{e.year ?? "n.d."}</span>
            {e.position && (
              <span className={cn("ml-3 uppercase", POSITION_COLOR[e.position])}>{e.position}</span>
            )}
          </span>
        }
        actions={
          editing ? (
            <HeaderLink href={`/research/literature/${e.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/research/literature/${e.id}?edit=1`}>edit</HeaderLink>
              <Link href="/research/literature"
                className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg
                           border border-border hover:border-border-strong px-2 py-1">
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <LiteratureForm
          action={updateAction}
          cancelHref={`/research/literature/${e.id}`}
          submitLabel="Save changes"
          initial={{
            title: e.title, authors: e.authors, year: e.year, url: e.url, doi: e.doi,
            abstract: e.abstract, themeTags: e.themeTags, personalNotes: e.personalNotes,
            position: e.position,
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
          <div className="space-y-4">
            {e.abstract && (
              <div className="border border-border bg-bg-panel p-4">
                <div className="h-section mb-2">abstract</div>
                <p className="font-sans text-sm text-fg leading-relaxed">{e.abstract}</p>
              </div>
            )}
            {e.personalNotes && (
              <div className="border border-border bg-bg-panel p-4">
                <div className="h-section mb-2">personal notes</div>
                <Markdown source={e.personalNotes} />
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="border border-border bg-bg-panel divide-y divide-border">
              <Row label="url">
                {e.url ? <a href={e.url} target="_blank" rel="noreferrer noopener" className="text-accent underline break-all">{e.url}</a> : "—"}
              </Row>
              <Row label="doi">
                {e.doi ? <a href={`https://doi.org/${e.doi}`} target="_blank" rel="noreferrer noopener" className="text-accent underline">{e.doi}</a> : "—"}
              </Row>
              <Row label="themes">
                {e.themeTags.length === 0 ? "—" : (
                  <div className="flex gap-1 flex-wrap">
                    {e.themeTags.map((t) => (
                      <span key={t} className="border border-border px-1.5 py-0.5 text-2xs">{t}</span>
                    ))}
                  </div>
                )}
              </Row>
            </div>

            <div className="border border-border bg-bg-panel">
              <div className="px-3 py-2 border-b border-border h-section">cited in sections</div>
              {e.sectionLinks.length === 0 ? (
                <div className="px-3 py-3 font-mono text-xs text-fg-dim">Not cited yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {e.sectionLinks.map(({ section: s }) => (
                    <li key={s.id} className="px-3 py-2">
                      <Link href={`/research/sections/${s.id}`} className="font-mono text-xs text-fg hover:underline">
                        {s.chapter}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-3 px-3 py-2">
      <div className="h-section pt-0.5">{label}</div>
      <div className="font-mono text-xs text-fg">{children}</div>
    </div>
  );
}
