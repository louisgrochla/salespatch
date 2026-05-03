import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { SupervisorSubNav } from "../_components/SubNav";
import { anonContractor } from "@/lib/anonymise";
import { PhasePill, StatusPill } from "@/components/PhasePill";

export const dynamic = "force-dynamic";

const METHODOLOGY_MIN_PER_PHASE = 50;

interface SearchParams {
  phase?: string;
  outcome?: string;
  sector?: string;
  after?: string;
  before?: string;
}

function buildWhere(p: SearchParams): Prisma.PitchLogWhereInput {
  const where: Prisma.PitchLogWhereInput = {};
  if (p.phase) where.phaseLabel = p.phase;
  const validOutcomes = ["closed", "rejected", "follow_up", "closed_now", "closed_followup", "not_pitched"] as const;
  if (p.outcome && (validOutcomes as readonly string[]).includes(p.outcome)) {
    where.outcome = p.outcome as (typeof validOutcomes)[number];
  }
  if (p.sector) where.sector = p.sector;
  if (p.after || p.before) {
    where.date = {};
    if (p.after) where.date.gte = new Date(p.after);
    if (p.before) where.date.lte = new Date(p.before);
  }
  return where;
}

export default async function SupervisorPitchesPage({ searchParams }: { searchParams: SearchParams }) {
  const where = buildWhere(searchParams);

  const [pitches, totals, byPhaseOutcome, sectorCount, objectionFreq, phases] =
    await Promise.all([
      prisma.pitchLog.findMany({
        where, orderBy: { date: "desc" }, take: 1000,
        select: {
          id: true, date: true, businessType: true, sector: true,
          location: true, leadSource: true, demoVersion: true, outcome: true,
          contractorId: true, pitchDuration: true, consentFlag: true,
          phaseLabel: true,
          objections: { include: { objection: true } },
        },
      }),
      prisma.pitchLog.groupBy({ where, by: ["outcome"], _count: { _all: true } }),
      prisma.pitchLog.groupBy({
        by: ["phaseLabel", "outcome"], _count: { _all: true },
      }),
      prisma.pitchLog.findMany({
        where: { sector: { not: null } }, distinct: ["sector"], select: { sector: true },
      }),
      prisma.$queryRaw<Array<{ name: string; n: bigint }>>`
        SELECT t."name", count(*) AS n
        FROM "PitchObjection" po
        JOIN "ObjectionTag" t ON t."id" = po."objectionId"
        GROUP BY t."name" ORDER BY n DESC LIMIT 50`,
      prisma.phaseBoundary.findMany({
        orderBy: { startDate: "asc" }, select: { name: true },
      }),
    ]);

  const totalCount = totals.reduce((s, t) => s + t._count._all, 0);
  const closed = totals.find((t) => t.outcome === "closed")?._count._all ?? 0;
  const rejected = totals.find((t) => t.outcome === "rejected")?._count._all ?? 0;
  const followUp = totals.find((t) => t.outcome === "follow_up")?._count._all ?? 0;
  const closeRate = totalCount > 0 ? closed / totalCount : 0;

  // Per-phase summary table.
  const phaseSummary = phases.map((p) => {
    const rows = byPhaseOutcome.filter((g) => g.phaseLabel === p.name);
    const c = rows.find((r) => r.outcome === "closed")?._count._all ?? 0;
    const r = rows.find((r) => r.outcome === "rejected")?._count._all ?? 0;
    const f = rows.find((r) => r.outcome === "follow_up")?._count._all ?? 0;
    const total = c + r + f;
    return {
      name: p.name, total, closed: c, rejected: r, followUp: f,
      closeRate: total > 0 ? c / total : 0,
      sufficiency: Math.min(1, total / METHODOLOGY_MIN_PER_PHASE),
    };
  });

  const exportQuery = new URLSearchParams(
    Object.entries(searchParams).filter(([, v]) => v) as [string, string][],
  ).toString();

  return (
    <div className="space-y-6">
      <SupervisorSubNav />

      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-sans text-xl font-medium text-fg">Pitch records</h1>
          <p className="font-mono text-2xs text-fg-dim mt-1">
            Anonymised — business names removed; contractor IDs hashed; deal values and free-text notes hidden.
          </p>
        </div>
        <a
          href={`/api/supervisor/pitches-export${exportQuery ? `?${exportQuery}` : ""}`}
          className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg
                     border border-border hover:border-border-strong px-2 py-1"
        >
          csv
        </a>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
        <Tile label="total" value={totalCount.toLocaleString()} />
        <Tile label="closed" value={closed.toLocaleString()} hint={`${(closeRate * 100).toFixed(1)}% close rate`} />
        <Tile label="rejected" value={rejected.toLocaleString()} />
        <Tile label="follow up" value={followUp.toLocaleString()} />
      </section>

      <section>
        <div className="h-section mb-2">phase summary</div>
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr>
                <th>phase</th>
                <th className="text-right">n</th>
                <th className="text-right">closed</th>
                <th className="text-right">rejected</th>
                <th className="text-right">follow-up</th>
                <th className="text-right">close rate</th>
                <th>sufficiency vs n=50 threshold</th>
              </tr>
            </thead>
            <tbody>
              {phaseSummary.map((p) => (
                <tr key={p.name}>
                  <td><PhasePill phase={p.name} /></td>
                  <td className="text-right">{p.total}</td>
                  <td className="text-right text-status-closed">{p.closed}</td>
                  <td className="text-right text-status-rejected">{p.rejected}</td>
                  <td className="text-right text-status-followup">{p.followUp}</td>
                  <td className="text-right">{p.total > 0 ? `${(p.closeRate * 100).toFixed(1)}%` : "—"}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="bg-border h-2 w-24">
                        <div className={p.sufficiency >= 1 ? "bg-status-closed h-2" : "bg-accent h-2"}
                          style={{ width: `${p.sufficiency * 100}%` }} />
                      </div>
                      <span className="font-mono text-2xs text-fg-dim">
                        {p.total} / 50
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="h-section mb-2">filters</div>
        <form className="border border-border bg-bg-panel p-3 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="phase">
            <select name="phase" defaultValue={searchParams.phase ?? ""} className={input}>
              <option value="">any</option>
              {phases.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="outcome">
            <select name="outcome" defaultValue={searchParams.outcome ?? ""} className={input}>
              <option value="">any</option>
              <option value="closed">closed</option>
              <option value="rejected">rejected</option>
              <option value="follow_up">follow_up</option>
            </select>
          </Field>
          <Field label="sector">
            <select name="sector" defaultValue={searchParams.sector ?? ""} className={input}>
              <option value="">any</option>
              {sectorCount.map((s) => <option key={s.sector!} value={s.sector!}>{s.sector}</option>)}
            </select>
          </Field>
          <Field label="from">
            <input type="date" name="after" defaultValue={searchParams.after ?? ""} className={input} />
          </Field>
          <Field label="to">
            <input type="date" name="before" defaultValue={searchParams.before ?? ""} className={input} />
          </Field>
          <button type="submit" className="md:col-span-5 font-sans text-sm font-medium px-3 py-1.5 bg-fg text-bg hover:bg-fg-muted self-start">
            Apply
          </button>
        </form>
      </section>

      <section>
        <div className="h-section mb-2">pitch records · {pitches.length}{pitches.length === 1000 ? "+" : ""}</div>
        <div className="border border-border bg-bg-panel overflow-x-auto">
          <table className="nv-table">
            <thead>
              <tr>
                <th>date</th>
                <th>sector</th>
                <th>type</th>
                <th>outcome</th>
                <th>objections</th>
                <th>lead</th>
                <th>demo</th>
                <th>sp</th>
                <th className="text-right">duration</th>
                <th>consent</th>
                <th>phase</th>
              </tr>
            </thead>
            <tbody>
              {pitches.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-fg-dim py-3">No pitches match the current filters.</td></tr>
              ) : pitches.map((p) => (
                <tr key={p.id}>
                  <td>{format(p.date, "dd LLL HH:mm")}</td>
                  <td>{p.sector ?? <span className="text-fg-dim">—</span>}</td>
                  <td>{p.businessType ?? <span className="text-fg-dim">—</span>}</td>
                  <td><StatusPill status={p.outcome} /></td>
                  <td className="text-fg-muted">
                    {p.objections.length === 0 ? "—" : p.objections.map((o) => o.objection.name).join(", ")}
                  </td>
                  <td>{p.leadSource ?? <span className="text-fg-dim">—</span>}</td>
                  <td>{p.demoVersion ?? <span className="text-fg-dim">—</span>}</td>
                  <td className="font-mono text-2xs text-fg-muted">{anonContractor(p.contractorId)}</td>
                  <td className="text-right">{p.pitchDuration == null ? "—" : `${Math.round(p.pitchDuration / 60)}m`}</td>
                  <td>{p.consentFlag ? "✓" : "—"}</td>
                  <td><PhasePill phase={p.phaseLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="h-section mb-2">objection frequency</div>
        <div className="border border-border bg-bg-panel">
          <table className="nv-table">
            <thead>
              <tr><th>objection</th><th className="text-right">count</th></tr>
            </thead>
            <tbody>
              {objectionFreq.length === 0 ? (
                <tr><td colSpan={2} className="text-center text-fg-dim py-3">No objections logged yet.</td></tr>
              ) : objectionFreq.map((o) => (
                <tr key={o.name}>
                  <td>{o.name}</td>
                  <td className="text-right">{Number(o.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const input = "mt-1 w-full bg-bg-panel border border-border focus:border-accent text-fg font-mono text-xs px-2.5 py-1.5 outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="h-section">{label}</span>
      {children}
    </label>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-bg-panel px-4 py-3">
      <div className="h-section">{label}</div>
      <div className="font-mono text-2xl text-fg mt-1 leading-none">{value}</div>
      {hint && <div className="font-mono text-2xs text-fg-dim mt-2">{hint}</div>}
    </div>
  );
}
