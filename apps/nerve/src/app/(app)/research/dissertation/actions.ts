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
  supervisor: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  submissionDeadline: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  overallStatus: z.enum(["not_started", "draft", "in_progress", "complete"]),
});

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
    // Append version history rows when the value actually changed.
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
        overallStatus: input.overallStatus,
        phaseLabel,
      },
      update: {
        workingTitle: input.workingTitle,
        researchQuestion: input.researchQuestion,
        supervisor: input.supervisor,
        submissionDeadline: input.submissionDeadline ? new Date(input.submissionDeadline) : null,
        overallStatus: input.overallStatus,
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

  // Embed the current state.
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
      overallStatus: input.overallStatus,
    },
  );

  revalidatePath("/research");
  revalidatePath("/research/dissertation");
  revalidatePath("/dashboard");
  redirect("/research/dissertation");
}
