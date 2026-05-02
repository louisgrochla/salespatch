"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  date: z.string().min(1),
  version: z.string().min(1),
  whatChanged: z.string().min(1),
  why: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});

function fd<S extends z.ZodTypeAny>(d: FormData, s: S): z.infer<S> {
  const o: Record<string, string> = {};
  for (const [k, v] of d.entries()) if (typeof v === "string") o[k] = v;
  return s.parse(o);
}

async function reembed(id: string) {
  const r = await prisma.systemChangelog.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    { sourceType: "SystemChangelog", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "product", contentType: "changelog", version: r.version, date: r.date.toISOString() } },
    { date: r.date, version: r.version, whatChanged: r.whatChanged, why: r.why },
  );
}

export async function createChangelog(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.systemChangelog.create({ data: { ...i, date, phaseLabel } });
  await reembed(row.id);
  revalidatePath("/product/changelog");
  redirect(`/product/changelog/${row.id}`);
}
export async function updateChangelog(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.systemChangelog.update({ where: { id }, data: { ...i, date, phaseLabel } });
  await reembed(id);
  revalidatePath("/product/changelog"); revalidatePath(`/product/changelog/${id}`);
  redirect(`/product/changelog/${id}`);
}
export async function deleteChangelog(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "SystemChangelog", sourceId: id } });
  await prisma.systemChangelog.delete({ where: { id } });
  revalidatePath("/product/changelog");
  redirect("/product/changelog");
}
