import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { ChangelogForm } from "../_form";
import { updateChangelog, deleteChangelog } from "../actions";

export const dynamic = "force-dynamic";

export default async function ChangelogDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const e = await prisma.systemChangelog.findUnique({ where: { id: params.id } });
  if (!e) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateChangelog.bind(null, e.id);
  const deleteAction = deleteChangelog.bind(null, e.id);
  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader title={`v${e.version}`} subtitle={format(e.date, "EEE dd LLL yyyy")}
        actions={editing ? <HeaderLink href={`/product/changelog/${e.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/product/changelog/${e.id}?edit=1`}>edit</HeaderLink>
            <Link href="/product/changelog" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <ChangelogForm action={updateAction} cancelHref={`/product/changelog/${e.id}`} submitLabel="Save changes" initial={e} />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <div className="px-4 py-3"><div className="h-section mb-1">what changed</div><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{e.whatChanged}</pre></div>
          <div className="px-4 py-3"><div className="h-section mb-1">why</div><pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{e.why ?? "—"}</pre></div>
        </div>
      )}
    </div>
  );
}
