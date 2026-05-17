import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

// R7: the manual "log a demo" form is retired. Every demo today comes
// from the /build-demo skill, which writes a DemoArtefact row via
// /api/ingest/demo-artefact. Keeping this route so any bookmarked
// "+ new demo" links still land somewhere coherent.

export default function NewDemoPage() {
  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="New Demo"
        subtitle="Manual entry is retired — demos are produced by the /build-demo skill."
      />
      <div className="max-w-2xl border border-border bg-bg-panel px-4 py-4 space-y-3">
        <p className="font-sans text-sm text-fg-muted">
          The Demo Library now reads <code className="text-fg">DemoArtefact</code>{" "}
          rows directly from the SL-MAS warehouse. To add a demo, run the{" "}
          <code className="text-fg">/build-demo</code> slash command in Claude
          Code on the relevant lead folder under{" "}
          <code className="text-fg">~/Desktop/salespatch-demos/[slug]/</code>.
          The skill writes the artefact to NERVE automatically via{" "}
          <code className="text-fg">/api/ingest/demo-artefact</code>.
        </p>
        <p className="font-sans text-xs text-fg-dim">
          Once the skill completes, the new row shows up in the Demo Library
          and on <code className="text-fg">/leads/[id]</code> with the iframe
          preview, palette swatch, and QA results panel.
        </p>
        <div className="pt-2">
          <Link
            href="/demos"
            className="font-mono text-2xs uppercase tracking-wider text-fg-muted hover:text-fg border border-border hover:border-border-strong px-2 py-1"
          >
            back to library
          </Link>
        </div>
      </div>
    </div>
  );
}
