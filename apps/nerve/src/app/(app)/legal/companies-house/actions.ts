"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  filingType: z.string().min(1),
  description: z.string().min(1),
  date: z.string().min(1),
  reference: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});
function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.companiesHouseRecord.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    { sourceType: "CompaniesHouseRecord", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "legal", contentType: "companies_house", filingType: r.filingType } },
    { filingType: r.filingType, description: r.description, date: r.date, reference: r.reference },
  );
}
export async function createCH(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.companiesHouseRecord.create({ data: { ...i, date, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/legal"); revalidatePath("/legal/companies-house");
  redirect(`/legal/companies-house/${row.id}`);
}
export async function updateCH(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.companiesHouseRecord.update({ where: { id }, data: { ...i, date, phaseLabel } });
  await reembed(id);
  revalidatePath("/legal/companies-house"); revalidatePath(`/legal/companies-house/${id}`);
  redirect(`/legal/companies-house/${id}`);
}
export async function deleteCH(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "CompaniesHouseRecord", sourceId: id } });
  await prisma.companiesHouseRecord.delete({ where: { id } });
  revalidatePath("/legal"); revalidatePath("/legal/companies-house");
  redirect("/legal/companies-house");
}
