import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { PitchForm } from "../_components/PitchForm";
import { PhasePill, StatusPill } from "@/components/PhasePill";
import { updatePitch, deletePitch } from "../actions";
import { format, formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PitchDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string };
}) {
  const pitch = await prisma.pitchLog.findUnique({
    where: { id: params.id },
    include: { objections: { include: { objection: true } } },
  });
  if (!pitch) notFound();

  const editing = searchParams.edit === "1";
  const updateAction = updatePitch.bind(null, pitch.id);
  const deleteAction = deletePitch.bind(null, pitch.id);

  const objections = pitch.objections.map((o) => o.objection.name);
  const meta = (
    <span>
      created <span className="text-fg-muted">{formatDistanceToNow(pitch.createdAt, { addSuffix: true })}</span>
      {pitch.source === "webhook" && <span className="ml-3 text-fg-muted">via webhook</span>}
      {pitch.supabasePitchId && (
        <span className="ml-3 text-fg-dim">supabase: {pitch.supabasePitchId}</span>
      )}
    </span>
  );

  return (
    <div className="p-6">
      <PageHeader
        title={pitch.businessName}
        subtitle={meta}
        actions={
          editing ? (
            <HeaderLink href={`/sales/${pitch.id}`}>cancel edit</HeaderLink>
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
              <HeaderLink href={`/sales/${pitch.id}?edit=1`}>edit</HeaderLink>
              <Link
                href="/sales"
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
        <PitchForm
          action={updateAction}
          cancelHref={`/sales/${pitch.id}`}
          submitLabel="Save changes"
          initial={{
            date: pitch.date,
            businessName: pitch.businessName,
            businessType: pitch.businessType,
            sector: pitch.sector,
            location: pitch.location,
            leadSource: pitch.leadSource,
            demoVersion: pitch.demoVersion,
            outcome: pitch.outcome,
            contractorId: pitch.contractorId,
            pitchDuration: pitch.pitchDuration,
            consentFlag: pitch.consentFlag,
            notes: pitch.notes,
            objections,
          }}
        />
      ) : (
        <div className="space-y-4 max-w-3xl">
          <div className="border border-border bg-bg-panel divide-y divide-border">
            <Row label="date">{format(pitch.date, "EEE dd LLL yyyy · HH:mm")}</Row>
            <Row label="outcome"><StatusPill status={pitch.outcome} /></Row>
            <Row label="quality">
              <span className={pitch.qualityFlag === "ok" ? "text-status-closed" : "text-status-rejected"}>
                {pitch.qualityFlag}
              </span>
              {pitch.qualityFlag === "excluded" && (
                <span className="ml-2 text-fg-dim">(excluded from dissertation analysis)</span>
              )}
            </Row>
            <Row label="phase"><PhasePill phase={pitch.phaseLabel} /></Row>
            <Row label="business type">{pitch.businessType ?? "—"}</Row>
            <Row label="sector">{pitch.sector ?? "—"}</Row>
            <Row label="location">{pitch.location ?? "—"}</Row>
            <Row label="lead source">{pitch.leadSource ?? "—"}</Row>
            <Row label="demo version">{pitch.demoVersion ?? "—"}</Row>
            <Row label="contractor">{pitch.contractorId ?? "—"}</Row>
            <Row label="attempt #">{pitch.pitchAttemptNumber}</Row>
            <Row label="duration">
              {pitch.pitchDuration == null ? "—" : `${pitch.pitchDuration}s (${Math.round(pitch.pitchDuration / 60)}m)`}
            </Row>
          </div>

          <div className="border border-border bg-bg-panel divide-y divide-border">
            <SectionHeader>questionnaire</SectionHeader>
            <Row label="decision-maker">
              {pitch.decisionMakerPresent == null ? "—" : pitch.decisionMakerPresent ? "✓ present" : "✗ absent"}
            </Row>
            <Row label="demo shown">
              {pitch.demoShown == null ? "—" : pitch.demoShown ? "✓ yes" : "✗ no"}
            </Row>
            <Row label="interest level">{pitch.interestLevel ?? "—"}</Row>
            {pitch.demoReaction && <Row label="demo reaction">{pitch.demoReaction}</Row>}
            {pitch.agreedPrice != null && (
              <Row label="agreed price">£{Number(pitch.agreedPrice).toFixed(2)}</Row>
            )}
            {pitch.paymentMethod && (
              <Row label="payment">{pitch.paymentMethod.replace(/_/g, " ")}</Row>
            )}
            {pitch.bestFollowupTime && (
              <Row label="follow-up when">{pitch.bestFollowupTime.replace(/_/g, " ")}</Row>
            )}
            {pitch.agreedNextStep && (
              <Row label="next step">{pitch.agreedNextStep.replace(/_/g, " ")}</Row>
            )}
            <Row label="objections">
              {objections.length === 0 ? "—" : objections.join(", ")}
            </Row>
            <Row label="consent">{pitch.consentToRecord ? "✓ to record" : pitch.consentFlag ? "✓ legacy" : "—"}</Row>
          </div>

          {(pitch.gutFeelClosePct != null || pitch.firstResponsePhrase || pitch.competitorMentioned || pitch.notes) && (
            <div className="border border-border bg-bg-panel divide-y divide-border">
              <SectionHeader>texture</SectionHeader>
              {pitch.gutFeelClosePct != null && (
                <Row label="gut-feel close">
                  <span className="text-fg">{pitch.gutFeelClosePct}%</span>
                  <span className="ml-2 text-fg-dim">SP&apos;s pre-outcome estimate</span>
                </Row>
              )}
              {pitch.firstResponsePhrase && (
                <Row label="first response">
                  <span className="italic">&ldquo;{pitch.firstResponsePhrase}&rdquo;</span>
                </Row>
              )}
              {pitch.competitorMentioned && (
                <Row label="competitor">{pitch.competitorMentioned}</Row>
              )}
              {pitch.notes && (
                <Row label="notes">
                  <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">
                    {pitch.notes}
                  </pre>
                </Row>
              )}
            </div>
          )}

          {(pitch.gpsLat != null && pitch.gpsLng != null) && (
            <div className="border border-border bg-bg-panel divide-y divide-border">
              <SectionHeader>location</SectionHeader>
              <Row label="gps">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${pitch.gpsLat}&mlon=${pitch.gpsLng}#map=18/${pitch.gpsLat}/${pitch.gpsLng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:text-fg"
                >
                  {pitch.gpsLat.toFixed(5)}, {pitch.gpsLng.toFixed(5)}
                </a>
              </Row>
            </div>
          )}
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

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 bg-bg-raised">
      <div className="h-section">{children}</div>
    </div>
  );
}
