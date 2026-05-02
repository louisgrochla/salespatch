"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  businessName: z.string().min(1),
  sector: z.string().optional().transform(emptyToNull),
  url: z.string().optional().transform(emptyToNull),
  fileReference: z.string().optional().transform(emptyToNull),
  dateBuilt: z.string().min(1),
  templateVersion: z.string().optional().transform(emptyToNull),
  conversionOutcome: z.string().optional().transform(emptyToNull),
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
  const r = await prisma.demoRecord.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "DemoRecord", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "demos", contentType: "demo", templateVersion: r.templateVersion, sector: r.sector },
    },
    {
      businessName: r.businessName, sector: r.sector, url: r.url,
      dateBuilt: r.dateBuilt, templateVersion: r.templateVersion,
      conversionOutcome: r.conversionOutcome, notes: r.notes,
    },
  );
}

export async function createDemo(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const dateBuilt = new Date(i.dateBuilt);
  const phaseLabel = await phaseLabelFor(dateBuilt);
  const row = await prisma.demoRecord.create({
    data: { ...i, dateBuilt, phaseLabel },
  });
  await reembed(row.id);
  revalidatePath("/demos"); revalidatePath("/dashboard");
  redirect(`/demos/${row.id}`);
}

export async function updateDemo(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const dateBuilt = new Date(i.dateBuilt);
  const phaseLabel = await phaseLabelFor(dateBuilt);
  await prisma.demoRecord.update({ where: { id }, data: { ...i, dateBuilt, phaseLabel } });
  await reembed(id);
  revalidatePath("/demos"); revalidatePath(`/demos/${id}`); revalidatePath("/dashboard");
  redirect(`/demos/${id}`);
}

export async function deleteDemo(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "DemoRecord", sourceId: id } });
  await prisma.demoRecord.delete({ where: { id } });
  revalidatePath("/demos"); revalidatePath("/dashboard");
  redirect("/demos");
}
