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
  purpose: z.string().min(1),
  trainingDetails: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  costPerCycle: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});

function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.modelDoc.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    { sourceType: "ModelDoc", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "product", contentType: "model", name: r.name } },
    { name: r.name, purpose: r.purpose, trainingDetails: r.trainingDetails,
      costPerCycle: r.costPerCycle?.toString() ?? null },
  );
}
export async function createModel(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.modelDoc.create({ data: { ...i, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/product/models");
  redirect(`/product/models/${row.id}`);
}
export async function updateModel(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  await prisma.modelDoc.update({ where: { id }, data: i });
  await reembed(id);
  revalidatePath("/product/models"); revalidatePath(`/product/models/${id}`);
  redirect(`/product/models/${id}`);
}
export async function deleteModel(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "ModelDoc", sourceId: id } });
  await prisma.modelDoc.delete({ where: { id } });
  revalidatePath("/product/models");
  redirect("/product/models");
}
