"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  workingTitle: z.string().min(1),
  researchQuestion: z.string().min(1),
  supervisor: z.string().optional().transform(emptyToNull),
  submissionDeadline: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  submissionDeadlineNote: z.string().optional().transform(emptyToNull),
  overallStatus: z.enum(["not_started", "draft", "in_progress", "complete"]),
  degree: z.string().optional().transform(emptyToNull),
  institution: z.string().optional().transform(emptyToNull),
  wordCountTargetMin: z.string().optional().transform(toIntOrNull),
  wordCountTargetMax: z.string().optional().transform(toIntOrNull),
  academicFraming: z.string().optional().transform(emptyToNull),
  degreeRelevanceMarketing: z.string().optional().transform(emptyToNull),
  degreeRelevanceAnalytics: z.string().optional().transform(emptyToNull),
});

function emptyToNull(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function toIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

export async function updateDissertationMeta(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);

  const existing = await prisma.dissertationMeta.findUnique({ where: { id: "main" } });
  const phaseLabel = await phaseLabelFor(new Date());

  await prisma.$transaction(async (tx) => {
    const titleChanged = !existing || existing.workingTitle !== input.workingTitle;
    const rqChanged = !existing || existing.researchQuestion !== input.researchQuestion;

    await tx.dissertationMeta.upsert({
      where: { id: "main" },
      create: {
        id: "main",
        workingTitle: input.workingTitle,
        researchQuestion: input.researchQuestion,
        supervisor: input.supervisor,
        submissionDeadline: input.submissionDeadline ? new Date(input.submissionDeadline) : null,
        submissionDeadlineNote: input.submissionDeadlineNote,
        overallStatus: input.overallStatus,
        degree: input.degree,
        institution: input.institution,
        wordCountTargetMin: input.wordCountTargetMin,
        wordCountTargetMax: input.wordCountTargetMax,
        academicFraming: input.academicFraming,
        degreeRelevanceMarketing: input.degreeRelevanceMarketing,
        degreeRelevanceAnalytics: input.degreeRelevanceAnalytics,
        phaseLabel,
      },
      update: {
        workingTitle: input.workingTitle,
        researchQuestion: input.researchQuestion,
        supervisor: input.supervisor,
        submissionDeadline: input.submissionDeadline ? new Date(input.submissionDeadline) : null,
        submissionDeadlineNote: input.submissionDeadlineNote,
        overallStatus: input.overallStatus,
        degree: input.degree,
        institution: input.institution,
        wordCountTargetMin: input.wordCountTargetMin,
        wordCountTargetMax: input.wordCountTargetMax,
        academicFraming: input.academicFraming,
        degreeRelevanceMarketing: input.degreeRelevanceMarketing,
        degreeRelevanceAnalytics: input.degreeRelevanceAnalytics,
      },
    });

    if (titleChanged) {
      await tx.workingTitleVersion.create({
        data: { dissertationId: "main", value: input.workingTitle },
      });
    }
    if (rqChanged) {
      await tx.researchQuestionVersion.create({
        data: { dissertationId: "main", value: input.researchQuestion },
      });
    }
  });

  await embedRecord(
    {
      sourceType: "DissertationMeta",
      sourceId: "main",
      phaseLabel,
      metadata: { section: "research", contentType: "dissertation_meta" },
    },
    {
      workingTitle: input.workingTitle,
      researchQuestion: input.researchQuestion,
      supervisor: input.supervisor,
      submissionDeadline: input.submissionDeadline,
      submissionDeadlineNote: input.submissionDeadlineNote,
      overallStatus: input.overallStatus,
      degree: input.degree,
      institution: input.institution,
      wordCountTargetMin: input.wordCountTargetMin,
      wordCountTargetMax: input.wordCountTargetMax,
      academicFraming: input.academicFraming,
      degreeRelevanceMarketing: input.degreeRelevanceMarketing,
      degreeRelevanceAnalytics: input.degreeRelevanceAnalytics,
    },
  );

  revalidatePath("/research");
  revalidatePath("/research/dissertation");
  revalidatePath("/dashboard");
  redirect("/research/dissertation");
}
