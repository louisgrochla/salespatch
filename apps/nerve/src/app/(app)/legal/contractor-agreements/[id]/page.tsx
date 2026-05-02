import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { Markdown } from "@/components/Markdown";
import { LegalSubNav } from "../../_components/SubNav";
import { AgreementForm } from "../_form";
import { updateAgreement, deleteAgreement } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({
  params, searchParams,
}: { params: { id: string }; searchParams: { edit?: string } }) {
  const r = await prisma.contractorAgreementVersion.findUnique({ where: { id: params.id } });
  if (!r) notFound();
  const editing = searchParams.edit === "1";
  const updateAction = updateAgreement.bind(null, r.id);
  const deleteAction = deleteAgreement.bind(null, r.id);
  return (
    <div className="p-6">
      <LegalSubNav />
      <PageHeader title={`Contractor agreement v${r.version}`} subtitle={format(r.date, "EEE dd LLL yyyy")}
        actions={editing ? <HeaderLink href={`/legal/contractor-agreements/${r.id}`}>cancel edit</HeaderLink> : (
          <>
            <form action={deleteAction}><button type="submit" className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">delete</button></form>
            <HeaderLink href={`/legal/contractor-agreements/${r.id}?edit=1`}>edit</HeaderLink>
            <Link href="/legal/contractor-agreements" className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1">back</Link>
          </>
        )} />
      {editing ? (
        <AgreementForm action={updateAction} cancelHref={`/legal/contractor-agreements/${r.id}`} submitLabel="Save changes" initial={r} />
      ) : (
        <article className="border border-border bg-bg-panel p-6 max-w-4xl"><Markdown source={r.content} /></article>
      )}
    </div>
  );
}
