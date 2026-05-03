"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  dataType: z.string().min(1),
  collectionMethod: z.string().min(1),
  retentionPeriod: z.string().min(1),
  legalBasis: z.string().min(1),
});
function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.gdprRecord.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    { sourceType: "GdprRecord", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "legal", contentType: "gdpr", dataType: r.dataType } },
    { dataType: r.dataType, collectionMethod: r.collectionMethod, retentionPeriod: r.retentionPeriod, legalBasis: r.legalBasis },
  );
}
export async function createGdpr(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.gdprRecord.create({ data: { ...i, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/legal"); revalidatePath("/legal/gdpr");
  redirect(`/legal/gdpr/${row.id}`);
}
export async function updateGdpr(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  await prisma.gdprRecord.update({ where: { id }, data: i });
  await reembed(id);
  revalidatePath("/legal/gdpr"); revalidatePath(`/legal/gdpr/${id}`);
  redirect(`/legal/gdpr/${id}`);
}
export async function deleteGdpr(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "GdprRecord", sourceId: id } });
  await prisma.gdprRecord.delete({ where: { id } });
  revalidatePath("/legal"); revalidatePath("/legal/gdpr");
  redirect("/legal/gdpr");
}
