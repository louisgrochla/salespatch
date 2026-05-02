"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS: { href: string; label: string }[] = [
  { href: "/research", label: "dashboard" },
  { href: "/research/dissertation", label: "dissertation" },
  { href: "/research/sections", label: "sections" },
  { href: "/research/literature", label: "literature" },
  { href: "/research/methodology", label: "methodology" },
  { href: "/research/evidence", label: "evidence" },
  { href: "/research/supervisor", label: "supervisor" },
  { href: "/research/calendar", label: "calendar" },
  { href: "/research/phases", label: "phases" },
];

export function ResearchSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
      {ITEMS.map((item) => {
        const active =
          item.href === "/research"
            ? pathname === "/research"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "px-3 py-2 font-mono text-2xs uppercase tracking-wider whitespace-nowrap",
              active
                ? "text-fg border-b-2 border-accent -mb-px"
                : "text-fg-dim hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
