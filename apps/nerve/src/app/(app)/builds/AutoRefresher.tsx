/**
 * Tiny client island that re-runs the server component every N seconds.
 *
 * Mounted on /builds so the founder dashboard reflects new customer
 * onboarding activity within ~20s of it landing in Supabase, without
 * needing to F5. router.refresh() is cheap — it only re-runs the page's
 * server-side data fetch and patches the React tree, no full nav.
 *
 * Renders a small "auto-refreshing every Ns · last Xs ago" indicator so
 * the founder can tell it's alive.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  intervalMs?: number;
}

export function AutoRefresher({ intervalMs = 20000 }: Props) {
  const router = useRouter();
  const [lastTick, setLastTick] = useState(() => Date.now());
  const [, force] = useState(0);

  // Poll the server every intervalMs. router.refresh() re-runs server
  // components (data refetch + RSC payload swap). No client-side state
  // is reset because the only state lives in this island.
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
      setLastTick(Date.now());
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  // Re-render the "Xs ago" stamp every second.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsAgo = Math.floor((Date.now() - lastTick) / 1000);
  const seconds = Math.round(intervalMs / 1000);

  return (
    <div className="font-mono text-2xs text-fg-dim flex items-center gap-2">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-status-closed"
        style={{ boxShadow: '0 0 6px rgba(61,158,95,0.6)' }}
      />
      <span>
        auto-refreshing every {seconds}s · last refresh {secondsAgo}s ago
      </span>
      <button
        type="button"
        onClick={() => {
          router.refresh();
          setLastTick(Date.now());
        }}
        className="border border-border px-2 py-0.5 hover:border-border-strong"
      >
        refresh now
      </button>
    </div>
  );
}
