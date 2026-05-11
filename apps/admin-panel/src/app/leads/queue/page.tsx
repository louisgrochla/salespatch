'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Inbox, RefreshCw, AlertCircle, Star, Camera, Image as ImageIcon, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react';

interface PendingAssignment {
  canonical_slug: string;
  canonical_id: string | null;
  business_name: string;
  vertical: string | null;
  postcode: string | null;
  latest_demo_at: string;
  latest_artefact_id: string;
  demo_count: number;
  demo_size_kb: number;
  photo_count: number;
  aesthetic_positioning: string | null;
  dominant_hex: string | null;
  latest_brief_id: string | null;
  diagnosis: string | null;
  pitch_angle: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  instagram_handle: string | null;
  latest_pitch_brief_id: string | null;
  hook: string | null;
  contact_name: string | null;
  qa_score: number | null;
  qa_passed: boolean | null;
}

interface PendingResponse {
  pending: PendingAssignment[];
  total: number;
  queried_at: string;
}

interface SalesUser {
  id: string;
  name: string;
  area_postcode: string | null;
  user_status: string;
  active: boolean;
  active_leads: number;
  total_sales: number;
}

interface AssignSuccess {
  slug: string;
  user_name: string;
  business_name: string;
  demo_site_domain: string | null;
}

export default function LeadsQueuePage() {
  const [data, setData] = useState<PendingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verticalFilter, setVerticalFilter] = useState('');
  const [team, setTeam] = useState<SalesUser[]>([]);
  const [recentSuccess, setRecentSuccess] = useState<AssignSuccess | null>(null);

  useEffect(() => {
    loadQueue();
  }, [verticalFilter]);

  useEffect(() => {
    loadTeam();
  }, []);

  async function loadQueue() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (verticalFilter) params.set('vertical', verticalFilter);
      const res = await fetch(`/api/leads/queue?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as PendingResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadTeam() {
    try {
      const res = await fetch('/api/team');
      if (!res.ok) return;
      const body = (await res.json()) as { data: SalesUser[] };
      setTeam((body.data ?? []).filter((u) => u.active));
    } catch {
      // Non-fatal — picker just stays empty.
    }
  }

  async function handleAssigned(success: AssignSuccess) {
    setRecentSuccess(success);
    // Refresh both queue and team (active_leads counts shift).
    await Promise.all([loadQueue(), loadTeam()]);
    // Clear the success banner after 6s.
    setTimeout(() => setRecentSuccess((curr) => (curr === success ? null : curr)), 6000);
  }

  const verticals = Array.from(
    new Set((data?.pending ?? []).map((p) => p.vertical).filter((v): v is string => !!v)),
  ).sort();

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar />
      <main className="flex-1 border-l border-slate-100">
        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[15px] font-semibold text-slate-900 flex items-center gap-2">
                <Inbox className="w-4 h-4 text-slate-400" />
                NERVE queue
              </h1>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Leads with a demo built by /build-demo but no SP assigned yet.{' '}
                {data && `${data.total} pending · queried ${formatTime(data.queried_at)}`}
              </p>
            </div>
            <button
              onClick={loadQueue}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="px-8 py-6 space-y-5">
          {/* Success toast — shown for ~6s after an assign */}
          {recentSuccess && (
            <div className="border border-emerald-100 bg-emerald-50 rounded-lg px-4 py-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-px shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-emerald-900">
                  Imported · {recentSuccess.business_name} → {recentSuccess.user_name}
                </div>
                {recentSuccess.demo_site_domain && (
                  <a
                    href={recentSuccess.demo_site_domain}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-emerald-700 hover:text-emerald-900 underline inline-flex items-center gap-1 mt-0.5"
                  >
                    Open demo
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Vertical filter */}
          {verticals.length > 0 && (
            <div className="flex items-center gap-1 border-b border-slate-100 pb-px">
              <button
                onClick={() => setVerticalFilter('')}
                className={`px-3 py-2 text-[12px] font-medium border-b-2 transition-colors -mb-px ${
                  verticalFilter === ''
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                All
                <span className="ml-1.5 text-[10px] tabular-nums text-slate-300">
                  {data?.total ?? 0}
                </span>
              </button>
              {verticals.map((v) => (
                <button
                  key={v}
                  onClick={() => setVerticalFilter(v)}
                  className={`px-3 py-2 text-[12px] font-medium border-b-2 transition-colors -mb-px capitalize ${
                    verticalFilter === v
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="border border-red-100 bg-red-50 rounded-lg px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-px shrink-0" />
              <div>
                <div className="text-[12px] font-medium text-red-900">Queue read failed</div>
                <div className="text-[11px] text-red-700 mt-0.5 font-mono">{error}</div>
              </div>
            </div>
          )}

          {/* Cards */}
          {data && data.pending.length === 0 && !error && (
            <div className="border border-slate-100 rounded-xl px-6 py-16 text-center">
              <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <div className="text-[13px] font-medium text-slate-700">Queue is clear</div>
              <div className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                Every NERVE-built lead has been assigned. Run{' '}
                <code className="text-slate-600">/build-demo</code> on a new lead and refresh
                — it should appear here within seconds of the artefact landing.
              </div>
            </div>
          )}

          {data && data.pending.length > 0 && (
            <div className="space-y-3">
              {data.pending.map((card) => (
                <QueueCard
                  key={card.canonical_slug}
                  card={card}
                  team={team}
                  onAssigned={handleAssigned}
                />
              ))}
            </div>
          )}

          {loading && !data && (
            <div className="text-center py-16">
              <div className="text-[12px] text-slate-400">Loading queue…</div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

interface QueueCardProps {
  card: PendingAssignment;
  team: SalesUser[];
  onAssigned: (s: AssignSuccess) => void | Promise<void>;
}

function QueueCard({ card, team, onAssigned }: QueueCardProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  const qaColor =
    card.qa_score === null
      ? 'text-slate-400 bg-slate-50'
      : card.qa_passed
        ? 'text-emerald-700 bg-emerald-50'
        : 'text-amber-700 bg-amber-50';
  const canonicalBadge = card.canonical_id
    ? { label: 'canonical', color: 'text-slate-500 bg-slate-50' }
    : { label: 'slug only', color: 'text-amber-600 bg-amber-50' };

  const demoUrl = `/api/public/demo/${encodeURIComponent(card.canonical_slug)}`;
  const demoExternalUrl = nerveBaseUrl() + demoUrl;

  async function handleAssign() {
    if (!selectedUserId) return;
    setAssigning(true);
    setCardError(null);
    try {
      const res = await fetch('/api/leads/import-from-nerve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: card.canonical_slug, user_id: selectedUserId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: {
          user_name: string;
          business_name: string;
          demo_site_domain: string | null;
        };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      if (body.data) {
        await onAssigned({
          slug: card.canonical_slug,
          user_name: body.data.user_name,
          business_name: body.data.business_name,
          demo_site_domain: body.data.demo_site_domain,
        });
      }
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="border border-slate-100 rounded-xl bg-white hover:border-slate-200 transition-colors">
      <div className="px-5 py-4 flex items-start gap-4">
        {/* Brand swatch */}
        <div className="shrink-0 flex flex-col items-center gap-1.5">
          <div
            className="w-10 h-10 rounded-lg border border-slate-100"
            style={{ backgroundColor: card.dominant_hex ?? '#f1f5f9' }}
            title={card.dominant_hex ?? 'no brand colour'}
          />
          {card.dominant_hex && (
            <span className="text-[9px] font-mono text-slate-400">
              {card.dominant_hex}
            </span>
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[14px] font-semibold text-slate-900 truncate">
                  {card.business_name}
                </h3>
                <span className="text-[11px] text-slate-400 font-mono shrink-0">
                  {card.canonical_slug}
                </span>
                <a
                  href={demoExternalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-slate-400 hover:text-slate-700 inline-flex items-center gap-0.5 shrink-0"
                  title="Open demo in new tab"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                {card.vertical && <span className="capitalize">{card.vertical}</span>}
                {card.postcode && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono">{card.postcode}</span>
                  </>
                )}
                {card.instagram_handle && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>@{card.instagram_handle}</span>
                  </>
                )}
                {card.google_rating !== null && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      {card.google_rating.toFixed(1)}
                      {card.google_review_count !== null && (
                        <span className="text-slate-400">({card.google_review_count})</span>
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Badges */}
            <div className="flex items-center gap-1.5 shrink-0">
              {card.qa_score !== null && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium tabular-nums ${qaColor}`}
                  title={card.qa_passed ? 'QA pass' : 'QA fail'}
                >
                  QA {card.qa_score}
                </span>
              )}
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${canonicalBadge.color}`}
                title={
                  card.canonical_id
                    ? `BusinessIdentity ${card.canonical_id}`
                    : 'No F1 BusinessIdentity row — pre-F1 producer ingest or backfill not run'
                }
              >
                {canonicalBadge.label}
              </span>
            </div>
          </div>

          {/* Pitch angle (or fallback to diagnosis or hook) */}
          {(card.pitch_angle || card.hook || card.diagnosis) && (
            <p className="text-[12px] text-slate-700 mt-2 leading-relaxed">
              {card.pitch_angle ?? card.hook ?? card.diagnosis}
            </p>
          )}

          {/* Demo metadata footer */}
          <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Camera className="w-3 h-3" />
              {card.photo_count} photo{card.photo_count === 1 ? '' : 's'}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <ImageIcon className="w-3 h-3" />
              {card.demo_size_kb.toLocaleString()}kb
            </span>
            {card.demo_count > 1 && (
              <>
                <span className="text-slate-300">·</span>
                <span>{card.demo_count} versions</span>
              </>
            )}
            <span className="text-slate-300">·</span>
            <span>built {formatTime(card.latest_demo_at)}</span>
            {card.aesthetic_positioning && (
              <>
                <span className="text-slate-300">·</span>
                <span className="italic truncate" title={card.aesthetic_positioning}>
                  {card.aesthetic_positioning}
                </span>
              </>
            )}
          </div>

          {/* Card-level error (assign failure) */}
          {cardError && (
            <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1 font-mono">
              {cardError}
            </div>
          )}
        </div>

        {/* Assign action — SP picker + button */}
        <div className="shrink-0 flex flex-col items-end gap-1.5 w-[200px]">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={assigning || team.length === 0}
            className="w-full px-2 py-1.5 text-[11px] border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">
              {team.length === 0 ? 'No active SPs' : 'Pick a salesperson…'}
            </option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.area_postcode ? ` · ${u.area_postcode}` : ''} · {u.active_leads} active
              </option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={!selectedUserId || assigning}
            className="w-full px-3.5 py-2 text-[12px] font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
          >
            {assigning && <Loader2 className="w-3 h-3 animate-spin" />}
            {assigning ? 'Importing…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function nerveBaseUrl(): string {
  // The queue page is server-rendered then hydrated client-side, so process
  // env isn't available here. The demo URL is canonical and hardcoded for
  // the production deployment; if a local dev override is needed it can
  // come from a NEXT_PUBLIC_ env in future.
  return 'https://nerve.salespatch.co.uk';
}
