'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PageHero,
  Card,
  Eyebrow,
  PrimaryButton,
  GhostButton,
  StatCell,
  CREAM,
  CREAM_DIM,
  CREAM_MUTED,
  SIGNAL,
  BG_STRONG,
  LINE,
  DISPLAY_FONT,
  MONO_FONT,
} from '@/lib/brand';

interface Salesperson {
  id: string;
  name: string;
  phone: string | null;
  area_postcode: string | null;
  active: boolean;
  created_at: string;
  last_active_at?: string | null;
}

interface LeadRow {
  id: string;
  user_id: string;
  status: string;
  assigned_at: string;
  notes: string | null;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<Salesperson[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);

  useEffect(() => {
    fetch('/api/admin/salespeople').then((r) => r.json()).then((d) => setUsers(d.data ?? []));
    fetch('/api/admin/leads').then((r) => r.json()).then((d) => setLeads(d.data ?? []));
  }, []);

  const activeUsers = users.filter((u) => u.active).length;
  const openLeads = leads.filter((l) => ['new', 'visited', 'pitched'].includes(l.status)).length;
  const soldLeads = leads.filter((l) => l.status === 'sold').length;

  return (
    <div className="py-10">
      <PageHero
        eyebrow="Admin"
        title="Your bench,"
        accent="at a glance."
        sub="Create contractor accounts, assign leads, and upload demo sites. Everything you give out from here flows straight into that contractor's dashboard."
      />

      <div
        className="grid grid-cols-2 md:grid-cols-4 rounded-2xl overflow-hidden mb-10"
        style={{ background: BG_STRONG, border: `1px solid ${LINE}` }}
      >
        <StatCell label="Contractors" value={users.length} />
        <StatCell label="Active" value={activeUsers} />
        <StatCell label="Open leads" value={openLeads} />
        <StatCell label="Sold" value={soldLeads} accent />
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-12">
        <ActionCard
          href="/admin/users"
          eyebrow="Create"
          title="New contractor"
          sub="Make a login for a friend. Set their PIN, share the credentials."
        />
        <ActionCard
          href="/admin/leads"
          eyebrow="Assign"
          title="New lead"
          sub="Type in a business, attach brand colours and pitch hooks, send it to a contractor's queue."
        />
        <ActionCard
          href="/admin/upload"
          eyebrow="Upload"
          title="Demo site HTML"
          sub="Ship a static demo site tied to a business. Public URL goes with the lead."
        />
      </div>

      <section className="mb-12">
        <Eyebrow accent>Recent contractors</Eyebrow>
        {users.length === 0 ? (
          <Card padding="lg" className="text-center">
            <p className="text-[15px] m-0" style={{ color: CREAM_DIM }}>
              No contractors yet. <Link href="/admin/users" style={{ color: SIGNAL }}>Create one →</Link>
            </p>
          </Card>
        ) : (
          <Card padding="none">
            <div
              className="grid grid-cols-[1fr_140px_120px_90px] gap-4 px-5 py-3 text-[10.5px] uppercase"
              style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED, borderBottom: `1px solid ${LINE}` }}
            >
              <span>Name</span>
              <span>Postcode</span>
              <span>Joined</span>
              <span>Status</span>
            </div>
            {users.slice(0, 8).map((u, i) => (
              <div
                key={u.id}
                className="grid grid-cols-[1fr_140px_120px_90px] gap-4 px-5 py-3.5"
                style={{ borderBottom: i === Math.min(users.length, 8) - 1 ? 'none' : `1px solid rgb(255 255 255 / 0.05)` }}
              >
                <span className="text-[14.5px]" style={{ color: CREAM, fontFamily: DISPLAY_FONT, fontWeight: 500 }}>
                  {u.name}
                </span>
                <span className="text-[13px]" style={{ color: CREAM_DIM, fontFamily: MONO_FONT }}>
                  {u.area_postcode ?? '—'}
                </span>
                <span className="text-[12px]" style={{ color: CREAM_MUTED, fontFamily: MONO_FONT, letterSpacing: '0.04em' }}>
                  {formatDate(u.created_at)}
                </span>
                <span
                  className="text-[11px] uppercase"
                  style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: u.active ? SIGNAL : CREAM_MUTED }}
                >
                  {u.active ? 'Active' : 'Paused'}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function ActionCard({
  href,
  eyebrow,
  title,
  sub,
}: {
  href: string;
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <Link href={href} className="no-underline block">
      <Card padding="lg" style={{ cursor: 'pointer', height: '100%' }}>
        <div
          className="text-[10px] uppercase mb-2"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
        >
          / {eyebrow}
        </div>
        <p
          className="text-[20px] m-0 mb-2"
          style={{ fontFamily: DISPLAY_FONT, fontWeight: 500, color: CREAM, letterSpacing: '-0.02em' }}
        >
          {title}
        </p>
        <p className="text-[13.5px] m-0" style={{ color: CREAM_DIM, lineHeight: 1.55 }}>
          {sub}
        </p>
      </Card>
    </Link>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
}
