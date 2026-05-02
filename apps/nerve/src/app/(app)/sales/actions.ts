"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const PitchInput = z.object({
  date: z.string().min(1, "date required"),
  businessName: z.string().min(1, "business name required"),
  businessType: z.string().optional().transform(emptyToNull),
  sector: z.string().optional().transform(emptyToNull),
  location: z.string().optional().transform(emptyToNull),
  leadSource: z.string().optional().transform(emptyToNull),
  demoVersion: z.string().optional().transform(emptyToNull),
  outcome: z.enum(["closed", "rejected", "follow_up"]),
  contractorId: z.string().optional().transform(emptyToNull),
  pitchDuration: z.string().optional().transform((v) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }),
  consentFlag: z.union([z.literal("on"), z.literal("true"), z.string()]).optional().transform(
    (v) => v === "on" || v === "true",
  ),
  notes: z.string().optional().transform(emptyToNull),
  objections: z.string().optional().transform((v) => {
    if (!v) return [] as string[];
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }),
});

function emptyToNull(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function syncObjections(pitchId: string, names: string[]) {
  // Detach existing then attach the new set — simpler than diffing.
  await prisma.pitchObjection.deleteMany({ where: { pitchId } });
  const cleaned = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  for (const name of cleaned) {
    const tag = await prisma.objectionTag.upsert({
      where: { name }, create: { name }, update: {},
    });
    await prisma.pitchObjection.create({
      data: { pitchId, objectionId: tag.id },
    });
  }
  return cleaned;
}

async function reembedPitch(pitchId: string) {
  const p = await prisma.pitchLog.findUniqueOrThrow({
    where: { id: pitchId },
    include: { objections: { include: { objection: true } } },
  });
  await embedRecord(
    {
      sourceType: "PitchLog",
      sourceId: p.id,
      phaseLabel: p.phaseLabel,
      metadata: {
        section: "sales",
        contentType: "pitch",
        date: p.date.toISOString(),
        sector: p.sector,
        businessType: p.businessType,
        outcome: p.outcome,
        contractorId: p.contractorId,
        leadSource: p.leadSource,
        demoVersion: p.demoVersion,
        tags: p.objections.map((o) => o.objection.name),
      },
    },
    {
      businessName: p.businessName,
      businessType: p.businessType,
      sector: p.sector,
      location: p.location,
      leadSource: p.leadSource,
      demoVersion: p.demoVersion,
      outcome: p.outcome,
      objections: p.objections.map((o) => o.objection.name).join(", "),
      notes: p.notes,
      date: p.date,
    },
  );
}

export async function createPitch(formData: FormData) {
  await requireSession();
  const input = fd(formData, PitchInput);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);

  const pitch = await prisma.pitchLog.create({
    data: {
      date,
      businessName: input.businessName,
      businessType: input.businessType,
      sector: input.sector,
      location: input.location,
      leadSource: input.leadSource,
      demoVersion: input.demoVersion,
      outcome: input.outcome,
      contractorId: input.contractorId,
      pitchDuration: input.pitchDuration,
      consentFlag: input.consentFlag,
      notes: input.notes,
      source: "manual",
      phaseLabel,
    },
  });

  await syncObjections(pitch.id, input.objections);
  await reembedPitch(pitch.id);

  revalidatePath("/sales");
  revalidatePath("/dashboard");
  redirect(`/sales/${pitch.id}`);
}

export async function updatePitch(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, PitchInput);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);

  await prisma.pitchLog.update({
    where: { id },
    data: {
      date,
      businessName: input.businessName,
      businessType: input.businessType,
      sector: input.sector,
      location: input.location,
      leadSource: input.leadSource,
      demoVersion: input.demoVersion,
      outcome: input.outcome,
      contractorId: input.contractorId,
      pitchDuration: input.pitchDuration,
      consentFlag: input.consentFlag,
      notes: input.notes,
      phaseLabel,
    },
  });

  await syncObjections(id, input.objections);
  await reembedPitch(id);

  revalidatePath("/sales");
  revalidatePath(`/sales/${id}`);
  revalidatePath("/dashboard");
  redirect(`/sales/${id}`);
}

export async function deletePitch(id: string) {
  await requireSession();
  // Cascade deletes the PitchObjection rows. Embeddings are polymorphic
  // with no FK — clear them manually.
  await prisma.embedding.deleteMany({
    where: { sourceType: "PitchLog", sourceId: id },
  });
  await prisma.pitchLog.delete({ where: { id } });

  revalidatePath("/sales");
  revalidatePath("/dashboard");
  redirect("/sales");
}
