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
  version: z.string().min(1),
  date: z.string().min(1),
  tags: z.string().optional().transform((v) => {
    if (!v) return [] as string[];
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }),
});

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function reembed(id: string) {
  const r = await prisma.architectureDocument.findUniqueOrThrow({ where: { id } });
  await embedText(
    {
      sourceType: "ArchitectureDocument", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "product", contentType: "architecture", version: r.version, tags: r.tags },
    },
    `${r.title} (v${r.version})\n\n${r.body}`,
  );
}

export async function createArchitecture(formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.architectureDocument.create({
    data: { ...i, date, phaseLabel },
  });
  await reembed(row.id);
  revalidatePath("/product/architecture");
  redirect(`/product/architecture/${row.id}`);
}

export async function updateArchitecture(id: string, formData: FormData) {
  await requireSession();
  const i = fd(formData, Input);
  const date = new Date(i.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.architectureDocument.update({ where: { id }, data: { ...i, date, phaseLabel } });
  await reembed(id);
  revalidatePath("/product/architecture"); revalidatePath(`/product/architecture/${id}`);
  redirect(`/product/architecture/${id}`);
}

export async function deleteArchitecture(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "ArchitectureDocument", sourceId: id } });
  await prisma.architectureDocument.delete({ where: { id } });
  revalidatePath("/product/architecture");
  redirect("/product/architecture");
}
