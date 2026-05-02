"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
  context: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});
function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.glossaryEntry.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    { sourceType: "GlossaryEntry", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "knowledge", contentType: "glossary", term: r.term } },
    { term: r.term, definition: r.definition, context: r.context },
  );
}
export async function createTerm(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.glossaryEntry.create({ data: { ...i, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/knowledge"); revalidatePath("/knowledge/glossary");
  redirect(`/knowledge/glossary/${row.id}`);
}
export async function updateTerm(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  await prisma.glossaryEntry.update({ where: { id }, data: i });
  await reembed(id);
  revalidatePath("/knowledge/glossary"); revalidatePath(`/knowledge/glossary/${id}`);
  redirect(`/knowledge/glossary/${id}`);
}
export async function deleteTerm(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "GlossaryEntry", sourceId: id } });
  await prisma.glossaryEntry.delete({ where: { id } });
  revalidatePath("/knowledge"); revalidatePath("/knowledge/glossary");
  redirect("/knowledge/glossary");
}
