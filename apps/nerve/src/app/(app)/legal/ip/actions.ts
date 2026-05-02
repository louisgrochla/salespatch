"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  date: z.string().min(1),
  reference: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});
function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}
async function reembed(id: string) {
  const r = await prisma.ipDocument.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    { sourceType: "IpDocument", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "legal", contentType: "ip", type: r.type } },
    { type: r.type, title: r.title, description: r.description, date: r.date, reference: r.reference },
  );
}
export async function createIp(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.ipDocument.create({ data: { ...i, date, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/legal"); revalidatePath("/legal/ip");
  redirect(`/legal/ip/${row.id}`);
}
export async function updateIp(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.ipDocument.update({ where: { id }, data: { ...i, date, phaseLabel } });
  await reembed(id);
  revalidatePath("/legal/ip"); revalidatePath(`/legal/ip/${id}`);
  redirect(`/legal/ip/${id}`);
}
export async function deleteIp(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "IpDocument", sourceId: id } });
  await prisma.ipDocument.delete({ where: { id } });
  revalidatePath("/legal"); revalidatePath("/legal/ip");
  redirect("/legal/ip");
}
