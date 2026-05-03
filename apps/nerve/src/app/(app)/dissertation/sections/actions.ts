"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { countWords } from "@/lib/words";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  chapter: z.string().min(1),
  content: z.string().default(""),
  status: z.enum(["not_started", "draft", "in_progress", "complete"]),
  wordCountTarget: z.string().optional().transform((v) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }),
  supervisorFeedback: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  literatureIds: z.string().optional().transform((v) => {
    if (!v) return [] as string[];
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }),
});

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) {
    if (typeof v === "string") {
      // Multi-checkboxes share a name — concatenate.
      if (k === "literatureIds") {
        obj[k] = obj[k] ? obj[k] + "," + v : v;
      } else {
        obj[k] = v;
      }
    }
  }
  return schema.parse(obj);
}

async function syncLiterature(sectionId: string, literatureIds: string[]) {
  await prisma.dissertationSectionLiterature.deleteMany({ where: { sectionId } });
  for (const id of literatureIds) {
    await prisma.dissertationSectionLiterature.create({
      data: { sectionId, literatureId: id },
    });
  }
}

async function reembed(id: string) {
  const r = await prisma.dissertationSection.findUniqueOrThrow({ where: { id } });
  await embedText(
    {
      sourceType: "DissertationSection",
      sourceId: r.id,
      phaseLabel: r.phaseLabel,
      metadata: {
        section: "research",
        contentType: "dissertation_section",
        chapter: r.chapter,
        status: r.status,
        wordCount: r.wordCount,
      },
    },
    `Chapter: ${r.chapter}\n\n${r.content}`,
  );
}

export async function createSection(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const wordCount = countWords(input.content);

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.dissertationSection.create({
      data: {
        chapter: input.chapter,
        content: input.content,
        status: input.status,
        wordCountTarget: input.wordCountTarget,
        wordCount,
        supervisorFeedback: input.supervisorFeedback,
        phaseLabel,
      },
    });
    await tx.dissertationSectionVersion.create({
      data: { sectionId: created.id, content: input.content, wordCount },
    });
    return created;
  });

  await syncLiterature(row.id, input.literatureIds);
  await reembed(row.id);

  revalidatePath("/dissertation");
  revalidatePath("/dissertation/sections");
  redirect(`/dissertation/sections/${row.id}`);
}

export async function updateSection(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const wordCount = countWords(input.content);

  await prisma.$transaction(async (tx) => {
    const before = await tx.dissertationSection.findUniqueOrThrow({ where: { id } });
    await tx.dissertationSection.update({
      where: { id },
      data: {
        chapter: input.chapter,
        content: input.content,
        status: input.status,
        wordCountTarget: input.wordCountTarget,
        wordCount,
        supervisorFeedback: input.supervisorFeedback,
      },
    });
    if (before.content !== input.content) {
      await tx.dissertationSectionVersion.create({
        data: { sectionId: id, content: input.content, wordCount },
      });
    }
  });

  await syncLiterature(id, input.literatureIds);
  await reembed(id);

  revalidatePath("/dissertation");
  revalidatePath("/dissertation/sections");
  revalidatePath(`/dissertation/sections/${id}`);
  redirect(`/dissertation/sections/${id}`);
}

export async function deleteSection(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "DissertationSection", sourceId: id },
  });
  await prisma.dissertationSection.delete({ where: { id } });
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/sections");
  redirect("/dissertation/sections");
}
