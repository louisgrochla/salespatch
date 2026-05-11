'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Input,
  PrimaryButton,
  CREAM,
  CREAM_DIM,
  CREAM_MUTED,
  SIGNAL,
  INK,
  BG_CARD,
  LINE,
  DISPLAY_FONT,
  MONO_FONT,
  ERR,
} from '@/lib/brand';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/queue', label: 'Queue' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/upload', label: 'Demo uploads' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    fetch('/api/admin/salespeople').then((r) => setAuthed(r.ok));
  }, []);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) setAuthed(true);
    else setError('Wrong password');
  };

  if (authed === null) return null;

  if (!authed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center relative"
        style={{ background: INK, color: CREAM, fontFamily: '"Inter Tight", sans-serif' }}
      >
        <div
          className="fixed inset-0 pointer-events-none z-0"
          aria-hidden="true"
          style={{
            backgroundImage:
              'linear-gradient(rgb(255 255 255 / 0.022) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.022) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, #000, transparent 85%)',
            maskImage: 'radial-gradient(ellipse 80% 70% at 50% 50%, #000, transparent 85%)',
          }}
        />
        <div
          className="fixed inset-x-0 top-0 h-[420px] pointer-events-none z-0"
          aria-hidden="true"
          style={{ background: 'radial-gradient(circle at 50% 0%, rgb(184 134 11 / 0.12), transparent 55%)' }}
        />
        <div className="w-full max-w-sm p-8 relative z-10">
          <div
            className="text-[10.5px] uppercase mb-3 text-center"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
          >
            / Admin portal
          </div>
          <h1
            className="text-[32px] text-center leading-tight tracking-[-0.03em] font-medium mb-2"
            style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
          >
            Admin <span style={{ color: SIGNAL }}>access.</span>
          </h1>
          <p className="text-[13.5px] text-center mb-6" style={{ color: CREAM_DIM }}>
            Password-protected area. Session lasts 7 days.
          </p>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="Password"
            autoFocus
          />
          {error && (
            <p className="text-[13px] mb-3" style={{ color: ERR }}>
              {error}
            </p>
          )}
          <PrimaryButton onClick={handleLogin} disabled={loading}>
            {loading ? 'Entering…' : 'Enter →'}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative"
      style={{ background: INK, color: CREAM, fontFamily: '"Inter Tight", sans-serif' }}
    >
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
      <div
        className="fixed inset-x-0 top-0 h-[420px] pointer-events-none z-0"
        aria-hidden="true"
        style={{ background: 'radial-gradient(circle at 50% 0%, rgb(184 134 11 / 0.12), transparent 55%)' }}
      />

      <nav
        className="sticky top-0 z-50 backdrop-blur-xl border-b"
        style={{ borderColor: LINE, background: 'rgb(20 20 19 / 0.82)' }}
      >
        <div className="max-w-[1240px] mx-auto px-6 md:px-8 h-[60px] flex items-center justify-between gap-6">
          <Link
            href="/admin"
            className="flex items-baseline text-[20px] font-bold tracking-[-0.025em]"
            style={{ fontFamily: 'Geist, "Inter Tight", sans-serif', color: CREAM }}
          >
            SalesFlow
            <span
              className="inline-block w-[6px] h-[6px] rounded-full ml-[3px]"
              style={{ background: SIGNAL, transform: 'translateY(-1px)' }}
            />
            <span
              className="text-[11px] uppercase ml-3 px-2 py-1 rounded-full"
              style={{
                fontFamily: MONO_FONT,
                letterSpacing: '0.12em',
                color: SIGNAL,
                background: 'rgb(184 134 11 / 0.1)',
                border: `1px solid rgb(184 134 11 / 0.3)`,
              }}
            >
              Admin
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label }) => {
              const active = pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));
              const exactActive = pathname === href;
              const isActive = href === '/admin' ? exactActive : active;
              return (
                <Link
                  key={href}
                  href={href}
                  className="px-4 py-2 rounded-full text-[13px] transition-colors"
                  style={{
                    color: isActive ? CREAM : CREAM_DIM,
                    background: isActive ? BG_CARD : 'transparent',
                    fontWeight: isActive ? 500 : 400,
                    border: isActive ? `1px solid ${LINE}` : '1px solid transparent',
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <a
            href="/dashboard"
            className="text-[11px] uppercase"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
          >
            ↗ Contractor view
          </a>
        </div>
      </nav>

      <main className="relative z-10 max-w-[1240px] mx-auto px-6 md:px-8 pb-16">{children}</main>
    </div>
  );
}
