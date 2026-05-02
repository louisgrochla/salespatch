"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/knowledge", label: "overview" },
  { href: "/knowledge/brand", label: "brand" },
  { href: "/knowledge/processes", label: "processes" },
  { href: "/knowledge/glossary", label: "glossary" },
  { href: "/knowledge/resources", label: "resources" },
];

export function KnowledgeSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.href === "/knowledge"
          ? pathname === "/knowledge"
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
