import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { ProductSubNav } from "../../_components/SubNav";
import { PromptForm } from "../_form";
import { updatePrompt, deletePrompt } from "../actions";

export const dynamic = "force-dynamic";

export default async function PromptDetailPage({
  params, searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string; v?: string };
}) {
  const prompt = await prisma.promptLibraryEntry.findUnique({
    where: { id: params.id },
    include: { versions: { orderBy: { versionNumber: "desc" } } },
  });
  if (!prompt) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updatePrompt.bind(null, prompt.id);
  const deleteAction = deletePrompt.bind(null, prompt.id);

  // The version selected for body display. Defaults to current.
  const requestedVersion = searchParams.v ? Number(searchParams.v) : prompt.versionNumber;
  const selected = prompt.versions.find((v) => v.versionNumber === requestedVersion) ?? null;

  return (
    <div className="p-6">
      <ProductSubNav />
      <PageHeader
        title={prompt.name}
        subtitle={
          <span>
            <span className="font-mono">v{prompt.versionNumber}</span>
            <span className="ml-3 text-fg-muted">{prompt.model}</span>
            <span className="ml-3 text-fg-dim">
              updated {formatDistanceToNow(prompt.updatedAt, { addSuffix: true })}
            </span>
            <span className="ml-3 text-fg-dim">{prompt.versions.length} version{prompt.versions.length === 1 ? "" : "s"}</span>
          </span>
        }
        actions={
          editing ? (
            <HeaderLink href={`/product/prompts/${prompt.id}`}>cancel edit</HeaderLink>
          ) : (
            <>
              <form action={deleteAction}>
                <button type="submit"
                  className="font-mono text-2xs uppercase tracking-wider text-status-rejected
                             hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1">
                  delete
                </button>
              </form>
              <HeaderLink href={`/product/prompts/${prompt.id}?edit=1`}>edit</HeaderLink>
              <Link href="/product/prompts"
                className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg
                           border border-border hover:border-border-strong px-2 py-1">
                back
              </Link>
            </>
          )
        }
      />

      {editing ? (
        <PromptForm action={updateAction} cancelHref={`/product/prompts/${prompt.id}`} submitLabel="Save changes"
          nameDisabled
          initial={{
            name: prompt.name, fullText: prompt.fullText, model: prompt.model,
            performanceNotes: prompt.performanceNotes, tags: prompt.tags,
          }} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
          <div className="space-y-4">
            <div className="border border-border bg-bg-panel">
              <div className="px-4 py-2 border-b border-border h-section flex items-center justify-between">
                <span>
                  prompt body
                  {selected && selected.versionNumber !== prompt.versionNumber && (
                    <span className="ml-3 text-status-followup">
                      viewing v{selected.versionNumber} of {prompt.versions.length}
                    </span>
                  )}
                </span>
                {selected && selected.versionNumber !== prompt.versionNumber && (
                  <Link href={`/product/prompts/${prompt.id}`} className="text-accent">
                    return to current
                  </Link>
                )}
              </div>
              <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed p-4">
                {selected?.fullText ?? prompt.fullText}
              </pre>
            </div>

            <div className="border border-border bg-bg-panel">
              <div className="px-4 py-2 border-b border-border h-section">performance notes</div>
              <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed p-4">
                {(selected?.performanceNotes ?? prompt.performanceNotes) || "—"}
              </pre>
            </div>

            {prompt.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {prompt.tags.map((t) => (
                  <span key={t} className="border border-border px-1.5 py-0.5 text-2xs font-mono">{t}</span>
                ))}
              </div>
            )}
          </div>

          <aside>
            <div className="border border-border bg-bg-panel">
              <div className="px-3 py-2 border-b border-border h-section">version history</div>
              <ul className="divide-y divide-border">
                {prompt.versions.map((v) => {
                  const active = v.versionNumber === (selected?.versionNumber ?? prompt.versionNumber);
                  return (
                    <li key={v.id}>
                      <Link
                        href={`/product/prompts/${prompt.id}${v.versionNumber === prompt.versionNumber ? "" : `?v=${v.versionNumber}`}`}
                        className={`block px-3 py-2 hover:bg-bg-hover ${active ? "bg-bg-hover border-l-2 border-accent" : ""}`}
                      >
                        <div className="flex items-center gap-2 font-mono text-2xs">
                          <span className="text-fg">v{v.versionNumber}</span>
                          {v.versionNumber === prompt.versionNumber && (
                            <span className="text-status-closed">current</span>
                          )}
                        </div>
                        <div className="font-mono text-2xs text-fg-dim mt-0.5">
                          {format(v.createdAt, "dd LLL yyyy · HH:mm")}
                        </div>
                        <div className="font-mono text-2xs text-fg-muted mt-0.5">{v.model}</div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
