'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from './AppShell';

const NO_SHELL_ROUTES = ['/login', '/signup', '/demo', '/legal', '/preview', '/onboarding', '/paid'];

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideShell = pathname === '/' || NO_SHELL_ROUTES.some((r) => pathname.startsWith(r));

  // For demo and legal pages — render children directly, no shell at all
  if (hideShell) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
