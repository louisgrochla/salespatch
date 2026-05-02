import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PhasePill } from "@/components/PhasePill";
import { OperationsForm } from "../_components/OperationsForm";
import { updateOperationsLog, deleteOperationsLog } from "../actions";
import { format, formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export default async function OperationsDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string };
}) {
  const row = await prisma.operationsLog.findUnique({ where: { id: params.id } });
  if (!row) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updateOperationsLog.bind(null, row.id);
  const deleteAction = deleteOperationsLog.bind(null, row.id);

  const headline = (() => {
    if (row.type === "weekly") return firstLine(row.body) || "weekly entry";
    if (row.type === "decision") return firstLine(row.decision) || "decision";
    if (row.type === "failure") return firstLine(row.whatFailed) || "failure";
    return firstLine(row.whatChanged) || "iteration";
  })();

  return (
    <div className="p-6">
      <PageHeader
        title={headline}
        subtitle={
          <span>
            <span className="uppercase">{row.type}</span> · {format(row.date, "EEE dd LLL yyyy · HH:mm")}
            <span className="ml-3 text-fg-dim">created {formatDistanceToNow(row.createdAt, { addSuffix: true })}</span>
          </span>
        }
        actions={
          editing ? (
            <HeaderLink href={`/operations/${row.id}`}>cancel edit</HeaderLink>
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
              <HeaderLink href={`/operations/${row.id}?edit=1`}>edit</HeaderLink>
              <Link
                href="/operations"
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
        <OperationsForm
          action={updateAction}
          cancelHref={`/operations/${row.id}`}
          submitLabel="Save changes"
          initial={{
            date: row.date,
            type: row.type,
            body: row.body,
            decision: row.decision,
            reasoning: row.reasoning,
            outcome: row.outcome,
            whatFailed: row.whatFailed,
            why: row.why,
            whatChanged: row.whatChanged,
            beforeState: row.beforeState,
            afterState: row.afterState,
            tags: row.tags,
          }}
        />
      ) : (
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-3xl">
          <Row label="phase"><PhasePill phase={row.phaseLabel} /></Row>
          {row.type === "weekly" && <Block label="body" value={row.body} />}
          {row.type === "decision" && (
            <>
              <Block label="decision" value={row.decision} />
              <Block label="reasoning" value={row.reasoning} />
              <Block label="outcome" value={row.outcome} />
            </>
          )}
          {row.type === "failure" && (
            <>
              <Block label="what failed" value={row.whatFailed} />
              <Block label="why" value={row.why} />
              <Block label="what changed" value={row.whatChanged} />
            </>
          )}
          {row.type === "iteration" && (
            <>
              <Block label="what changed" value={row.whatChanged} />
              <Block label="before state" value={row.beforeState} />
              <Block label="after state" value={row.afterState} />
            </>
          )}
          <Row label="tags">
            {row.tags.length === 0 ? "—" : row.tags.join(", ")}
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

function Block({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2">
      <div className="h-section pt-0.5">{label}</div>
      <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">
        {value ?? "—"}
      </pre>
    </div>
  );
}

function firstLine(s: string | null): string {
  if (!s) return "";
  const trimmed = s.trim();
  const idx = trimmed.indexOf("\n");
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
}
