"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  name: z.string().min(1),
  type: z.string().optional().transform(emptyToNull),
  sector: z.string().optional().transform(emptyToNull),
  location: z.string().optional().transform(emptyToNull),
  contactedStatus: z.enum(["not_contacted", "contacted", "pitched", "closed", "rejected"]).default("not_contacted"),
  sourceMethod: z.string().optional().transform(emptyToNull),
  doNotContact: z.union([z.literal("on"), z.literal("true"), z.string()]).optional().transform((v) => v === "on" || v === "true"),
  notes: z.string().optional().transform(emptyToNull),
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

async function reembed(id: string) {
  const r = await prisma.leadRecord.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "LeadRecord", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "leads", contentType: "lead", sector: r.sector, sourceMethod: r.sourceMethod },
    },
    {
      name: r.name, type: r.type, sector: r.sector, location: r.location,
      contactedStatus: r.contactedStatus, sourceMethod: r.sourceMethod,
      doNotContact: r.doNotContact, notes: r.notes,
    },
  );
}

export async function createLead(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.leadRecord.create({ data: { ...i, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/leads");
  redirect(`/leads/${row.id}`);
}

export async function updateLead(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  await prisma.leadRecord.update({ where: { id }, data: i });
  await reembed(id);
  revalidatePath("/leads"); revalidatePath(`/leads/${id}`);
  redirect(`/leads/${id}`);
}

export async function deleteLead(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "LeadRecord", sourceId: id } });
  await prisma.leadRecord.delete({ where: { id } });
  revalidatePath("/leads");
  redirect("/leads");
}
