import Link from "next/link";
import { cn } from "@/lib/cn";

interface SectionCta {
  href: string;
  label: string;
}

export function Section({
  title,
  framer,
  cta,
  children,
  className,
}: {
  title: string;
  framer?: React.ReactNode;
  cta?: SectionCta;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="h-section">{title}</div>
          {framer && (
            <div className="font-sans text-xs text-fg-muted mt-0.5">{framer}</div>
          )}
        </div>
        {cta && (
          <Link
            href={cta.href}
            className="font-mono text-2xs uppercase tracking-wider text-fg-muted
                       hover:text-fg shrink-0"
          >
            {cta.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
