"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { requireSession } from "@/lib/auth-guard";

const NoteInput = z.object({
  retrospectiveNote: z.string().optional().transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    return t.length === 0 ? null : t;
  }),
});

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function reembed(id: string) {
  const r = await prisma.changelogEntry.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "ChangelogEntry",
      sourceId: r.id,
      phaseLabel: r.phaseLabel,
      metadata: {
        section: "changelog",
        project: r.project,
        projectType: r.projectType,
        date: r.sessionDate.toISOString(),
        tags: r.tags,
        phaseLabel: r.phaseLabel,
      },
    },
    {
      project: r.project,
      projectType: r.projectType,
      sessionSummary: r.sessionSummary,
      whatChanged: r.whatChanged,
      why: r.why,
      decisionsMade: r.decisionsMade,
      problemsEncountered: r.problemsEncountered,
      currentState: r.currentState,
      whatsNext: r.whatsNext,
      retrospectiveNote: r.retrospectiveNote,
      filesModified: r.filesModified.join("\n"),
      tags: r.tags.join(", "),
      sessionDate: r.sessionDate,
    },
  );
}

export async function updateRetrospectiveNote(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, NoteInput);
  await prisma.changelogEntry.update({
    where: { id },
    data: { retrospectiveNote: input.retrospectiveNote },
  });
  await reembed(id);
  revalidatePath("/changelog");
  revalidatePath(`/changelog/${id}`);
  redirect(`/changelog/${id}`);
}

export async function deleteChangelogEntry(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "ChangelogEntry", sourceId: id },
  });
  await prisma.changelogEntry.delete({ where: { id } });
  revalidatePath("/changelog");
  redirect("/changelog");
}
