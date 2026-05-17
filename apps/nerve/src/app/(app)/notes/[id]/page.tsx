import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { Markdown } from "@/components/Markdown";
import { NoteForm } from "../_components/NoteForm";
import { updateNote, deleteNote } from "../actions";
import { format, formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export default async function NoteDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string };
}) {
  const row = await prisma.note.findUnique({ where: { id: params.id } });
  if (!row) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updateNote.bind(null, row.id);
  const deleteAction = deleteNote.bind(null, row.id);

  return (
    <div className="p-6">
      <PageHeader
        title={row.title}
        subtitle={
          <span>
            <span className="uppercase">{row.scope}</span>
            {row.relatedSlug && <span className="ml-2 text-accent">· {row.relatedSlug}</span>}
            <span className="ml-3 text-fg-dim">
              updated {format(row.updatedAt, "EEE dd LLL yyyy · HH:mm")} ·
              created {formatDistanceToNow(row.createdAt, { addSuffix: true })}
            </span>
          </span>
        }
        actions={
          editing ? (
            <HeaderLink href={`/notes/${row.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button
                  type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1"
                >
                  delete
                </button>
              </form>
              <HeaderLink href={`/notes/${row.id}?edit=1`}>edit</HeaderLink>
              <Link
                href="/notes"
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
        <NoteForm
          action={updateAction}
          cancelHref={`/notes/${row.id}`}
          submitLabel="Save changes"
          initial={{
            title: row.title,
            scope: row.scope,
            body: row.body,
            relatedSlug: row.relatedSlug,
            tags: row.tags,
          }}
        />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <Row label="phase"><PhasePill phase={row.phaseLabel} /></Row>
          {row.relatedSlug && <Row label="related slug">{row.relatedSlug}</Row>}
          <Row label="tags">
            {row.tags.length === 0 ? "—" : row.tags.join(", ")}
          </Row>
          <div className="px-4 py-3">
            <div className="h-section mb-2">body</div>
            <Markdown source={row.body} />
          </div>
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
