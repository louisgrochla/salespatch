/**
 * SalesFlow brand system for authenticated (dashboard) pages.
 *
 * Matches /site/apply.html, the dashboard, and the lead detail design:
 * warm ink background, signal-gold accents, Geist display headings,
 * JetBrains Mono eyebrows, solid warm-black card surfaces.
 */
'use client';

import type { CSSProperties, ReactNode } from 'react';

// ───────────────────────── Tokens ─────────────────────────
export const CREAM = 'rgb(248 244 238)';
export const CREAM_DIM = 'rgb(210 200 185)';
export const CREAM_MUTED = 'rgb(210 200 185 / 0.55)';
export const SIGNAL = 'rgb(184 134 11)';
export const SIGNAL_SOFT = 'rgb(184 134 11 / 0.08)';
export const SIGNAL_BORDER = 'rgb(184 134 11 / 0.25)';
export const AMBER = 'rgb(220 150 80)';
export const INK = 'rgb(20 20 19)';
export const BG_CARD = 'rgb(28 26 23)';
export const BG_STRONG = 'rgb(30 28 25)';
export const BG_HOVER = 'rgb(36 33 29)';
export const LINE = 'rgb(255 255 255 / 0.08)';
export const LINE2 = 'rgb(255 255 255 / 0.05)';
export const ERR = 'rgb(255 138 128)';

export const DISPLAY_FONT = 'Geist, "Inter Tight", sans-serif';
export const MONO_FONT = '"JetBrains Mono", ui-monospace, monospace';

// ───────────────────────── Primitives ─────────────────────────

/** Page-level hero: eyebrow + display heading + optional sub-line + right-slot. */
export function PageHero({
  eyebrow,
  title,
  accent,
  sub,
  right,
  size = 'lg',
}: {
  eyebrow?: string;
  title: ReactNode;
  accent?: string;
  sub?: ReactNode;
  right?: ReactNode;
  size?: 'lg' | 'md';
}) {
  const fontSize = size === 'lg' ? 44 : 36;
  return (
    <div className="flex items-start justify-between gap-6 mb-8 flex-wrap">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div
            className="text-[10.5px] uppercase mb-3"
            style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
          >
            / {eyebrow}
          </div>
        )}
        <h1
          className="leading-[1.04] tracking-[-0.03em] font-medium m-0"
          style={{ fontFamily: DISPLAY_FONT, color: CREAM, fontSize }}
        >
          {title}
          {accent && (
            <>
              {' '}
              <span style={{ color: SIGNAL }}>{accent}</span>
            </>
          )}
        </h1>
        {sub && (
          <p className="text-[14px] mt-3 m-0" style={{ color: CREAM_DIM }}>
            {sub}
          </p>
        )}
      </div>
      {right && (
        <div
          className="text-right text-[11px] uppercase"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
        >
          {right}
        </div>
      )}
    </div>
  );
}

/** Section with JetBrains-mono eyebrow + Geist subheading. */
export function Section({
  eyebrow,
  title,
  children,
  className = '',
}: {
  eyebrow?: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {eyebrow && (
        <div
          className="text-[10.5px] uppercase mb-2"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
        >
          / {eyebrow}
        </div>
      )}
      {title && (
        <h2
          className="text-[22px] tracking-[-0.025em] font-medium m-0 mb-4"
          style={{ fontFamily: DISPLAY_FONT, color: CREAM }}
        >
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/** Rounded warm-black card surface. */
export function Card({
  children,
  accent = false,
  padding = 'md',
  className = '',
  style,
  onClick,
}: {
  children: ReactNode;
  accent?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'none';
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const pad = padding === 'none' ? '' : padding === 'sm' ? 'p-4' : padding === 'lg' ? 'p-8' : 'p-5';
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl ${pad} ${className}`}
      style={{
        background: accent ? SIGNAL_SOFT : BG_STRONG,
        border: accent ? `1px solid ${SIGNAL_BORDER}` : `1px solid ${LINE}`,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Small JetBrains-mono uppercase label. */
export function Eyebrow({
  children,
  accent = false,
  className = '',
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] uppercase mb-3 ${className}`}
      style={{
        fontFamily: MONO_FONT,
        letterSpacing: '0.14em',
        color: accent ? SIGNAL : CREAM_MUTED,
      }}
    >
      {children}
    </div>
  );
}

/** Label + value row inside an InfoCard. */
export function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[10px] uppercase mb-1"
        style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
      >
        {label}
      </div>
      <div
        className="text-[14px] break-words"
        style={{ color: CREAM, fontFamily: mono ? MONO_FONT : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

/** Rounded pill for chip rows. */
export function Chip({
  children,
  active = false,
  onClick,
  count,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 rounded-full text-[13px] transition-colors"
      style={{
        background: active ? SIGNAL : 'transparent',
        color: active ? 'white' : CREAM_DIM,
        border: active ? 'none' : `1px solid ${LINE}`,
        fontWeight: active ? 500 : 400,
        fontFamily: active ? DISPLAY_FONT : undefined,
      }}
    >
      {children}
      {count != null && (
        <span
          className="text-[11px] ml-1.5"
          style={{
            fontFamily: MONO_FONT,
            color: active ? 'rgb(255 255 255 / 0.7)' : CREAM_MUTED,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Cream-on-ink primary button (matches apply CTA + lead detail action). */
export function PrimaryButton({
  children,
  onClick,
  href,
  disabled = false,
  size = 'md',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit';
}) {
  const pad = size === 'sm' ? 'px-4 py-2 text-[13px]' : size === 'lg' ? 'px-6 py-3.5 text-[15px]' : 'px-5 py-3 text-[14px]';
  const common = {
    background: CREAM,
    color: 'rgb(20 20 19)',
    fontWeight: 500,
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? ('none' as const) : undefined,
  };
  const Tag = href ? 'a' : 'button';
  const extra = href ? { href } : { onClick, type, disabled };
  return (
    <Tag
      {...(extra as any)}
      className={`${pad} rounded-full inline-flex items-center gap-2 transition-colors no-underline`}
      style={common}
    >
      {children}
    </Tag>
  );
}

export function GhostButton({
  children,
  onClick,
  href,
  size = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const pad = size === 'sm' ? 'px-4 py-2 text-[13px]' : size === 'lg' ? 'px-6 py-3.5 text-[15px]' : 'px-5 py-3 text-[14px]';
  const common = {
    background: 'transparent',
    color: CREAM,
    border: `1px solid ${LINE}`,
  };
  const Tag = href ? 'a' : 'button';
  const extra = href ? { href } : { onClick };
  return (
    <Tag
      {...(extra as any)}
      className={`${pad} rounded-full inline-flex items-center gap-2 transition-colors no-underline`}
      style={common}
    >
      {children}
    </Tag>
  );
}

/** Signal-bordered quick-stat cell for metric ribbons. */
export function StatCell({
  label,
  value,
  accent = false,
  prefix = '',
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  prefix?: string;
}) {
  const show = accent && (typeof value === 'number' ? value > 0 : !!value);
  return (
    <div
      className="px-6 py-6"
      style={{ borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}
    >
      <p
        className="text-[34px] leading-none tracking-[-0.03em] m-0"
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 500,
          color: show ? SIGNAL : CREAM,
        }}
      >
        {prefix && <span style={{ color: show ? SIGNAL : CREAM_DIM }}>{prefix}</span>}
        {value}
      </p>
      <p
        className="text-[10.5px] uppercase mt-2 m-0"
        style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
      >
        {label}
      </p>
    </div>
  );
}

/** Empty-state block used across pages. */
export function EmptyState({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <Card padding="lg" className="text-center">
      {eyebrow && (
        <div
          className="text-[10.5px] uppercase mb-3"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: SIGNAL }}
        >
          / {eyebrow}
        </div>
      )}
      <p
        className="text-[22px] m-0"
        style={{ fontFamily: DISPLAY_FONT, color: CREAM, fontWeight: 500, letterSpacing: '-0.02em' }}
      >
        {title}
      </p>
      {sub && (
        <p className="text-[14px] mt-2 m-0" style={{ color: CREAM_DIM }}>
          {sub}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

/** Form text input styled for dark cards. */
export function Input({
  label,
  hint,
  error,
  className = '',
  ...props
}: {
  label?: string;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <div
          className="text-[10.5px] uppercase mb-2"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
        >
          {label}
        </div>
      )}
      <input
        {...props}
        className="w-full rounded-xl px-4 py-3 text-[15px] outline-none transition-colors"
        style={{
          background: BG_CARD,
          border: `1px solid ${error ? ERR : LINE}`,
          color: CREAM,
          fontFamily: 'inherit',
        }}
      />
      {hint && !error && (
        <div className="text-[12px] mt-1.5" style={{ color: CREAM_MUTED }}>
          {hint}
        </div>
      )}
      {error && (
        <div className="text-[12px] mt-1.5" style={{ color: ERR }}>
          {error}
        </div>
      )}
    </div>
  );
}

/** Textarea styled to match Input. */
export function Textarea({
  label,
  hint,
  className = '',
  ...props
}: {
  label?: string;
  hint?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <div
          className="text-[10.5px] uppercase mb-2"
          style={{ fontFamily: MONO_FONT, letterSpacing: '0.14em', color: CREAM_MUTED }}
        >
          {label}
        </div>
      )}
      <textarea
        {...props}
        className="w-full rounded-xl px-4 py-3 text-[15px] outline-none transition-colors"
        style={{
          background: BG_CARD,
          border: `1px solid ${LINE}`,
          color: CREAM,
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      {hint && (
        <div className="text-[12px] mt-1.5" style={{ color: CREAM_MUTED }}>
          {hint}
        </div>
      )}
    </div>
  );
}
