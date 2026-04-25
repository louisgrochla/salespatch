'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', label: 'Leads' },
  { href: '/map', label: 'Map' },
  { href: '/payouts', label: 'Payouts' },
  { href: '/referrals', label: 'Referrals' },
  { href: '/help', label: 'Help' },
  { href: '/settings', label: 'Settings' },
];

const MOBILE_NAV = [
  { href: '/dashboard', label: 'Leads' },
  { href: '/map', label: 'Map' },
  { href: '/payouts', label: 'Payouts' },
  { href: '/profile', label: 'Account' },
];

// Brand tokens — match /site/apply.html dark theme
const INK = 'rgb(20 20 19)';
const BG_CARD = 'rgb(28 26 23)';
const CREAM = 'rgb(248 244 238)';
const CREAM_DIM = 'rgb(210 200 185)';
const SIGNAL = 'rgb(184 134 11)';
const LINE = 'rgb(255 255 255 / 0.08)';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      className="min-h-screen relative"
      style={{
        background: INK,
        color: CREAM,
        fontFamily: '"Inter Tight", var(--font-sans), sans-serif',
      }}
    >
      {/* ── Line grid with radial mask ── */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(rgb(255 255 255 / 0.022) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.022) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 15%, #000, transparent 85%)',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 15%, #000, transparent 85%)',
        }}
      />
      {/* ── Warm radial glow at top ── */}
      <div
        className="fixed inset-x-0 top-0 h-[420px] pointer-events-none z-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgb(184 134 11 / 0.12), transparent 55%)',
        }}
      />

      {/* ── Top nav ── */}
      <nav
        className="sticky top-0 z-50 backdrop-blur-xl border-b"
        style={{ borderColor: LINE, background: 'rgb(20 20 19 / 0.82)' }}
      >
        <div className="max-w-[1240px] mx-auto px-6 md:px-8 h-[60px] flex items-center justify-between gap-6">
          {/* Logo */}
          <Link
            href="/dashboard"
            className="flex items-baseline text-[20px] font-bold tracking-[-0.025em]"
            style={{ fontFamily: 'Geist, "Inter Tight", sans-serif', color: CREAM }}
          >
            SalesFlow
            <span
              className="inline-block w-[6px] h-[6px] rounded-full ml-[3px]"
              style={{ background: SIGNAL, transform: 'translateY(-1px)' }}
            />
          </Link>

          {/* Links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className="px-4 py-2 rounded-full text-[13px] transition-colors"
                  style={{
                    color: active ? CREAM : CREAM_DIM,
                    background: active ? BG_CARD : 'transparent',
                    fontWeight: active ? 500 : 400,
                    border: active ? `1px solid ${LINE}` : '1px solid transparent',
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Avatar */}
          <Link
            href="/profile"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-medium transition-colors"
            style={{ background: BG_CARD, color: CREAM, border: `1px solid ${LINE}` }}
          >
            D
          </Link>
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="relative z-10 max-w-[1240px] mx-auto px-6 md:px-8 pb-24 md:pb-10">
        {children}
      </main>

      {/* ── Mobile nav ── */}
      <nav
        className="fixed bottom-0 inset-x-0 z-50 backdrop-blur-xl border-t md:hidden pb-[env(safe-area-inset-bottom)]"
        style={{ background: 'rgb(20 20 19 / 0.92)', borderColor: LINE }}
      >
        <div className="flex items-center justify-around h-14">
          {MOBILE_NAV.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className="text-[11px] py-1.5 tracking-wide"
                style={{ color: active ? SIGNAL : CREAM_DIM, letterSpacing: '0.06em' }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
