import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import type {
  PitchOutcome,
  InterestLevel,
  DemoReaction,
  PaymentMethod,
  FollowupTime,
  AgreedNextStep,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { postOutcomeToRuntime, OutcomeIngestPayload } from "@/lib/outcomeRuntime";

// Pitch ingestion. Accepts both:
//   1. Supabase Database Webhook envelope { type, table, record, … }
//      with HMAC-SHA256 signature header `x-supabase-signature`.
//   2. Native mobile-api shape — flat JSON body with the same record
//      fields, signed with HMAC over the body using the same secret.
//
// We handle the post-pitch questionnaire fields (interest level,
// objections, decision-maker presence, demo reaction, etc.) and
// compute qualityFlag server-side so dissertation queries automatically
// scope to research-grade rows without the client needing to know the
// rules.

// ─── Body schemas ────────────────────────────────────────────────────────

const SupabaseEnvelope = z.object({
  type: z.enum(["INSERT", "UPDATE", "DELETE"]),
  table: z.string().optional(),
  schema: z.string().optional(),
  record: z.record(z.any()).nullable().optional(),
  old_record: z.record(z.any()).nullable().optional(),
});

// Accept snake_case OR camelCase for every field. Optional everywhere
// except outcome — even legacy webhook payloads must declare an outcome.
const PitchRecord = z
  .object({
    id: z.string().or(z.number()).optional(),
    business_name: z.string().optional(),
    businessName: z.string().optional(),
    business_type: z.string().nullable().optional(),
    businessType: z.string().nullable().optional(),
    sector: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    lead_source: z.string().nullable().optional(),
    leadSource: z.string().nullable().optional(),
    demo_version: z.string().nullable().optional(),
    demoVersion: z.string().nullable().optional(),
    outcome: z.string(),
    contractor_id: z.string().nullable().optional(),
    contractorId: z.string().nullable().optional(),
    pitch_duration: z.number().nullable().optional(),
    pitchDuration: z.number().nullable().optional(),
    pitch_attempt_number: z.number().int().nullable().optional(),
    pitchAttemptNumber: z.number().int().nullable().optional(),
    consent: z.boolean().nullable().optional(),
    consent_flag: z.boolean().nullable().optional(),
    consent_to_record: z.boolean().nullable().optional(),
    consentToRecord: z.boolean().nullable().optional(),
    notes: z.string().nullable().optional(),
    date: z.string().or(z.date()).nullable().optional(),
    created_at: z.string().or(z.date()).nullable().optional(),
    objections: z.array(z.string()).nullable().optional(),
    // Questionnaire — required
    decision_maker_present: z.boolean().nullable().optional(),
    decisionMakerPresent: z.boolean().nullable().optional(),
    demo_shown: z.boolean().nullable().optional(),
    demoShown: z.boolean().nullable().optional(),
    interest_level: z.enum(["cold", "warm", "hot"]).nullable().optional(),
    interestLevel: z.enum(["cold", "warm", "hot"]).nullable().optional(),
    // Questionnaire — conditional
    demo_reaction: z.enum(["loved", "liked", "neutral", "unimpressed"]).nullable().optional(),
    demoReaction: z.enum(["loved", "liked", "neutral", "unimpressed"]).nullable().optional(),
    agreed_price: z.number().nullable().optional(),
    agreedPrice: z.number().nullable().optional(),
    payment_method: z.enum(["paid_now", "will_pay_followup"]).nullable().optional(),
    paymentMethod: z.enum(["paid_now", "will_pay_followup"]).nullable().optional(),
    best_followup_time: z.enum(["tomorrow", "this_week", "next_week", "next_month"]).nullable().optional(),
    bestFollowupTime: z.enum(["tomorrow", "this_week", "next_week", "next_month"]).nullable().optional(),
    agreed_next_step: z.enum(["sp_will_call", "customer_will_call", "sent_link", "scheduled_meeting"]).nullable().optional(),
    agreedNextStep: z.enum(["sp_will_call", "customer_will_call", "sent_link", "scheduled_meeting"]).nullable().optional(),
    // Questionnaire — optional gold
    gut_feel_close_pct: z.number().int().min(0).max(100).nullable().optional(),
    gutFeelClosePct: z.number().int().min(0).max(100).nullable().optional(),
    first_response_phrase: z.string().nullable().optional(),
    firstResponsePhrase: z.string().nullable().optional(),
    competitor_mentioned: z.string().nullable().optional(),
    competitorMentioned: z.string().nullable().optional(),
    // Auto-captured location
    gps_lat: z.number().nullable().optional(),
    gpsLat: z.number().nullable().optional(),
    gps_lng: z.number().nullable().optional(),
    gpsLng: z.number().nullable().optional(),
  })
  .passthrough();

type Record = z.infer<typeof PitchRecord>;

// ─── Helpers ─────────────────────────────────────────────────────────────

function pickString<T extends string>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) if (v != null) return v;
  return null;
}

function pickBool(...vals: Array<boolean | null | undefined>): boolean | null {
  for (const v of vals) if (typeof v === "boolean") return v;
  return null;
}

function pickNumber(...vals: Array<number | null | undefined>): number | null {
  for (const v of vals) if (typeof v === "number") return v;
  return null;
}

function pickBusinessName(r: Record): string | null {
  return pickString(r.business_name, r.businessName);
}

function pickPitchDate(r: Record): Date {
  const raw = r.date ?? r.created_at;
  if (!raw) return new Date();
  return raw instanceof Date ? raw : new Date(raw);
}

// Map free-form outcome strings to a PitchOutcome enum value. Accepts
// both legacy names ("closed", "won", "sale") and richer questionnaire
// outcomes ("closed_now", "closed_followup", "not_pitched").
function normaliseOutcome(value: string): PitchOutcome {
  const v = value.trim().toLowerCase().replace(/[\s-]/g, "_");
  if (v === "closed_now" || v === "closed" || v === "won" || v === "sale") return "closed_now";
  if (v === "closed_followup") return "closed_followup";
  if (v === "rejected" || v === "lost" || v === "no") return "rejected";
  if (v === "not_pitched") return "not_pitched";
  return "follow_up";
}

// Quality flag is computed server-side from the inbound record so the
// rules live in one place. Dissertation queries scope to qualityFlag=ok;
// operational queries see everything. Rules:
//   - consentToRecord must be true
//   - pitchDuration must be >= 30 seconds (drive-by check)
//   - pitchDuration is omitted only for not_pitched outcomes — those are
//     auto-flagged excluded for research purposes
function deriveQualityFlag(args: {
  consentToRecord: boolean;
  pitchDuration: number | null;
  outcome: PitchOutcome;
}): "ok" | "excluded" {
  if (!args.consentToRecord) return "excluded";
  if (args.outcome === "not_pitched") return "excluded";
  if (args.pitchDuration != null && args.pitchDuration < 30) return "excluded";
  return "ok";
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const candidate = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

// ─── Route ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("x-supabase-signature") ?? req.headers.get("x-signature");

  const allowUnsigned =
    process.env.NODE_ENV !== "production" &&
    process.env.NERVE_WEBHOOK_ALLOW_UNSIGNED === "true";

  if (!allowUnsigned && !verifySignature(rawBody, sig)) {
    await logIngestion("/api/ingest/pitch", "failed", "invalid signature", rawBody);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Accept either Supabase envelope or a flat record from mobile-api.
  let record: Record;
  let parsedShape: "envelope" | "flat" = "envelope";
  try {
    const json = JSON.parse(rawBody);
    if (json && typeof json === "object" && "type" in json && "record" in json) {
      const env = SupabaseEnvelope.parse(json);
      if (env.type !== "INSERT" || !env.record) {
        await logIngestion("/api/ingest/pitch", "ok", `ignored ${env.type}`, rawBody);
        return NextResponse.json({ ignored: true });
      }
      record = PitchRecord.parse(env.record);
    } else {
      parsedShape = "flat";
      record = PitchRecord.parse(json);
    }
  } catch (e) {
    await logIngestion("/api/ingest/pitch", "failed", `bad body: ${msg(e)}`, rawBody);
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const businessName = pickBusinessName(record);
  if (!businessName) {
    await logIngestion("/api/ingest/pitch", "failed", "missing business_name", rawBody);
    return NextResponse.json({ error: "missing business_name" }, { status: 400 });
  }

  const pitchDate = pickPitchDate(record);
  const outcome = normaliseOutcome(record.outcome);
  const supabasePitchId = record.id != null ? String(record.id) : null;

  const businessType = pickString(record.business_type, record.businessType);
  const leadSource = pickString(record.lead_source, record.leadSource);
  const demoVersion = pickString(record.demo_version, record.demoVersion);
  const contractorId = pickString(record.contractor_id, record.contractorId);
  const pitchDuration = pickNumber(record.pitch_duration, record.pitchDuration);
  const pitchAttemptNumber = pickNumber(record.pitch_attempt_number, record.pitchAttemptNumber) ?? 1;

  const consentToRecord =
    pickBool(record.consent_to_record, record.consentToRecord) ?? false;
  const decisionMakerPresent = pickBool(record.decision_maker_present, record.decisionMakerPresent);
  const demoShown = pickBool(record.demo_shown, record.demoShown);
  const interestLevel = pickString(record.interest_level, record.interestLevel) as InterestLevel | null;
  const demoReaction = pickString(record.demo_reaction, record.demoReaction) as DemoReaction | null;
  const agreedPrice = pickNumber(record.agreed_price, record.agreedPrice);
  const paymentMethod = pickString(record.payment_method, record.paymentMethod) as PaymentMethod | null;
  const bestFollowupTime = pickString(record.best_followup_time, record.bestFollowupTime) as FollowupTime | null;
  const agreedNextStep = pickString(record.agreed_next_step, record.agreedNextStep) as AgreedNextStep | null;
  const gutFeelClosePct = pickNumber(record.gut_feel_close_pct, record.gutFeelClosePct);
  const firstResponsePhrase = pickString(record.first_response_phrase, record.firstResponsePhrase);
  const competitorMentioned = pickString(record.competitor_mentioned, record.competitorMentioned);
  const gpsLat = pickNumber(record.gps_lat, record.gpsLat);
  const gpsLng = pickNumber(record.gps_lng, record.gpsLng);

  const consentFlag =
    pickBool(record.consent_flag, record.consent) ?? consentToRecord;

  const qualityFlag = deriveQualityFlag({
    consentToRecord,
    pitchDuration,
    outcome,
  });

  try {
    const phaseLabel = await phaseLabelFor(pitchDate);
    const pitch = await prisma.pitchLog.upsert({
      where: { supabasePitchId: supabasePitchId ?? "__never__" },
      create: {
        date: pitchDate,
        businessName,
        businessType,
        sector: record.sector ?? null,
        location: record.location ?? null,
        leadSource,
        demoVersion,
        outcome,
        contractorId,
        pitchDuration,
        pitchAttemptNumber,
        decisionMakerPresent,
        demoShown,
        interestLevel,
        consentToRecord,
        demoReaction,
        agreedPrice: agreedPrice != null ? agreedPrice : null,
        paymentMethod,
        bestFollowupTime,
        agreedNextStep,
        gutFeelClosePct,
        firstResponsePhrase,
        competitorMentioned,
        gpsLat,
        gpsLng,
        qualityFlag,
        consentFlag,
        notes: record.notes ?? null,
        supabasePitchId,
        source: parsedShape === "flat" ? "mobile-api" : "webhook",
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
          businessType,
          outcome,
          contractorId,
          leadSource,
          demoVersion,
          interestLevel,
          decisionMakerPresent,
          demoShown,
          qualityFlag,
          tags: record.objections ?? [],
        },
      },
      {
        businessName,
        businessType,
        sector: record.sector ?? null,
        location: record.location ?? null,
        leadSource,
        demoVersion,
        outcome,
        objections: (record.objections ?? []).join(", "),
        notes: record.notes ?? null,
        firstResponsePhrase,
        competitorMentioned,
        interestLevel,
        decisionMakerPresent: decisionMakerPresent == null ? null : String(decisionMakerPresent),
        demoShown: demoShown == null ? null : String(demoShown),
        demoReaction,
        date: pitchDate,
      },
    );

    // Fan out to the runtime so the outcome lands on the matching decision.
    // Fire-and-forget — failures here must never break the pitch ingest.
    void postOutcomeToRuntime(
      buildOutcomePayload({
        pitchId: pitch.id,
        outcome,
        businessName,
        agreedPrice,
        interestLevel,
        demoReaction,
        objections: record.objections ?? null,
        notes: record.notes ?? null,
        pitchDate,
      }),
    ).catch((e) => console.warn("[pitch] outcome fan-out failed", String(e)));

    await logIngestion("/api/ingest/pitch", "ok", null, rawBody);
    return NextResponse.json({ ok: true, pitchId: pitch.id, qualityFlag });
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
    // Logging best-effort; don't shadow the upstream error.
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function buildOutcomePayload(args: {
  pitchId: string;
  outcome: PitchOutcome;
  businessName: string;
  agreedPrice: number | null;
  interestLevel: InterestLevel | null;
  demoReaction: DemoReaction | null;
  objections: string[] | null;
  notes: string | null;
  pitchDate: Date;
}): OutcomeIngestPayload {
  let outcomeType: OutcomeIngestPayload["outcome_type"];
  let result: OutcomeIngestPayload["result"];
  switch (args.outcome) {
    case "closed_now":
    case "closed_followup":
      outcomeType = "pitch_closed";
      result = "positive";
      break;
    case "rejected":
      outcomeType = "pitch_rejected";
      result = "negative";
      break;
    case "not_pitched":
      outcomeType = "no_outcome";
      result = "neutral";
      break;
    default:
      outcomeType = "pitch_followup";
      result = "neutral";
  }
  return {
    source: "nerve_webhook",
    external_id: args.pitchId,
    business_name: args.businessName,
    outcome_type: outcomeType,
    result,
    agreed_price_gbp: args.agreedPrice ?? undefined,
    interest_level: (args.interestLevel ?? undefined) as OutcomeIngestPayload["interest_level"],
    demo_reaction: (args.demoReaction ?? undefined) as OutcomeIngestPayload["demo_reaction"],
    objections: args.objections ?? undefined,
    notes: args.notes ?? undefined,
    occurred_at: args.pitchDate.toISOString(),
    pitch_log_id: args.pitchId,
  };
}
