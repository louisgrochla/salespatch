"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  version: z.string().min(1),
  date: z.string().min(1),
  content: z.string().min(1),
});
function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.contractorAgreementVersion.findUniqueOrThrow({ where: { id } });
  await embedText(
    { sourceType: "ContractorAgreementVersion", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "legal", contentType: "contractor_agreement", version: r.version } },
    `Contractor agreement v${r.version}\n\n${r.content}`,
  );
}
export async function createAgreement(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.contractorAgreementVersion.create({ data: { ...i, date, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/legal"); revalidatePath("/legal/contractor-agreements");
  redirect(`/legal/contractor-agreements/${row.id}`);
}
export async function updateAgreement(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.contractorAgreementVersion.update({ where: { id }, data: { ...i, date, phaseLabel } });
  await reembed(id);
  revalidatePath("/legal/contractor-agreements"); revalidatePath(`/legal/contractor-agreements/${id}`);
  redirect(`/legal/contractor-agreements/${id}`);
}
export async function deleteAgreement(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "ContractorAgreementVersion", sourceId: id } });
  await prisma.contractorAgreementVersion.delete({ where: { id } });
  revalidatePath("/legal"); revalidatePath("/legal/contractor-agreements");
  redirect("/legal/contractor-agreements");
}
