"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Beaker,
  BookOpen,
  Boxes,
  Briefcase,
  CheckCircle2,
  ClipboardList,
  Coins,
  Cpu,
  FileText,
  GitCommit,
  GitBranch,
  Gavel,
  GraduationCap,
  Hammer,
  LayoutDashboard,
  NotebookPen,
  Search,
  Sparkles,
  Target,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface SidebarCounts {
  pitches?: number;
  operations?: number;
  revenue?: number;
  prompts?: number;
  demos?: number;
  leads?: number;
  builds?: number;
  literature?: number;
  sections?: number;
  brand?: number;
  legal?: number;
  changelog?: number;
  notes?: number;
  qaVisual?: number;
}

export function Sidebar({ counts }: { counts: SidebarCounts }) {
  const pathname = usePathname();

  const groups: NavGroup[] = [
    {
      label: "pipeline",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/sales", label: "Sales Intelligence", icon: BarChart3, count: counts.pitches },
        { href: "/leads", label: "Lead Intelligence", icon: Briefcase, count: counts.leads },
        { href: "/pipeline", label: "Pivot", icon: Workflow },
        { href: "/pipeline/episodes", label: "Episodes", icon: GitBranch },
        { href: "/pipeline/strategies", label: "Strategies", icon: Target },
        { href: "/demos", label: "Demo Library", icon: Boxes, count: counts.demos },
        { href: "/qa", label: "Visual QA", icon: CheckCircle2, count: counts.qaVisual },
        { href: "/builds", label: "Customer Builds", icon: Hammer, count: counts.builds },
      ],
    },
    {
      label: "capture",
      items: [
        { href: "/notes", label: "Notes", icon: NotebookPen, count: counts.notes },
        { href: "/operations", label: "Operations Log", icon: ClipboardList, count: counts.operations },
        { href: "/changelog", label: "Changelog", icon: GitCommit, count: counts.changelog },
        { href: "/financial", label: "Financial Tracker", icon: Coins, count: counts.revenue },
      ],
    },
    {
      label: "knowledge",
      items: [
        { href: "/ask", label: "Ask", icon: Sparkles },
        { href: "/search", label: "Search", icon: Search },
        { href: "/knowledge", label: "Knowledge Base", icon: FileText, count: counts.brand },
        { href: "/product", label: "Product & System", icon: Cpu, count: counts.prompts },
        { href: "/legal", label: "Legal & Compliance", icon: Gavel, count: counts.legal },
        { href: "/system", label: "System Status", icon: Activity },
      ],
    },
    {
      label: "research",
      items: [
        { href: "/dissertation", label: "Research Project", icon: GraduationCap, count: counts.sections },
        { href: "/dissertation/literature", label: "Literature", icon: BookOpen, count: counts.literature },
        { href: "/dissertation/methodology", label: "Methodology", icon: Beaker },
      ],
    },
  ];

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-bg-panel flex flex-col h-screen sticky top-0">
      <div className="px-4 py-4 border-b border-border">
        <div className="font-mono text-2xs uppercase tracking-wider text-fg-dim">
          sl-mas
        </div>
        <div className="font-sans text-base font-medium text-fg leading-tight">
          NERVE
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-4 mb-1 h-section">{group.label}</div>
            <ul>
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 px-4 py-1.5 text-sm font-sans",
                        "text-fg-muted hover:text-fg hover:bg-bg-hover",
                        active && "text-fg bg-bg-hover border-l-2 border-accent",
                      )}
                    >
                      <Icon size={14} className="shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.count != null && item.count > 0 && (
                        <span className="font-mono text-2xs text-fg-dim">
                          {item.count.toLocaleString()}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-border">
        <Link
          href="/api/auth/signout"
          className="font-mono text-2xs uppercase tracking-wider text-fg-dim hover:text-fg"
        >
          sign out
        </Link>
      </div>
    </aside>
  );
}
