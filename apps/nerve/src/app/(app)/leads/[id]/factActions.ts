"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";
import { businessFactStore } from "@/lib/sl-mas/businessFactStore";

// R4: inline add/delete actions for BusinessFact rows. The HMAC ingest
// endpoint at /api/ingest/business-fact is the producer-facing entry; this
// file is the operator UI entry — same store underneath, same auto-embed
// path so chunks land in the RAG vault regardless of where the fact came
// from.

const KEY_PATTERN = /^[a-z0-9_]+$/;

const AddInput = z.object({
  key: z
    .string()
    .min(1)
    .max(120)
    .transform((v) => v.trim().toLowerCase())
    .refine((v) => KEY_PATTERN.test(v), {
      message: "key must be lowercase letters, digits, underscores only",
    }),
  value: z
    .string()
    .min(1)
    .max(4000)
    .transform((v) => v.trim()),
  source: z.enum(["manual", "scraped", "agent", "conversation"]).default("manual"),
  confidence: z.string().optional(),
});

function readField(data: FormData, name: string): string {
  const v = data.get(name);
  return typeof v === "string" ? v : "";
}

export async function addFact(leadSlug: string, formData: FormData) {
  const session = await requireSession();
  const parsed = AddInput.parse({
    key: readField(formData, "key"),
    value: readField(formData, "value"),
    source: readField(formData, "source") || "manual",
    confidence: readField(formData, "confidence") || undefined,
  });

  // Confidence is optional. Empty string → null. Anything else must be
  // parseable as a 0..1 number; outside that range we silently drop it
  // rather than throwing, since the field is non-load-bearing.
  let confidence: number | null = null;
  if (parsed.confidence) {
    const n = Number(parsed.confidence);
    if (Number.isFinite(n) && n >= 0 && n <= 1) confidence = n;
  }

  const phaseLabel = await phaseLabelFor(new Date());

  const result = await businessFactStore.ingest({
    lead_slug: leadSlug,
    key: parsed.key,
    value: parsed.value,
    source: parsed.source,
    confidence,
    created_by: session.user.email ?? null,
    phase_label: phaseLabel,
  });

  // Auto-embed so /search, /ask, and the per-lead scoped chat pick the
  // new fact up on the next query. Idempotent — embedRecord deletes any
  // prior chunks for this (sourceType, sourceId) before inserting.
  await embedRecord(
    {
      sourceType: "BusinessFact",
      sourceId: result.id,
      phaseLabel,
      metadata: {
        section: "business-facts",
        leadSlug,
        key: parsed.key,
        source: parsed.source,
      },
    },
    {
      key: parsed.key,
      value: parsed.value,
      source: parsed.source,
      leadSlug,
    },
  );

  revalidatePath(`/leads/${leadSlug}`);
}

export async function deleteFact(leadSlug: string, factId: string) {
  await requireSession();
  // Drop any embedding chunks first so the RAG vault doesn't cite a
  // fact that no longer exists.
  await prisma.embedding.deleteMany({
    where: { sourceType: "BusinessFact", sourceId: factId },
  });
  await businessFactStore.deleteById(factId);
  revalidatePath(`/leads/${leadSlug}`);
}
