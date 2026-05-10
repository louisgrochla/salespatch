import { NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/lib/sl-mas/hmac";
import {
  composerIterationStore,
  type ComposerIterationInput,
} from "@/lib/sl-mas/composerIterationStore";

// POST /api/ingest/composer-iteration
//
// HMAC-signed Composer Workbench iteration ingest. Called fire-and-forget
// from tools/workbench/server.ts every time the founder hits "save" — AI
// generate, manual edit, rename, delete. Stores the full HTML inline so
// the iteration trail is replayable without filesystem access.
//
// /api/ingest/* is exempted from the NextAuth founder-session middleware,
// so the only auth here is the HMAC. Shares OUTCOME_INGEST_SECRET with the
// rest of the SL-MAS ingest endpoints — the workbench is founder-local so
// rotating one secret across all ingest paths is fine.
//
// Header: X-Ingest-Signature: sha256=<hex>
// Secret: OUTCOME_INGEST_SECRET (Vercel env)
//
// Idempotent on iteration_id (caller-supplied, format
// `<lead_slug>-<iso_no_colons>`). Replay returns 200 with inserted=false.

interface ComposerIterationBody {
  iteration_id: string;
  lead_id?: string;
  business_name?: string;
  vertical?: string;
  html_output: string;
  css_output?: string;
  prompt?: string;
  response?: string;
  edit_kind: string;
  editor_notes?: string;
  parent_iteration_id?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await req.text();
  const signature = req.headers.get("x-ingest-signature");
  const secret = process.env.OUTCOME_INGEST_SECRET;
  const allowUnsigned =
    process.env.NODE_ENV !== "production" &&
    process.env.OUTCOME_INGEST_ALLOW_UNSIGNED === "true";

  if (!allowUnsigned) {
    if (!secret) {
      return NextResponse.json(
        { error: "OUTCOME_INGEST_SECRET not configured" },
        { status: 503 },
      );
    }
    if (!verifySignature(raw, signature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  let body: ComposerIterationBody;
  try {
    body = JSON.parse(raw) as ComposerIterationBody;
  } catch (e) {
    return NextResponse.json(
      { error: `bad json: ${String(e)}` },
      { status: 400 },
    );
  }

  const validation = validate(body);
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 400 });
  }

  const input: ComposerIterationInput = {
    iteration_id: body.iteration_id,
    lead_id: body.lead_id,
    business_name: body.business_name,
    vertical: body.vertical,
    html_output: body.html_output,
    css_output: body.css_output,
    prompt: body.prompt,
    response: body.response,
    edit_kind: body.edit_kind,
    editor_notes: body.editor_notes,
    parent_iteration_id: body.parent_iteration_id,
    metadata: body.metadata,
  };

  const result = await composerIterationStore.ingest(input);
  return NextResponse.json({
    iteration_id: result.iteration_id,
    inserted: result.inserted,
    id: result.row.id,
  });
}

function validate(
  body: Partial<ComposerIterationBody>,
): string | undefined {
  if (!body || typeof body !== "object") return "body required";
  if (typeof body.iteration_id !== "string" || body.iteration_id.length === 0)
    return "iteration_id required";
  if (typeof body.html_output !== "string")
    return "html_output required (string)";
  if (typeof body.edit_kind !== "string" || body.edit_kind.length === 0)
    return "edit_kind required";
  return undefined;
}
