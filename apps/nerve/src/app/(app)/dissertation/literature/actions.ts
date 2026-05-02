"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  title: z.string().min(1),
  authors: z.string().min(1),
  year: z.string().optional().transform((v) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  }),
  url: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  doi: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  abstract: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  themeTags: z.string().optional().transform((v) => {
    if (!v) return [] as string[];
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }),
  personalNotes: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  position: z.string().optional().transform((v) => {
    if (v === "supports" || v === "challenges" || v === "contextualises") return v;
    return null;
  }),
});

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function reembed(id: string) {
  const r = await prisma.literatureEntry.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "LiteratureEntry",
      sourceId: r.id,
      phaseLabel: r.phaseLabel,
      metadata: {
        section: "research",
        contentType: "literature",
        themeTags: r.themeTags,
        position: r.position,
        year: r.year,
      },
    },
    {
      title: r.title,
      authors: r.authors,
      year: r.year,
      doi: r.doi,
      url: r.url,
      abstract: r.abstract,
      personalNotes: r.personalNotes,
      themeTags: r.themeTags.join(", "),
      position: r.position,
    },
  );
}

export async function createLiterature(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.literatureEntry.create({
    data: { ...input, phaseLabel },
  });
  await reembed(row.id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/literature");
  redirect(`/dissertation/literature/${row.id}`);
}

export async function updateLiterature(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  await prisma.literatureEntry.update({ where: { id }, data: input });
  await reembed(id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/literature");
  revalidatePath(`/dissertation/literature/${id}`);
  redirect(`/dissertation/literature/${id}`);
}

export async function deleteLiterature(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "LiteratureEntry", sourceId: id },
  });
  await prisma.literatureEntry.delete({ where: { id } });
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/literature");
  redirect("/dissertation/literature");
}
