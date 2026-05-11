import { NextResponse } from "next/server";
import { demoArtefactStore } from "@/lib/sl-mas/demoArtefactStore";

// GET /api/public/demo/<slug>
//
// Public read of the latest demo HTML for a canonical lead slug. No
// auth — sales-pitch demos are designed to be shareable URLs that the
// salesperson hands to the prospective customer on the doorstep.
//
// Sits under /api/public/* (already exempted by middleware) so the
// founder gate doesn't redirect to /login. Renders the inline HTML
// verbatim with Content-Type: text/html so a browser renders it
// directly. The demo HTML is self-contained (inline CSS + JS + data:
// images by /build-demo convention), so no asset fetches escape this
// route.
//
// Lookup uses demoArtefactStore.latestForLead(slug) — the most recent
// generation for the slug. Re-running /build-demo on the same lead
// overwrites the served version immediately on next request.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } },
): Promise<Response> {
  const slug = params.slug;
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  const latest = await demoArtefactStore.latestForLead(slug);
  if (!latest) {
    return new Response(notFoundHtml(slug), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response(latest.html_inline, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
      "X-Demo-Artefact-Id": latest.artefact_id,
      "X-Demo-Generated-At": latest.generated_at,
    },
  });
}

function notFoundHtml(slug: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Demo not found</title><style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 24px;color:#0f172a}h1{font-size:18px;font-weight:600;margin:0 0 8px}p{color:#64748b;font-size:14px;line-height:1.6;margin:0}</style></head><body><h1>Demo not found</h1><p>No demo has been generated for <code>${escapeHtml(slug)}</code>.</p></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
