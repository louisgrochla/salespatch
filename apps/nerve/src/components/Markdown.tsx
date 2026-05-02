import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/cn";

// Renders dissertation prose, supervisor notes, decision logs, etc.
// Tight typography that matches the rest of the dense UI — narrow
// measure, modest line-height, no decorative spacing.

export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  if (!source.trim()) {
    return <div className="font-mono text-xs text-fg-dim italic">empty</div>;
  }
  return (
    <div className={cn("nv-prose font-sans text-sm text-fg leading-relaxed", className)}>
      <ReactMarkdown
        components={{
          h1: ({ node, ...p }) => <h1 {...p} className="text-xl font-medium mt-4 mb-2 text-fg" />,
          h2: ({ node, ...p }) => <h2 {...p} className="text-base font-medium mt-4 mb-2 text-fg" />,
          h3: ({ node, ...p }) => <h3 {...p} className="text-sm font-medium mt-3 mb-1 text-fg" />,
          h4: ({ node, ...p }) => <h4 {...p} className="text-xs uppercase tracking-wider mt-3 mb-1 text-fg-muted" />,
          p:  ({ node, ...p }) => <p {...p} className="my-2" />,
          ul: ({ node, ...p }) => <ul {...p} className="list-disc pl-5 my-2 space-y-1" />,
          ol: ({ node, ...p }) => <ol {...p} className="list-decimal pl-5 my-2 space-y-1" />,
          li: ({ node, ...p }) => <li {...p} className="leading-relaxed" />,
          code: ({ node, className, children, ...p }) => {
            const isInline = !className || !className.startsWith("language-");
            return isInline ? (
              <code {...p} className="font-mono text-xs bg-bg-raised px-1 py-0.5 border border-border">
                {children}
              </code>
            ) : (
              <code {...p} className={cn("font-mono text-xs", className)}>{children}</code>
            );
          },
          pre: ({ node, ...p }) => (
            <pre {...p} className="bg-bg-raised border border-border p-3 my-3 overflow-x-auto font-mono text-xs" />
          ),
          blockquote: ({ node, ...p }) => (
            <blockquote {...p} className="border-l-2 border-border pl-3 my-3 text-fg-muted italic" />
          ),
          a: ({ node, ...p }) => (
            <a {...p} className="text-accent underline underline-offset-2 hover:text-fg" />
          ),
          hr: () => <hr className="border-border my-4" />,
          table: ({ node, ...p }) => <table {...p} className="nv-table my-3" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
