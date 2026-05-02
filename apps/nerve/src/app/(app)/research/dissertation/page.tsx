import { prisma } from "@/lib/db";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { Field, TextInput, TextArea, Select, SubmitButton } from "@/components/Form";
import { Markdown } from "@/components/Markdown";
import { ResearchSubNav } from "../_components/SubNav";
import { updateDissertationMeta } from "./actions";

export const dynamic = "force-dynamic";

export default async function DissertationPage({
  searchParams,
}: {
  searchParams: { edit?: string; history?: string };
}) {
  const meta = await prisma.dissertationMeta.findUnique({ where: { id: "main" } });
  const editing = searchParams.edit === "1" || !meta;
  const showHistory = searchParams.history === "1";

  const [titleVersions, rqVersions] = await Promise.all([
    prisma.workingTitleVersion.findMany({
      where: { dissertationId: "main" }, orderBy: { createdAt: "desc" },
    }),
    prisma.researchQuestionVersion.findMany({
      where: { dissertationId: "main" }, orderBy: { createdAt: "desc" },
    }),
  ]);

  const deadline = meta?.submissionDeadline
    ? format(meta.submissionDeadline, "yyyy-MM-dd")
    : "";

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="Dissertation"
        subtitle={meta
          ? <>updated {formatDistanceToNow(meta.updatedAt, { addSuffix: true })} · {titleVersions.length} title revision{titleVersions.length === 1 ? "" : "s"} · {rqVersions.length} RQ revision{rqVersions.length === 1 ? "" : "s"}</>
          : "no record yet — fill the form below to initialise"}
        actions={
          editing ? (
            <HeaderLink href="/research/dissertation">view</HeaderLink>
          ) : (
            <>
              <HeaderLink href={`/research/dissertation?history=${showHistory ? "0" : "1"}`}>
                {showHistory ? "hide" : "show"} history
              </HeaderLink>
              <HeaderLink href="/research/dissertation?edit=1">edit</HeaderLink>
            </>
          )
        }
      />

      {editing ? (
        <form action={updateDissertationMeta} className="space-y-4 max-w-3xl">
          <Field label="working title" required hint="Versioned. Every change appended to history.">
            <TextArea name="workingTitle" rows={3} required defaultValue={meta?.workingTitle ?? ""} />
          </Field>
          <Field label="research question" required hint="Versioned. The full evolution is preserved.">
            <TextArea name="researchQuestion" rows={4} required defaultValue={meta?.researchQuestion ?? ""} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="degree" hint="e.g. BA (Hons) Digital Marketing and Business Analytics">
              <TextInput name="degree" defaultValue={meta?.degree ?? ""} />
            </Field>
            <Field label="institution">
              <TextInput name="institution" defaultValue={meta?.institution ?? ""} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="supervisor">
              <TextInput name="supervisor" defaultValue={meta?.supervisor ?? ""} />
            </Field>
            <Field label="submission deadline" hint="Set when confirmed; use the note field while TBC.">
              <TextInput type="date" name="submissionDeadline" defaultValue={deadline} />
            </Field>
            <Field label="overall status" required>
              <Select name="overallStatus" required defaultValue={meta?.overallStatus ?? "in_progress"}>
                <option value="not_started">not started</option>
                <option value="draft">draft</option>
                <option value="in_progress">in progress</option>
                <option value="complete">complete</option>
              </Select>
            </Field>
          </div>

          <Field label="submission deadline note" hint="Free text — use until the exact deadline is confirmed.">
            <TextInput name="submissionDeadlineNote" defaultValue={meta?.submissionDeadlineNote ?? ""} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="word count target — min">
              <TextInput type="number" min={0} name="wordCountTargetMin" defaultValue={meta?.wordCountTargetMin ?? ""} />
            </Field>
            <Field label="word count target — max">
              <TextInput type="number" min={0} name="wordCountTargetMax" defaultValue={meta?.wordCountTargetMax ?? ""} />
            </Field>
          </div>

          <Field label="academic framing"
            hint="The reusable paragraph that describes the study to a supervisor in the right register. Surfaced by /ask whenever the dissertation framing is queried.">
            <TextArea name="academicFraming" rows={6} defaultValue={meta?.academicFraming ?? ""} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="degree relevance — digital marketing" hint="Markdown. Use bullet lines.">
              <TextArea name="degreeRelevanceMarketing" rows={6} defaultValue={meta?.degreeRelevanceMarketing ?? ""} />
            </Field>
            <Field label="degree relevance — business analytics" hint="Markdown. Use bullet lines.">
              <TextArea name="degreeRelevanceAnalytics" rows={6} defaultValue={meta?.degreeRelevanceAnalytics ?? ""} />
            </Field>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <SubmitButton>{meta ? "Save changes" : "Initialise dissertation"}</SubmitButton>
          </div>
        </form>
      ) : meta ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
          <div className="space-y-4">
            <div className="border border-border bg-bg-panel divide-y divide-border">
              <Block label="working title" value={meta.workingTitle} />
              <Block label="research question" value={meta.researchQuestion} />
              <Row label="degree">{meta.degree ?? "—"}</Row>
              <Row label="institution">{meta.institution ?? "—"}</Row>
              <Row label="supervisor">{meta.supervisor ?? "—"}</Row>
              <Row label="submission">
                {meta.submissionDeadline
                  ? <>{format(meta.submissionDeadline, "EEE dd LLL yyyy")} <span className="text-fg-dim">({daysFromNow(meta.submissionDeadline)} days)</span></>
                  : meta.submissionDeadlineNote ?? "—"}
              </Row>
              <Row label="word count target">
                {meta.wordCountTargetMin && meta.wordCountTargetMax
                  ? `${meta.wordCountTargetMin.toLocaleString()} — ${meta.wordCountTargetMax.toLocaleString()} words`
                  : meta.wordCountTargetMax
                    ? `${meta.wordCountTargetMax.toLocaleString()} words`
                    : "—"}
              </Row>
              <Row label="status">{meta.overallStatus.replace("_", " ")}</Row>
            </div>

            {meta.academicFraming && (
              <div className="border border-border bg-bg-panel">
                <div className="px-4 py-2 border-b border-border h-section flex items-center justify-between">
                  <span>academic framing</span>
                  <span className="font-mono text-2xs text-fg-dim">surfaced by /ask</span>
                </div>
                <div className="p-4">
                  <Markdown source={meta.academicFraming} />
                </div>
              </div>
            )}

            {(meta.degreeRelevanceMarketing || meta.degreeRelevanceAnalytics) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {meta.degreeRelevanceMarketing && (
                  <div className="border border-border bg-bg-panel">
                    <div className="px-4 py-2 border-b border-border h-section">
                      degree relevance — digital marketing
                    </div>
                    <div className="p-4">
                      <Markdown source={meta.degreeRelevanceMarketing} />
                    </div>
                  </div>
                )}
                {meta.degreeRelevanceAnalytics && (
                  <div className="border border-border bg-bg-panel">
                    <div className="px-4 py-2 border-b border-border h-section">
                      degree relevance — business analytics
                    </div>
                    <div className="p-4">
                      <Markdown source={meta.degreeRelevanceAnalytics} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {showHistory && (
            <aside className="space-y-4">
              <HistoryBlock title={`working title (${titleVersions.length})`} versions={titleVersions} />
              <HistoryBlock title={`research question (${rqVersions.length})`} versions={rqVersions} />
            </aside>
          )}
        </div>
      ) : null}
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

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 px-4 py-2">
      <div className="h-section pt-0.5">{label}</div>
      <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">{value}</pre>
    </div>
  );
}

function HistoryBlock({
  title, versions,
}: { title: string; versions: { id: string; value: string; createdAt: Date }[] }) {
  return (
    <div className="border border-border bg-bg-panel">
      <div className="px-3 py-2 border-b border-border h-section">{title}</div>
      {versions.length === 0 ? (
        <div className="px-3 py-4 font-mono text-xs text-fg-dim text-center">No revisions yet.</div>
      ) : (
        <ul className="divide-y divide-border">
          {versions.map((v, i) => (
            <li key={v.id} className="px-3 py-2">
              <div className="flex items-center gap-2 text-2xs text-fg-dim font-mono">
                <span className="text-fg-muted">v{versions.length - i}</span>
                <span>{format(v.createdAt, "dd LLL yyyy · HH:mm")}</span>
              </div>
              <div className="font-mono text-xs text-fg whitespace-pre-wrap mt-1">{v.value}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function daysFromNow(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
