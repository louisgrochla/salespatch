import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { ProductSubNav } from "./_components/SubNav";

export const dynamic = "force-dynamic";

export default async function ProductOverviewPage() {
  const [prompts, totalVersions] = await Promise.all([
    prisma.promptLibraryEntry.count(),
    prisma.promptVersion.count(),
  ]);

  return (
    <div className="p-6 space-y-6">
      <ProductSubNav />
      <PageHeader
        title="Product & System"
        subtitle="Prompts, architecture, infrastructure, pipelines, models — the system's own ground truth, versioned."
      />

      <section>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
          <StatTile label="prompts" value={prompts.toLocaleString()} />
          <StatTile label="prompt versions" value={totalVersions.toLocaleString()} />
          <StatTile label="architecture docs" value="—" hint="planned · stage 6" />
          <StatTile label="model docs" value="—" hint="planned · stage 6" />
        </div>
      </section>

      <section>
        <div className="h-section mb-2">available now</div>
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-2xl">
          <Link href="/product/prompts" className="block px-4 py-3 hover:bg-bg-hover">
            <div className="font-sans text-sm text-fg">Prompt library</div>
            <div className="font-mono text-2xs text-fg-dim mt-1">
              Versioned prompts. Every iteration kept, never deleted.
            </div>
          </Link>
        </div>
      </section>

      <section>
        <div className="h-section mb-2">planned · stage 6</div>
        <div className="font-sans text-xs text-fg-muted mb-2 max-w-2xl">
          Not built yet. These surfaces will land once Stage 6 starts — they are reserved here so the navigation contract is stable.
        </div>
        <div className="border border-border bg-bg-panel divide-y divide-border max-w-2xl">
          {[
            ["Architecture documents", "Versioned design docs in markdown."],
            ["System changelog", "Date / version / what changed / why."],
            ["Infrastructure notes", "Service / purpose / config."],
            ["Pipelines", "Pipeline name / description / version / performance."],
            ["Models", "Model / purpose / training / cost per cycle."],
          ].map(([title, desc]) => (
            <div key={title} className="px-4 py-3 flex items-start gap-3">
              <span className="pill border-fg-faint/40 text-fg-dim shrink-0 mt-0.5">planned</span>
              <div className="flex-1">
                <div className="font-sans text-sm text-fg-muted">{title}</div>
                <div className="font-mono text-2xs text-fg-dim mt-1">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
