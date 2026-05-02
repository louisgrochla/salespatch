"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  version: z.string().min(1),
  date: z.string().min(1),
  content: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  fileReference: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});

function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.legalDocument.findUniqueOrThrow({ where: { id } });
  await embedText(
    { sourceType: "LegalDocument", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "legal", contentType: "document", type: r.type, version: r.version } },
    `${r.type} · ${r.title} (v${r.version})\n\n${r.content ?? r.fileReference ?? ""}`,
  );
}
export async function createDoc(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.legalDocument.create({ data: { ...i, date, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/legal"); revalidatePath("/legal/documents");
  redirect(`/legal/documents/${row.id}`);
}
export async function updateDoc(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.legalDocument.update({ where: { id }, data: { ...i, date, phaseLabel } });
  await reembed(id);
  revalidatePath("/legal/documents"); revalidatePath(`/legal/documents/${id}`);
  redirect(`/legal/documents/${id}`);
}
export async function deleteDoc(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "LegalDocument", sourceId: id } });
  await prisma.legalDocument.delete({ where: { id } });
  revalidatePath("/legal"); revalidatePath("/legal/documents");
  redirect("/legal/documents");
}
