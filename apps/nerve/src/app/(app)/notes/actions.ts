"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const SCOPES = ["lead", "system", "pitch", "research", "other"] as const;

const Input = z.object({
  title: z.string().min(1, "title is required").max(200),
  scope: z.enum(SCOPES),
  body: z.string().min(1, "body is required"),
  relatedSlug: z.string().optional().transform(emptyToNull),
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
  const r = await prisma.note.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "Note",
      sourceId: r.id,
      phaseLabel: r.phaseLabel,
      metadata: {
        section: "notes",
        scope: r.scope,
        relatedSlug: r.relatedSlug,
        tags: r.tags,
      },
    },
    {
      title: r.title,
      body: r.body,
      tags: r.tags.join(", "),
      relatedSlug: r.relatedSlug,
    },
  );
}

export async function createNote(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const now = new Date();
  const phaseLabel = await phaseLabelFor(now);

  const row = await prisma.note.create({
    data: {
      title: input.title,
      body: input.body,
      scope: input.scope,
      relatedSlug: input.relatedSlug,
      tags: input.tags,
      phaseLabel,
    },
  });

  await reembed(row.id);
  revalidatePath("/notes");
  revalidatePath("/dashboard");
  redirect(`/notes/${row.id}`);
}

export async function updateNote(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);

  await prisma.note.update({
    where: { id },
    data: {
      title: input.title,
      body: input.body,
      scope: input.scope,
      relatedSlug: input.relatedSlug,
      tags: input.tags,
    },
  });

  await reembed(id);
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  revalidatePath("/dashboard");
  redirect(`/notes/${id}`);
}

export async function deleteNote(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "Note", sourceId: id },
  });
  await prisma.note.delete({ where: { id } });
  revalidatePath("/notes");
  revalidatePath("/dashboard");
  redirect("/notes");
}
