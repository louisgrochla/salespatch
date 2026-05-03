"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Refreshes the React Server Component tree every N seconds so the
// public dashboard stays live without the user clicking. Uses
// router.refresh() rather than window.reload — keeps scroll position
// and avoids a network round-trip for the static shell.

export function AutoRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [router, everyMs]);
  return null;
}
