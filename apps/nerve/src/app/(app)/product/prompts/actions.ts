"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  name: z.string().min(1),
  fullText: z.string().min(1),
  model: z.string().min(1),
  performanceNotes: z.string().optional().transform(emptyToNull),
  tags: z.string().optional().transform((v) => {
    if (!v) return [] as string[];
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }),
});

function emptyToNull(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function reembed(id: string) {
  const r = await prisma.promptLibraryEntry.findUniqueOrThrow({ where: { id } });
  await embedText(
    {
      sourceType: "PromptLibraryEntry", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: {
        section: "product", contentType: "prompt",
        promptName: r.name, model: r.model, version: r.versionNumber, tags: r.tags,
      },
    },
    `Prompt: ${r.name}\nModel: ${r.model}\nVersion: ${r.versionNumber}\n\n${r.fullText}`,
  );
}

export async function createPrompt(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.promptLibraryEntry.create({
      data: {
        name: input.name,
        fullText: input.fullText,
        model: input.model,
        versionNumber: 1,
        performanceNotes: input.performanceNotes,
        tags: input.tags,
        phaseLabel,
      },
    });
    await tx.promptVersion.create({
      data: {
        promptId: created.id,
        fullText: input.fullText,
        model: input.model,
        versionNumber: 1,
        performanceNotes: input.performanceNotes,
      },
    });
    return created;
  });

  await reembed(row.id);
  revalidatePath("/product");
  revalidatePath("/product/prompts");
  redirect(`/product/prompts/${row.id}`);
}

export async function updatePrompt(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);

  await prisma.$transaction(async (tx) => {
    const before = await tx.promptLibraryEntry.findUniqueOrThrow({ where: { id } });
    // Append a new version when the prompt body or model changes.
    // Performance notes alone don't bump the version; they're metadata
    // about the current version.
    const bodyChanged = before.fullText !== input.fullText || before.model !== input.model;
    const nextVersion = bodyChanged ? before.versionNumber + 1 : before.versionNumber;

    await tx.promptLibraryEntry.update({
      where: { id },
      data: {
        // Name is the unique key — we deliberately don't allow renames here
        // to avoid cuids drifting underneath references; rename via the
        // schema if it ever matters.
        fullText: input.fullText,
        model: input.model,
        versionNumber: nextVersion,
        performanceNotes: input.performanceNotes,
        tags: input.tags,
      },
    });

    if (bodyChanged) {
      await tx.promptVersion.create({
        data: {
          promptId: id,
          fullText: input.fullText,
          model: input.model,
          versionNumber: nextVersion,
          performanceNotes: input.performanceNotes,
        },
      });
    }
  });

  await reembed(id);
  revalidatePath("/product");
  revalidatePath("/product/prompts");
  revalidatePath(`/product/prompts/${id}`);
  redirect(`/product/prompts/${id}`);
}

export async function deletePrompt(id: string) {
  await requireSession();
  // Cascade deletes the PromptVersion rows. Embeddings are polymorphic.
  await prisma.embedding.deleteMany({
    where: { sourceType: "PromptLibraryEntry", sourceId: id },
  });
  await prisma.promptLibraryEntry.delete({ where: { id } });
  revalidatePath("/product");
  revalidatePath("/product/prompts");
  redirect("/product/prompts");
}
