import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader, HeaderLink } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/cn";
import { LeadForm } from "../_form";
import { updateLead, deleteLead } from "../actions";
import { leadProfileStore } from "@/lib/sl-mas/leadProfileStore";
import { siteBriefStore } from "@/lib/sl-mas/siteBriefStore";
import { brandAnalysisStore } from "@/lib/sl-mas/brandAnalysisStore";
import { demoArtefactStore } from "@/lib/sl-mas/demoArtefactStore";
import { qaResultStore } from "@/lib/sl-mas/qaResultStore";
import { qaVisualResultStore } from "@/lib/sl-mas/qaVisualResultStore";
import { leadAssignmentEventStore } from "@/lib/sl-mas/leadAssignmentEventStore";
import { onboardingResponseStore } from "@/lib/sl-mas/onboardingResponseStore";
import { composerIterationStore } from "@/lib/sl-mas/composerIterationStore";
import { spendLedgerStore } from "@/lib/sl-mas/spendLedgerStore";
import { businessIdentityStore } from "@/lib/sl-mas/businessIdentityStore";
import { pitchBriefStore } from "@/lib/sl-mas/pitchBriefStore";
import { stripeEventStore } from "@/lib/sl-mas/stripeEventStore";
import { Section, Panel, Row, Swatch, formatIso, safeHost, outcomeColor } from "./_components/primitives";
import { NotesPanel } from "./_components/NotesPanel";
import { EmbeddingsPanel } from "./_components/EmbeddingsPanel";
import { QaVisualPanel } from "./_components/QaVisualPanel";
import { StripeEventsPanel } from "./_components/StripeEventsPanel";
import { LeadChatPanel } from "./_components/LeadChatPanel";
import { getLeadSourceIds } from "@/lib/sl-mas/leadEmbeddings";
import { isAskAvailable } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  not_contacted: "text-fg-dim",
  contacted: "text-phase-one",
  pitched: "text-status-followup",
  closed: "text-status-closed",
  rejected: "text-status-rejected",
};

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string };
}) {
  const routeParam = params.id;
  const editing = searchParams.edit === "1";

  // F1: also accept canonical BusinessIdentity.id (cuid) or .slug. If the
  // route param resolves to a canonical identity, use its slug as the
  // working `id` for the SL-MAS fan-out below.
  const canonicalIdentity = await businessIdentityStore.findByAnyId(routeParam);
  const id = canonicalIdentity?.slug ?? routeParam;

  // The route param is polymorphic: it can be either a NERVE `LeadRecord.id`
  // (cuid, intranet-created), an SL-MAS `lead_id` slug (skill-emitted), or
  // a canonical `BusinessIdentity.id`/`.slug` (Phase F1). The id-spaces
  // don't overlap today, so we query all of them and render whatever we
  // find. 404 only when none of them has a record.
  const [
    lead,
    profile,
    briefs,
    brand,
    demos,
    latestDemo,
    qaResults,
    qaVisualResults,
    assignmentEvents,
    composerIters,
    spendRows,
    pitchBriefs,
    latestPitchBrief,
    notes,
  ] = await Promise.all([
    prisma.leadRecord.findUnique({ where: { id } }),
    leadProfileStore.getByLeadId(id),
    siteBriefStore.listForLead(id, 20),
    brandAnalysisStore.latestForLead(id),
    demoArtefactStore.listForLead(id, 20),
    demoArtefactStore.latestForLead(id),
    qaResultStore.listForLead(id, 20),
    qaVisualResultStore.listForLead(id, 20),
    leadAssignmentEventStore.listForLead(id, 50),
    composerIterationStore.listByLead(id, 20),
    spendLedgerStore.listRecent(200, { lead_id: id }),
    pitchBriefStore.listForLead(id, 10),
    pitchBriefStore.latestForLead(id),
    prisma.note.findMany({
      where: { relatedSlug: id },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  const hasSlMasData =
    !!profile ||
    briefs.length > 0 ||
    !!brand ||
    demos.length > 0 ||
    qaResults.length > 0 ||
    qaVisualResults.length > 0 ||
    assignmentEvents.length > 0 ||
    composerIters.length > 0 ||
    spendRows.length > 0 ||
    pitchBriefs.length > 0 ||
    notes.length > 0;

  if (!lead && !hasSlMasData && !canonicalIdentity) notFound();

  const displayName =
    lead?.name ??
    profile?.business_name ??
    briefs[0]?.business_name ??
    demos[0]?.business_name ??
    canonicalIdentity?.business_name ??
    id;

  const latestBrief = briefs[0];

  // Pitch log matches on business_name (legacy join, pre-dates lead_id slug).
  const pitchLog = displayName
    ? await prisma.pitchLog.findMany({
        where: { businessName: displayName },
        orderBy: { date: "desc" },
        take: 50,
      })
    : [];

  // Onboarding: latest assignment for this lead, then form lookup by that id.
  const latestAssignmentId = assignmentEvents[0]?.assignment_id;
  const onboarding = latestAssignmentId
    ? await onboardingResponseStore.getByLeadAssignmentId(latestAssignmentId)
    : null;

  // R2: Stripe events across every assignment ever tied to this lead. A
  // lead might have been re-assigned, so iterate the assignment-event log
  // for unique assignment ids rather than only the latest.
  const assignmentIds = Array.from(
    new Set(
      assignmentEvents
        .map((e) => e.assignment_id)
        .filter((v): v is string => !!v),
    ),
  );
  const stripeEvents = await stripeEventStore.listForAssignments(
    assignmentIds,
    50,
  );

  // R2: RAG coverage for this lead — what does the vault actually know?
  // Aggregate embeddings whose sourceId matches any of the records we've
  // fetched for this lead. R3: source-id collection moved to the shared
  // `getLeadSourceIds` helper so /ask scoped chat uses the exact same list.
  const knownSourceIds = await getLeadSourceIds(id);
  const embeddingGroups = knownSourceIds.length > 0
    ? await prisma.embedding.groupBy({
        by: ["sourceType"],
        where: { sourceId: { in: knownSourceIds } },
        _count: { _all: true },
        _max: { createdAt: true },
      })
    : [];
  const totalEmbeddingChunks = embeddingGroups.reduce(
    (s, g) => s + g._count._all,
    0,
  );

  // R3: chats already scoped to this lead. Cheap lookup; we only need the
  // most recent 5 for the inline panel.
  const scopedChatSessions = await prisma.chatSession.findMany({
    where: { scopeLeadSlug: id },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
  const askAvailable = isAskAvailable();

  const subtitleBits: string[] = [];
  if (lead?.contactedStatus) subtitleBits.push(lead.contactedStatus.replace("_", " "));
  if (profile?.vertical) subtitleBits.push(profile.vertical);
  if (profile?.postcode) subtitleBits.push(profile.postcode);
  else if (lead?.location) subtitleBits.push(lead.location);
  if (lead?.doNotContact) subtitleBits.push("DNC");
  const subtitle = subtitleBits.join(" · ") || id;

  const updateAction = lead ? updateLead.bind(null, lead.id) : null;
  const deleteAction = lead ? deleteLead.bind(null, lead.id) : null;

  const actions =
    editing && updateAction ? (
      <HeaderLink href={`/leads/${id}`}>cancel edit</HeaderLink>
    ) : (
      <>
        {deleteAction && (
          <form action={deleteAction}>
            <button
              type="submit"
              className="font-mono text-2xs uppercase tracking-wider text-status-rejected hover:bg-status-rejected/10 border border-status-rejected/40 px-2 py-1"
            >
              delete
            </button>
          </form>
        )}
        {updateAction && <HeaderLink href={`/leads/${id}?edit=1`}>edit</HeaderLink>}
        <Link
          href="/leads"
          className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1"
        >
          back
        </Link>
      </>
    );

  // Edit mode applies only to the NERVE LeadRecord half — SL-MAS data is
  // read-only here; it's written by upstream producers (skills, Pi runtime).
  if (editing && lead && updateAction) {
    return (
      <div className="p-6">
        <PageHeader title={displayName} subtitle={subtitle} actions={actions} />
        <LeadForm
          action={updateAction}
          cancelHref={`/leads/${id}`}
          submitLabel="Save changes"
          initial={lead}
        />
      </div>
    );
  }

  const totalCostUsd = spendRows.reduce((s, r) => s + r.cost_usd, 0);
  const closedDeals = pitchLog.filter((p) => p.outcome === "closed");
  const closedRevenue = closedDeals.reduce(
    (s, p) => s + (p.agreedPrice ? Number(p.agreedPrice) : 0),
    0,
  );

  const hasAnyTiles =
    profile?.google_rating !== undefined ||
    profile?.instagram_followers !== undefined ||
    profile?.website_quality_score !== undefined ||
    pitchLog.length > 0 ||
    demos.length > 0 ||
    spendRows.length > 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <PageHeader title={displayName} subtitle={subtitle} actions={actions} />

      {hasAnyTiles && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {profile?.google_rating !== undefined && (
            <StatTile
              label="google rating"
              value={profile.google_rating.toFixed(1)}
              hint={`${profile.google_review_count ?? 0} reviews`}
            />
          )}
          {profile?.instagram_followers !== undefined && (
            <StatTile
              label="instagram followers"
              value={profile.instagram_followers.toLocaleString()}
              hint={
                profile.instagram_handle ? `@${profile.instagram_handle}` : undefined
              }
            />
          )}
          {profile?.website_quality_score !== undefined && (
            <StatTile
              label="website quality"
              value={`${profile.website_quality_score}/100`}
              hint={safeHost(profile.website_url)}
            />
          )}
          {pitchLog.length > 0 && (
            <StatTile
              label="pitches"
              value={pitchLog.length}
              hint={`${closedDeals.length} closed · £${closedRevenue.toLocaleString()}`}
            />
          )}
          {demos.length > 0 && (
            <StatTile
              label="demos"
              value={demos.length}
              hint={
                latestDemo ? `latest ${formatIso(latestDemo.generated_at)}` : undefined
              }
            />
          )}
          {spendRows.length > 0 && (
            <StatTile
              label="api spend"
              value={`$${totalCostUsd.toFixed(2)}`}
              hint={`${spendRows.length} call${spendRows.length === 1 ? "" : "s"}`}
            />
          )}
        </section>
      )}

      <LeadChatPanel
        leadSlug={id}
        displayName={displayName}
        askAvailable={askAvailable}
        embeddingsExist={totalEmbeddingChunks > 0}
        sessions={scopedChatSessions.map((s) => ({
          id: s.id,
          title: s.title,
          updatedAt: s.updatedAt,
          messageCount: s._count.messages,
        }))}
      />

      <NotesPanel notes={notes} />

      {lead && (
        <Section title="Lead record">
          <Panel>
            <Row label="type">{lead.type ?? "—"}</Row>
            <Row label="sector">{lead.sector ?? "—"}</Row>
            <Row label="location">{lead.location ?? "—"}</Row>
            <Row label="source">{lead.sourceMethod ?? "—"}</Row>
            <Row label="status">
              <span className={cn("uppercase", STATUS_COLOR[lead.contactedStatus])}>
                {lead.contactedStatus.replace("_", " ")}
              </span>
            </Row>
            <Row label="phase">{lead.phaseLabel}</Row>
            <Row label="notes">
              <pre className="font-mono text-xs text-fg whitespace-pre-wrap leading-relaxed">
                {lead.notes ?? "—"}
              </pre>
            </Row>
          </Panel>
        </Section>
      )}

      {latestBrief && (
        <Section
          title="Site brief"
          subtitle={`${latestBrief.verdict.toUpperCase()} · ${formatIso(latestBrief.generated_at)}${briefs.length > 1 ? ` · ${briefs.length} versions` : ""}`}
        >
          <Panel>
            {latestBrief.pitch_angle && (
              <Row label="pitch angle">{latestBrief.pitch_angle}</Row>
            )}
            {latestBrief.diagnosis && (
              <Row label="diagnosis">{latestBrief.diagnosis}</Row>
            )}
            {latestBrief.test_of_success && (
              <Row label="test of success">{latestBrief.test_of_success}</Row>
            )}
            {latestBrief.blueprint_sections &&
              latestBrief.blueprint_sections.length > 0 && (
                <Row label="blueprint">
                  <ul className="font-mono text-xs space-y-1">
                    {latestBrief.blueprint_sections.map((s, i) => (
                      <li key={i}>
                        <span className="text-fg">{s.name}</span>
                        {s.intent && (
                          <span className="text-fg-muted"> — {s.intent}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Row>
              )}
          </Panel>
          <details className="mt-3">
            <summary className="cursor-pointer font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg">
              full brief markdown
            </summary>
            <div className="mt-3 border border-border bg-bg-panel px-4 py-3 max-h-[60vh] overflow-y-auto">
              <Markdown source={latestBrief.brief_markdown} />
            </div>
          </details>
        </Section>
      )}

      {brand && (
        <Section
          title="Brand analysis"
          subtitle={brand.positioning_reference ?? formatIso(brand.analyzed_at)}
        >
          <Panel>
            {(brand.dominant_hex || brand.neutral_hex || brand.accent_hex) && (
              <Row label="palette">
                <div className="flex flex-wrap gap-3">
                  <Swatch hex={brand.dominant_hex} label="dominant" pct={brand.dominant_pct} />
                  <Swatch hex={brand.neutral_hex} label="neutral" pct={brand.neutral_pct} />
                  <Swatch hex={brand.accent_hex} label="accent" pct={brand.accent_pct} />
                </div>
              </Row>
            )}
            {(brand.display_font || brand.body_font || brand.mono_font) && (
              <Row label="typography">
                <div className="font-mono text-xs space-y-1">
                  {brand.display_font && (
                    <div>
                      display: <span className="text-fg">{brand.display_font}</span>
                      {brand.display_fallback ? ` (${brand.display_fallback})` : ""}
                    </div>
                  )}
                  {brand.body_font && (
                    <div>
                      body: <span className="text-fg">{brand.body_font}</span>
                      {brand.body_fallback ? ` (${brand.body_fallback})` : ""}
                    </div>
                  )}
                  {brand.mono_font && (
                    <div>
                      mono: <span className="text-fg">{brand.mono_font}</span>
                    </div>
                  )}
                </div>
              </Row>
            )}
            {brand.voice_adjectives.length > 0 && (
              <Row label="voice">
                <div className="flex flex-wrap gap-1.5">
                  {brand.voice_adjectives.map((v) => (
                    <span
                      key={v}
                      className="font-mono text-2xs uppercase tracking-wider border border-border px-2 py-0.5 text-fg-muted"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </Row>
            )}
            {brand.positioning_rationale && (
              <Row label="positioning">{brand.positioning_rationale}</Row>
            )}
            {brand.logo_description && (
              <Row label="logo">
                {brand.logo_description}
                {brand.logo_kind ? ` (${brand.logo_kind})` : ""}
              </Row>
            )}
          </Panel>
        </Section>
      )}

      {latestDemo && (
        <Section
          title="Demo artefact"
          subtitle={`${(latestDemo.html_size_bytes / 1024).toFixed(1)}kb · ${latestDemo.photo_count} photos · ${formatIso(latestDemo.generated_at)}${demos.length > 1 ? ` · ${demos.length} versions` : ""}`}
        >
          <Panel>
            {latestDemo.aesthetic_positioning && (
              <Row label="positioning">{latestDemo.aesthetic_positioning}</Row>
            )}
            {latestDemo.dominant_hex && (
              <Row label="dominant colour">
                <span className="inline-flex items-center gap-2 font-mono text-xs">
                  <span
                    className="inline-block w-4 h-4 border border-border"
                    style={{ backgroundColor: latestDemo.dominant_hex }}
                  />
                  {latestDemo.dominant_hex}
                </span>
              </Row>
            )}
            <Row label="source">{latestDemo.source}</Row>
          </Panel>
          <details className="mt-3" open>
            <summary className="cursor-pointer font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg">
              preview
            </summary>
            <div className="mt-3 border border-border bg-bg-panel">
              <iframe
                srcDoc={latestDemo.html_inline}
                sandbox="allow-same-origin"
                className="w-full h-[640px] bg-white"
                title={`Demo preview — ${displayName}`}
              />
            </div>
          </details>
        </Section>
      )}

      {latestPitchBrief &&
        (latestPitchBrief.hook ||
          latestPitchBrief.opener ||
          latestPitchBrief.close_script ||
          latestPitchBrief.demo_moments.length > 0 ||
          latestPitchBrief.specific_objections.length > 0 ||
          latestPitchBrief.pain_points.length > 0 ||
          latestPitchBrief.trust_badges.length > 0 ||
          latestPitchBrief.avoid_topics.length > 0) && (
        <Section
          title="Pitch brief"
          subtitle={`/lead-json · ${formatIso(latestPitchBrief.generated_at)}${pitchBriefs.length > 1 ? ` · ${pitchBriefs.length} versions` : ""}`}
        >
          <Panel>
            {latestPitchBrief.hook && (
              <Row label="hook">{latestPitchBrief.hook}</Row>
            )}
            {latestPitchBrief.opener && (
              <Row label="opener">{latestPitchBrief.opener}</Row>
            )}
            {latestPitchBrief.demo_moments.length > 0 && (
              <Row label="demo moments">
                <ol className="font-mono text-xs space-y-1 list-decimal list-inside">
                  {latestPitchBrief.demo_moments.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ol>
              </Row>
            )}
            {latestPitchBrief.close_script && (
              <Row label="close script">{latestPitchBrief.close_script}</Row>
            )}
            {latestPitchBrief.next_visit_reason && (
              <Row label="next visit">{latestPitchBrief.next_visit_reason}</Row>
            )}
            {latestPitchBrief.specific_objections.length > 0 && (
              <Row label="objections">
                <ul className="font-mono text-xs space-y-2">
                  {latestPitchBrief.specific_objections.map((o, i) => (
                    <li key={i} className="border-l border-border pl-2">
                      <div className="text-fg-muted">"{o.objection}"</div>
                      <div className="text-fg">→ {o.response}</div>
                    </li>
                  ))}
                </ul>
              </Row>
            )}
            {(latestPitchBrief.pain_points.length > 0 ||
              latestPitchBrief.trust_badges.length > 0 ||
              latestPitchBrief.avoid_topics.length > 0) && (
              <Row label="rep notes">
                <div className="font-mono text-xs space-y-2">
                  {latestPitchBrief.pain_points.length > 0 && (
                    <div>
                      <span className="text-fg-dim">pain points:</span>{" "}
                      {latestPitchBrief.pain_points.join(" · ")}
                    </div>
                  )}
                  {latestPitchBrief.trust_badges.length > 0 && (
                    <div>
                      <span className="text-fg-dim">trust:</span>{" "}
                      {latestPitchBrief.trust_badges.join(" · ")}
                    </div>
                  )}
                  {latestPitchBrief.avoid_topics.length > 0 && (
                    <div>
                      <span className="text-fg-dim">avoid:</span>{" "}
                      {latestPitchBrief.avoid_topics.join(" · ")}
                    </div>
                  )}
                </div>
              </Row>
            )}
          </Panel>
        </Section>
      )}

      {qaResults.length > 0 && (
        <Section
          title="QA results"
          subtitle={`${qaResults.length} run${qaResults.length === 1 ? "" : "s"}`}
        >
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>ran at</th>
                  <th className="text-right">score</th>
                  <th>passed</th>
                  <th className="text-right">contrast</th>
                  <th className="text-right">a11y</th>
                  <th className="text-right">html errors</th>
                </tr>
              </thead>
              <tbody>
                {qaResults.map((q) => (
                  <tr key={q.qa_id}>
                    <td className="font-mono text-2xs">{formatIso(q.ran_at)}</td>
                    <td className="text-right font-mono text-xs">{q.score}</td>
                    <td
                      className={cn(
                        "font-mono text-2xs uppercase",
                        q.passed ? "text-status-closed" : "text-status-rejected",
                      )}
                    >
                      {q.passed ? "yes" : "no"}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {q.contrast_score ?? "—"}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {q.accessibility_score ?? "—"}
                    </td>
                    <td className="text-right font-mono text-xs">{q.html_errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <QaVisualPanel rows={qaVisualResults} />

      {profile && (
        <Section
          title="Lead profile"
          subtitle={profile.qualifier_verdict ?? formatIso(profile.profiled_at)}
        >
          <Panel>
            <Row label="business name">{profile.business_name}</Row>
            {profile.business_type && (
              <Row label="business type">{profile.business_type}</Row>
            )}
            {profile.vertical && <Row label="vertical">{profile.vertical}</Row>}
            {profile.category && <Row label="category">{profile.category}</Row>}
            {(profile.address || profile.postcode) && (
              <Row label="address">
                {[profile.address, profile.postcode].filter(Boolean).join(", ")}
              </Row>
            )}
            {profile.phone && <Row label="phone">{profile.phone}</Row>}
            {profile.email && <Row label="email">{profile.email}</Row>}
            {profile.website_url && (
              <Row label="website">
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener"
                  className="text-accent hover:text-fg underline underline-offset-2"
                >
                  {profile.website_url}
                </a>
              </Row>
            )}
            {profile.opening_hours.length > 0 && (
              <Row label="hours">
                <ul className="font-mono text-xs space-y-0.5">
                  {profile.opening_hours.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </Row>
            )}
            {profile.services && profile.services.length > 0 && (
              <Row label="services">
                <ul className="font-mono text-xs space-y-0.5">
                  {profile.services.map((s, i) => (
                    <li key={i}>
                      <span className="text-fg">{s.name}</span>
                      {s.description && (
                        <span className="text-fg-muted"> — {s.description}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </Row>
            )}
            {profile.price_range && <Row label="price range">{profile.price_range}</Row>}
            {profile.qualification_reasons.length > 0 && (
              <Row label="qualification">
                <ul className="font-mono text-xs space-y-0.5">
                  {profile.qualification_reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </Row>
            )}
            {profile.best_reviews && profile.best_reviews.length > 0 && (
              <Row label="top reviews">
                <ul className="space-y-2">
                  {profile.best_reviews.slice(0, 3).map((r, i) => (
                    <li key={i} className="font-mono text-xs">
                      <span className="text-fg">{"★".repeat(Math.round(r.rating))}</span>{" "}
                      <span className="text-fg-muted">{r.author}</span>
                      <div className="text-fg leading-relaxed mt-0.5">{r.text}</div>
                    </li>
                  ))}
                </ul>
              </Row>
            )}
          </Panel>
        </Section>
      )}

      {assignmentEvents.length > 0 && (
        <Section
          title="Assignment timeline"
          subtitle={`${assignmentEvents.length} event${assignmentEvents.length === 1 ? "" : "s"}`}
        >
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>at</th>
                  <th>transition</th>
                  <th>source</th>
                  <th>SP</th>
                  <th className="text-right">commission</th>
                  <th>notes</th>
                </tr>
              </thead>
              <tbody>
                {assignmentEvents.map((e) => (
                  <tr key={e.event_id}>
                    <td className="font-mono text-2xs">{formatIso(e.occurred_at)}</td>
                    <td className="font-mono text-xs">{e.transition}</td>
                    <td className="font-mono text-2xs text-fg-muted">{e.source}</td>
                    <td className="font-mono text-2xs text-fg-muted">
                      {e.user_id ?? "—"}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {e.commission_amount_pence !== undefined
                        ? `£${(e.commission_amount_pence / 100).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="font-mono text-2xs text-fg-muted truncate max-w-xs">
                      {e.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {onboarding && (
        <Section
          title="Customer onboarding"
          subtitle={`${onboarding.completed_at ? `completed ${formatIso(onboarding.completed_at)}` : "in progress"} · ${onboarding.save_count} save${onboarding.save_count === 1 ? "" : "s"}`}
        >
          <Panel>
            {onboarding.contact_phone && (
              <Row label="phone">{onboarding.contact_phone}</Row>
            )}
            {onboarding.contact_email && (
              <Row label="email">{onboarding.contact_email}</Row>
            )}
            {onboarding.top_changes && (
              <Row label="top changes">{onboarding.top_changes}</Row>
            )}
            {onboarding.anything_else && (
              <Row label="anything else">{onboarding.anything_else}</Row>
            )}
            {onboarding.has_existing_domain !== undefined && (
              <Row label="domain">
                {onboarding.has_existing_domain
                  ? onboarding.existing_domain ?? "yes"
                  : `no — prefs: ${onboarding.domain_preferences?.join(", ") || "—"}`}
              </Row>
            )}
            {onboarding.photos.length > 0 && (
              <Row label="photos">{onboarding.photos.length} uploaded</Row>
            )}
          </Panel>
        </Section>
      )}

      <StripeEventsPanel events={stripeEvents} />

      {pitchLog.length > 0 && (
        <Section
          title="Pitch history"
          subtitle={`${pitchLog.length} pitch${pitchLog.length === 1 ? "" : "es"} · matched on business name`}
        >
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>date</th>
                  <th>outcome</th>
                  <th>interest</th>
                  <th className="text-right">price</th>
                  <th>contractor</th>
                  <th>notes</th>
                </tr>
              </thead>
              <tbody>
                {pitchLog.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-2xs">
                      {p.date.toISOString().slice(0, 10)}
                    </td>
                    <td className={cn("font-mono text-xs uppercase", outcomeColor(p.outcome))}>
                      {p.outcome}
                    </td>
                    <td className="font-mono text-2xs text-fg-muted">
                      {p.interestLevel ?? "—"}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {p.agreedPrice ? `£${Number(p.agreedPrice).toFixed(2)}` : "—"}
                    </td>
                    <td className="font-mono text-2xs text-fg-muted">
                      {p.contractorId ?? "—"}
                    </td>
                    <td className="font-mono text-2xs text-fg-muted truncate max-w-xs">
                      {p.notes ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {composerIters.length > 0 && (
        <Section
          title="Composer iterations"
          subtitle={`${composerIters.length} save${composerIters.length === 1 ? "" : "s"}`}
        >
          <div className="border border-border bg-bg-panel">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>at</th>
                  <th>kind</th>
                  <th>notes</th>
                  <th className="text-right">html size</th>
                </tr>
              </thead>
              <tbody>
                {composerIters.map((c) => (
                  <tr key={c.iteration_id}>
                    <td className="font-mono text-2xs">{formatIso(c.created_at)}</td>
                    <td className="font-mono text-xs">{c.edit_kind}</td>
                    <td className="font-mono text-2xs text-fg-muted truncate max-w-md">
                      {c.editor_notes ?? ""}
                    </td>
                    <td className="text-right font-mono text-2xs">
                      {(c.html_output.length / 1024).toFixed(1)}kb
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {spendRows.length > 0 && (
        <Section
          title="API spend"
          subtitle={`$${totalCostUsd.toFixed(4)} across ${spendRows.length} call${spendRows.length === 1 ? "" : "s"}`}
        >
          <details>
            <summary className="cursor-pointer font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg mb-2">
              show all calls
            </summary>
            <div className="border border-border bg-bg-panel">
              <table className="nv-table">
                <thead>
                  <tr>
                    <th>at</th>
                    <th>provider</th>
                    <th>agent</th>
                    <th>kind</th>
                    <th className="text-right">tokens</th>
                    <th className="text-right">cost</th>
                  </tr>
                </thead>
                <tbody>
                  {spendRows.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono text-2xs">{formatIso(s.occurred_at)}</td>
                      <td className="font-mono text-2xs">{s.provider}</td>
                      <td className="font-mono text-2xs text-fg-muted">
                        {s.agent_id ?? "—"}
                      </td>
                      <td className="font-mono text-2xs text-fg-muted">
                        {s.request_kind ?? "—"}
                      </td>
                      <td className="text-right font-mono text-2xs">
                        {s.total_tokens ?? "—"}
                      </td>
                      <td className="text-right font-mono text-xs">
                        ${s.cost_usd.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Section>
      )}

      <EmbeddingsPanel
        totalChunks={totalEmbeddingChunks}
        groups={embeddingGroups.map((g) => ({
          sourceType: g.sourceType,
          count: g._count._all,
          lastEmbeddedAt: g._max.createdAt,
        }))}
        sourceRecordCount={knownSourceIds.length}
      />

      <p className="font-mono text-2xs text-fg-dim pt-2">
        id <span className="text-fg-muted">{id}</span>{" "}
        {lead
          ? hasSlMasData
            ? "· LeadRecord + SL-MAS"
            : "· LeadRecord only"
          : "· SL-MAS slug (no LeadRecord)"}
      </p>
    </div>
  );
}

