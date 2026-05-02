import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";

// Supabase webhook payload shape (Database Webhooks → "Send HTTP Request").
// Reference: https://supabase.com/docs/guides/database/webhooks
//
// We accept the standard envelope and map the `record` body to NERVE's
// PitchLog schema. Any field added on the Supabase side is preserved into
// the embedding metadata even if it isn't yet a column here.

const SupabaseEnvelope = z.object({
  type: z.enum(["INSERT", "UPDATE", "DELETE"]),
  table: z.string().optional(),
  schema: z.string().optional(),
  record: z.record(z.any()).nullable().optional(),
  old_record: z.record(z.any()).nullable().optional(),
});

const PitchRecord = z.object({
  id: z.string().or(z.number()).optional(),
  business_name: z.string().min(1).optional(),
  businessName: z.string().min(1).optional(),
  business_type: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  lead_source: z.string().nullable().optional(),
  demo_version: z.string().nullable().optional(),
  outcome: z.string(),
  contractor_id: z.string().nullable().optional(),
  pitch_duration: z.number().nullable().optional(),
  consent: z.boolean().nullable().optional(),
  consent_flag: z.boolean().nullable().optional(),
  notes: z.string().nullable().optional(),
  date: z.string().or(z.date()).nullable().optional(),
  created_at: z.string().or(z.date()).nullable().optional(),
  objections: z.array(z.string()).nullable().optional(),
});

function pickBusinessName(r: z.infer<typeof PitchRecord>): string | null {
  return r.business_name ?? r.businessName ?? null;
}

function pickPitchDate(r: z.infer<typeof PitchRecord>): Date {
  const raw = r.date ?? r.created_at;
  if (!raw) return new Date();
  return raw instanceof Date ? raw : new Date(raw);
}

function normaliseOutcome(value: string): "closed" | "rejected" | "follow_up" {
  const v = value.trim().toLowerCase().replace(/[\s-]/g, "_");
  if (v === "closed" || v === "won" || v === "sale") return "closed";
  if (v === "rejected" || v === "lost" || v === "no") return "rejected";
  return "follow_up";
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — refuse rather than silently accept.
    return false;
  }
  if (!signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  // Supabase sends raw hex; some configs prefix with "sha256=". Accept both.
  const candidate = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("x-supabase-signature") ?? req.headers.get("x-signature");

  // Allow signature bypass only when explicitly disabled in dev — never in
  // production. Keeps local testing easy without weakening prod.
  const allowUnsigned =
    process.env.NODE_ENV !== "production" &&
    process.env.NERVE_WEBHOOK_ALLOW_UNSIGNED === "true";

  if (!allowUnsigned && !verifySignature(rawBody, sig)) {
    await logIngestion("/api/ingest/pitch", "failed", "invalid signature", rawBody);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let envelope: z.infer<typeof SupabaseEnvelope>;
  try {
    envelope = SupabaseEnvelope.parse(JSON.parse(rawBody));
  } catch (e) {
    await logIngestion("/api/ingest/pitch", "failed", `bad envelope: ${msg(e)}`, rawBody);
    return NextResponse.json({ error: "bad envelope" }, { status: 400 });
  }

  // We only act on INSERTs. UPDATEs would need conflict resolution policy
  // (overwrite vs append) — defer until we have a real case.
  if (envelope.type !== "INSERT" || !envelope.record) {
    await logIngestion("/api/ingest/pitch", "ok", `ignored ${envelope.type}`, rawBody);
    return NextResponse.json({ ignored: true });
  }

  let record: z.infer<typeof PitchRecord>;
  try {
    record = PitchRecord.parse(envelope.record);
  } catch (e) {
    await logIngestion("/api/ingest/pitch", "failed", `bad record: ${msg(e)}`, rawBody);
    return NextResponse.json({ error: "bad record" }, { status: 400 });
  }

  const businessName = pickBusinessName(record);
  if (!businessName) {
    await logIngestion("/api/ingest/pitch", "failed", "missing business_name", rawBody);
    return NextResponse.json({ error: "missing business_name" }, { status: 400 });
  }

  const pitchDate = pickPitchDate(record);
  const outcome = normaliseOutcome(record.outcome);
  const supabasePitchId = record.id != null ? String(record.id) : null;

  try {
    const phaseLabel = await phaseLabelFor(pitchDate);
    const pitch = await prisma.pitchLog.upsert({
      where: { supabasePitchId: supabasePitchId ?? "__never__" },
      create: {
        date: pitchDate,
        businessName,
        businessType: record.business_type ?? null,
        sector: record.sector ?? null,
        location: record.location ?? null,
        leadSource: record.lead_source ?? null,
        demoVersion: record.demo_version ?? null,
        outcome,
        contractorId: record.contractor_id ?? null,
        pitchDuration: record.pitch_duration ?? null,
        consentFlag: record.consent_flag ?? record.consent ?? false,
        notes: record.notes ?? null,
        supabasePitchId,
        source: "webhook",
        phaseLabel,
      },
      update: {}, // INSERT-only semantics — ignore re-deliveries
    });

    if (record.objections?.length) {
      await attachObjections(pitch.id, record.objections);
    }

    await embedRecord(
      {
        sourceType: "PitchLog",
        sourceId: pitch.id,
        phaseLabel,
        metadata: {
          section: "sales",
          contentType: "pitch",
          date: pitchDate.toISOString(),
          sector: record.sector ?? null,
          businessType: record.business_type ?? null,
          outcome,
          contractorId: record.contractor_id ?? null,
          leadSource: record.lead_source ?? null,
          demoVersion: record.demo_version ?? null,
          tags: record.objections ?? [],
        },
      },
      {
        businessName,
        businessType: record.business_type ?? null,
        sector: record.sector ?? null,
        location: record.location ?? null,
        leadSource: record.lead_source ?? null,
        demoVersion: record.demo_version ?? null,
        outcome,
        objections: (record.objections ?? []).join(", "),
        notes: record.notes ?? null,
        date: pitchDate,
      },
    );

    await logIngestion("/api/ingest/pitch", "ok", null, rawBody);
    return NextResponse.json({ ok: true, pitchId: pitch.id });
  } catch (e) {
    const message = msg(e);
    await logIngestion("/api/ingest/pitch", "failed", message, rawBody);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function attachObjections(pitchId: string, names: string[]) {
  const cleaned = Array.from(
    new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
  );
  if (!cleaned.length) return;

  for (const name of cleaned) {
    const tag = await prisma.objectionTag.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    await prisma.pitchObjection.upsert({
      where: { pitchId_objectionId: { pitchId, objectionId: tag.id } },
      create: { pitchId, objectionId: tag.id },
      update: {},
    });
  }
}

async function logIngestion(
  endpoint: string,
  status: "ok" | "failed",
  errorMessage: string | null,
  rawBody: string,
) {
  try {
    await prisma.webhookIngestion.create({
      data: {
        endpoint,
        status,
        errorMessage,
        payloadHash: crypto.createHash("sha256").update(rawBody).digest("hex"),
      },
    });
  } catch {
    // If logging itself fails (DB down), don't mask the upstream error.
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
