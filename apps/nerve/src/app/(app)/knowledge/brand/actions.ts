"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.brandDocument.findUniqueOrThrow({ where: { id } });
  await embedText(
    { sourceType: "BrandDocument", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "knowledge", contentType: "brand", title: r.title } },
    `${r.title}\n\n${r.body}`,
  );
}
export async function createBrand(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.brandDocument.create({ data: { ...i, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/knowledge"); revalidatePath("/knowledge/brand");
  redirect(`/knowledge/brand/${row.id}`);
}
export async function updateBrand(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  await prisma.brandDocument.update({ where: { id }, data: i });
  await reembed(id);
  revalidatePath("/knowledge/brand"); revalidatePath(`/knowledge/brand/${id}`);
  redirect(`/knowledge/brand/${id}`);
}
export async function deleteBrand(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "BrandDocument", sourceId: id } });
  await prisma.brandDocument.delete({ where: { id } });
  revalidatePath("/knowledge"); revalidatePath("/knowledge/brand");
  redirect("/knowledge/brand");
}
