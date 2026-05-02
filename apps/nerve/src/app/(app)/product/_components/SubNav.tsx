"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS: { href: string; label: string; ready: boolean }[] = [
  { href: "/product", label: "overview", ready: true },
  { href: "/product/prompts", label: "prompt library", ready: true },
  { href: "/product/architecture", label: "architecture", ready: false },
  { href: "/product/changelog", label: "changelog", ready: false },
  { href: "/product/infrastructure", label: "infrastructure", ready: false },
  { href: "/product/pipelines", label: "pipelines", ready: false },
  { href: "/product/models", label: "models", ready: false },
];

export function ProductSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.href === "/product"
          ? pathname === "/product"
          : pathname === item.href || pathname.startsWith(item.href + "/");
        if (!item.ready) {
          return (
            <span key={item.href}
              className="px-3 py-2 font-mono text-2xs uppercase tracking-wider text-fg-faint cursor-not-allowed"
              title="Lands in Stage 6">
              {item.label}
            </span>
          );
        }
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
