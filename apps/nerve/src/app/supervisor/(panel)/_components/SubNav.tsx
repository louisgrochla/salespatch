"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS: { href: string; label: string }[] = [
  { href: "/supervisor", label: "overview" },
  { href: "/supervisor/pitches", label: "pitches" },
  { href: "/supervisor/sections", label: "dissertation sections" },
  { href: "/supervisor/literature", label: "literature" },
  { href: "/supervisor/methodology", label: "methodology" },
  { href: "/supervisor/evidence", label: "evidence" },
  { href: "/supervisor/meetings", label: "meetings" },
];

export function SupervisorSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.href === "/supervisor"
          ? pathname === "/supervisor"
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href}
            className={cn(
              "px-3 py-2 font-mono text-2xs uppercase tracking-wider whitespace-nowrap",
              active ? "text-fg border-b-2 border-accent -mb-px" : "text-fg-dim hover:text-fg",
            )}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
