"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  toolName: z.string().min(1),
  url: z.string().min(1),
  purpose: z.string().min(1),
  notes: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});
function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.externalResource.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    { sourceType: "ExternalResource", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "knowledge", contentType: "resource", toolName: r.toolName } },
    { toolName: r.toolName, url: r.url, purpose: r.purpose, notes: r.notes },
  );
}
export async function createResource(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.externalResource.create({ data: { ...i, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/knowledge"); revalidatePath("/knowledge/resources");
  redirect(`/knowledge/resources/${row.id}`);
}
export async function updateResource(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  await prisma.externalResource.update({ where: { id }, data: i });
  await reembed(id);
  revalidatePath("/knowledge/resources"); revalidatePath(`/knowledge/resources/${id}`);
  redirect(`/knowledge/resources/${id}`);
}
export async function deleteResource(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "ExternalResource", sourceId: id } });
  await prisma.externalResource.delete({ where: { id } });
  revalidatePath("/knowledge"); revalidatePath("/knowledge/resources");
  redirect("/knowledge/resources");
}
