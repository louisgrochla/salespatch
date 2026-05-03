"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  serviceName: z.string().min(1),
  purpose: z.string().min(1),
  configNotes: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  date: z.string().min(1),
});

function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}

async function reembed(id: string) {
  const r = await prisma.infrastructureNote.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    { sourceType: "InfrastructureNote", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "product", contentType: "infrastructure", serviceName: r.serviceName } },
    { serviceName: r.serviceName, purpose: r.purpose, configNotes: r.configNotes, date: r.date },
  );
}

export async function createInfra(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.infrastructureNote.create({ data: { ...i, date, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/product/infrastructure");
  redirect(`/product/infrastructure/${row.id}`);
}
export async function updateInfra(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.infrastructureNote.update({ where: { id }, data: { ...i, date, phaseLabel } });
  await reembed(id);
  revalidatePath("/product/infrastructure"); revalidatePath(`/product/infrastructure/${id}`);
  redirect(`/product/infrastructure/${id}`);
}
export async function deleteInfra(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "InfrastructureNote", sourceId: id } });
  await prisma.infrastructureNote.delete({ where: { id } });
  revalidatePath("/product/infrastructure");
  redirect("/product/infrastructure");
}
