"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/legal", label: "overview" },
  { href: "/legal/documents", label: "documents" },
  { href: "/legal/gdpr", label: "gdpr" },
  { href: "/legal/contractor-agreements", label: "contractor agreements" },
  { href: "/legal/companies-house", label: "companies house" },
  { href: "/legal/ip", label: "ip" },
];

export function LegalSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.href === "/legal"
          ? pathname === "/legal"
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
