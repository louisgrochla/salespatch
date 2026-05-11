'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Users, MapPin, Cpu, LogOut, Zap, Settings, Inbox } from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Operations', icon: BarChart3 },
  { href: '/pipeline', label: 'Pipeline', icon: Cpu },
  { href: '/salesforce', label: 'Team', icon: Users },
  { href: '/leads/queue', label: 'Queue', icon: Inbox },
  { href: '/leads', label: 'Leads', icon: MapPin },
];

const BOTTOM_NAV = [
  { href: '/settings', label: 'Settings', icon: Settings },
];

function findActiveHref(pathname: string, hrefs: string[]): string | null {
  // Pick the longest matching href so /leads/queue beats /leads when the
  // user is on the queue page. Without this, prefix-startsWith makes both
  // nav items highlight simultaneously.
  let best: string | null = null;
  for (const h of hrefs) {
    if (pathname === h || pathname.startsWith(h + '/')) {
      if (!best || h.length > best.length) best = h;
    }
  }
  return best;
}

export default function Sidebar() {
  const pathname = usePathname();
  const activeHref = findActiveHref(pathname, [
    ...NAV.map((n) => n.href),
    ...BOTTOM_NAV.map((n) => n.href),
  ]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <aside className="w-56 bg-slate-950 min-h-screen flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-white leading-none">SalesFlow</div>
            <div className="text-[9px] text-slate-500 font-medium uppercase tracking-[0.15em] mt-0.5">Operations</div>
          </div>
        </div>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-3 py-2">
        <div className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] px-2 mb-2">Monitor</div>
        <div className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = activeHref === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-all ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-400' : ''}`} />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="text-[9px] font-semibold text-slate-600 uppercase tracking-[0.1em] px-2 mb-2 mt-6">System</div>
        <div className="space-y-0.5">
          {BOTTOM_NAV.map(({ href, label, icon: Icon }) => {
            const active = activeHref === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-all ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-400' : ''}`} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User / Logout */}
      <div className="px-3 py-4 border-t border-white/5">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-medium text-slate-600 hover:text-red-400 hover:bg-white/5 transition-all w-full"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
