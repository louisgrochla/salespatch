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
  description: z.string().min(1),
  version: z.string().min(1),
  performanceNotes: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});

function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.pipelineDoc.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    { sourceType: "PipelineDoc", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "product", contentType: "pipeline", name: r.name, version: r.version } },
    { name: r.name, description: r.description, version: r.version, performanceNotes: r.performanceNotes },
  );
}
export async function createPipeline(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.pipelineDoc.create({ data: { ...i, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/product/pipelines");
  redirect(`/product/pipelines/${row.id}`);
}
export async function updatePipeline(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  await prisma.pipelineDoc.update({ where: { id }, data: i });
  await reembed(id);
  revalidatePath("/product/pipelines"); revalidatePath(`/product/pipelines/${id}`);
  redirect(`/product/pipelines/${id}`);
}
export async function deletePipeline(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "PipelineDoc", sourceId: id } });
  await prisma.pipelineDoc.delete({ where: { id } });
  revalidatePath("/product/pipelines");
  redirect("/product/pipelines");
}
