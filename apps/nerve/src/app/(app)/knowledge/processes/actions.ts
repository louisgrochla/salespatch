"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  name: z.string().min(1),
  steps: z.string().min(1),
});

function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.processGuide.findUniqueOrThrow({ where: { id } });
  await embedText(
    { sourceType: "ProcessGuide", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "knowledge", contentType: "process", name: r.name } },
    `Process: ${r.name}\n\n${r.steps}`,
  );
}
export async function createProcess(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const lastUpdated = new Date();
  const phaseLabel = await phaseLabelFor(lastUpdated);
  const row = await prisma.processGuide.create({ data: { ...i, lastUpdated, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/knowledge"); revalidatePath("/knowledge/processes");
  redirect(`/knowledge/processes/${row.id}`);
}
export async function updateProcess(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  await prisma.processGuide.update({ where: { id }, data: { ...i, lastUpdated: new Date() } });
  await reembed(id);
  revalidatePath("/knowledge/processes"); revalidatePath(`/knowledge/processes/${id}`);
  redirect(`/knowledge/processes/${id}`);
}
export async function deleteProcess(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "ProcessGuide", sourceId: id } });
  await prisma.processGuide.delete({ where: { id } });
  revalidatePath("/knowledge"); revalidatePath("/knowledge/processes");
  redirect("/knowledge/processes");
}
