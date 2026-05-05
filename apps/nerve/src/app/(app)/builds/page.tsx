/**
 * /builds — paid customer builds awaiting delivery, plus pitched leads
 * who've started entering their onboarding details. Live-queries Supabase.
 *
 * Founder dashboard for the 7-day fulfilment cycle. Shows everything we
 * need to actually build the site: contact info, requested changes, photo
 * uploads, domain preferences, free-text notes. Sorted paid first.
 */
import { PageHeader } from '@/components/PageHeader';
import { StatTile } from '@/components/StatTile';
import { fetchBuilds, type BuildRow, type BuildPhoto } from '@/lib/supabase-builds';
import { format } from 'date-fns';
import { AutoRefresher } from './AutoRefresher';

export const dynamic = 'force-dynamic';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'd MMM yyyy, HH:mm');
  } catch {
    return iso;
  }
}

function fmtDateOnly(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

function deliveryBy(paidAt: string | null): string {
  if (!paidAt) return '—';
  try {
    const d = new Date(paidAt);
    d.setDate(d.getDate() + 7);
    return format(d, 'd MMM yyyy');
  } catch {
    return '—';
  }
}

function StatusPill({ status, paid }: { status: string | null; paid: boolean }) {
  if (paid) {
    return (
      <span className="font-mono text-2xs uppercase tracking-wider text-status-closed border border-status-closed/40 px-2 py-0.5">
        paid
      </span>
    );
  }
  if (status === 'sold') {
    return (
      <span className="font-mono text-2xs uppercase tracking-wider text-status-followup border border-status-followup/40 px-2 py-0.5">
        sold (unpaid?)
      </span>
    );
  }
  return (
    <span className="font-mono text-2xs uppercase tracking-wider text-fg-dim border border-border px-2 py-0.5">
      pitched
    </span>
  );
}

function PhotoGrid({ photos }: { photos: BuildPhoto[] }) {
  if (photos.length === 0) {
    return <div className="font-mono text-2xs text-fg-dim">no photos uploaded</div>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <a
          key={`${p.url}-${i}`}
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="block border border-border hover:border-border-strong overflow-hidden"
          title={`${p.filename} · ${fmtDate(p.uploaded_at)}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.url}
            alt={p.filename}
            className="w-20 h-20 object-cover"
            loading="lazy"
          />
        </a>
      ))}
    </div>
  );
}

function BuildCard({ b }: { b: BuildRow }) {
  const paid = b.paidAt != null;
  const onboardingUrl = `https://salespatch.co.uk/onboarding/${b.leadId}`;
  const previewUrl = `https://salespatch.co.uk/preview/${b.leadId}`;
  return (
    <div className="border border-border bg-bg-panel p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-sans text-lg font-medium text-fg">
            {b.businessName ?? '— no business name —'}
          </h3>
          {b.address && (
            <div className="font-mono text-2xs text-fg-dim mt-0.5">{b.address}</div>
          )}
        </div>
        <StatusPill status={b.status} paid={paid} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
        <div>
          <div className="h-section">Paid</div>
          <div className="font-mono text-xs text-fg mt-0.5">{fmtDate(b.paidAt)}</div>
        </div>
        <div>
          <div className="h-section">Live by</div>
          <div className="font-mono text-xs text-fg mt-0.5">
            {paid ? deliveryBy(b.paidAt) : '—'}
          </div>
        </div>
        <div>
          <div className="h-section">Welcome email</div>
          <div className="font-mono text-xs text-fg mt-0.5">
            {b.welcomeSentAt ? `sent ${fmtDateOnly(b.welcomeSentAt)}` : 'not sent'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <div className="h-section">Contact email</div>
          <div className="font-mono text-xs text-fg mt-0.5">
            {b.contactEmail ? (
              <a href={`mailto:${b.contactEmail}`} className="underline hover:text-fg">
                {b.contactEmail}
              </a>
            ) : (
              <span className="text-fg-dim">—</span>
            )}
          </div>
        </div>
        <div>
          <div className="h-section">Mobile</div>
          <div className="font-mono text-xs text-fg mt-0.5">
            {b.contactPhone ?? <span className="text-fg-dim">—</span>}
          </div>
        </div>
      </div>

      {b.topChanges && (
        <div>
          <div className="h-section">First-day tweaks</div>
          <div className="text-sm text-fg mt-0.5 whitespace-pre-wrap">
            {b.topChanges}
          </div>
        </div>
      )}

      <div>
        <div className="h-section">Domain</div>
        <div className="text-sm text-fg mt-0.5">
          {b.hasExistingDomain == null ? (
            <span className="text-fg-dim">— not answered —</span>
          ) : b.hasExistingDomain ? (
            <span>
              Existing:{' '}
              <span className="font-mono">{b.existingDomain ?? '(blank)'}</span>
            </span>
          ) : (
            <span>
              No existing.{' '}
              {b.domainPreferences && b.domainPreferences.length > 0 ? (
                <>
                  Wants:{' '}
                  <span className="font-mono">{b.domainPreferences.join(', ')}</span>
                </>
              ) : (
                'No preferences shared.'
              )}
            </span>
          )}
        </div>
      </div>

      {b.anythingElse && (
        <div>
          <div className="h-section">Anything else</div>
          <div className="text-sm text-fg mt-0.5 whitespace-pre-wrap">
            {b.anythingElse}
          </div>
        </div>
      )}

      <div>
        <div className="h-section">Photos ({b.photos.length})</div>
        <div className="mt-1">
          <PhotoGrid photos={b.photos} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1"
        >
          View demo →
        </a>
        <a
          href={onboardingUrl}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1"
        >
          Open onboarding →
        </a>
        <span className="font-mono text-2xs text-fg-dim px-2 py-1">
          ref: {b.leadId.slice(0, 8)}…
        </span>
      </div>
    </div>
  );
}

export default async function BuildsPage() {
  const builds = await fetchBuilds();

  const paid = builds.filter((b) => b.paidAt != null);
  const pitched = builds.filter((b) => b.paidAt == null);
  const withProgress = builds.filter(
    (b) =>
      b.contactEmail ||
      b.contactPhone ||
      b.topChanges ||
      b.anythingElse ||
      (b.photos && b.photos.length > 0),
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Customer Builds"
        subtitle="every customer who's touched the onboarding form · photos, answers, payment status"
        actions={<AutoRefresher intervalMs={20000} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Paid" value={paid.length} hint="awaiting delivery" />
        <StatTile label="Pitched" value={pitched.length} hint="not yet paid" />
        <StatTile label="With answers" value={withProgress.length} hint="any onboarding data" />
        <StatTile label="Total" value={builds.length} hint="last 200 records" />
      </div>

      {builds.length === 0 ? (
        <div className="border border-border bg-bg-panel p-6 text-fg-dim font-mono text-sm">
          No leads yet — or Supabase env vars missing on this deployment.
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> on the Vercel nerve project.
        </div>
      ) : (
        <>
          {paid.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-mono text-2xs uppercase tracking-wider text-fg-muted">
                Paid ({paid.length}) — awaiting build & delivery
              </h2>
              {paid.map((b) => (
                <BuildCard key={b.leadId} b={b} />
              ))}
            </section>
          )}
          {pitched.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-mono text-2xs uppercase tracking-wider text-fg-muted">
                In progress ({pitched.length}) — onboarding started, not paid
              </h2>
              {pitched.map((b) => (
                <BuildCard key={b.leadId} b={b} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
