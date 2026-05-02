import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-baseline justify-between border-b border-border pb-3 mb-4 gap-4">
      <div>
        <h1 className="font-sans text-xl font-medium text-fg">{title}</h1>
        {subtitle && (
          <div className="font-mono text-2xs text-fg-dim mt-0.5">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-mono text-2xs uppercase tracking-wider text-fg-muted
                 hover:text-fg border border-border hover:border-border-strong
                 px-2 py-1"
    >
      {children}
    </Link>
  );
}

export function HeaderPrimary({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="font-mono text-2xs uppercase tracking-wider bg-fg text-bg
                 hover:bg-fg-muted px-2 py-1"
    >
      {children}
    </Link>
  );
}
