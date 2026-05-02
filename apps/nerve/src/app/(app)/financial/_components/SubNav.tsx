"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS: { href: string; label: string }[] = [
  { href: "/financial", label: "overview" },
  { href: "/financial/revenue", label: "revenue" },
  { href: "/financial/costs", label: "costs" },
  { href: "/financial/analytics", label: "analytics" },
];

export function FinancialSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
      {ITEMS.map((item) => {
        const active =
          item.href === "/financial"
            ? pathname === "/financial"
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
