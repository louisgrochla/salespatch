"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";
import { EVIDENCE_SOURCE_TYPES } from "./_types";

const Input = z.object({
  sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
  sourceId: z.string().min(1),
  dissertationSectionId: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  annotation: z.string().min(1),
});

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function reembed(id: string) {
  const r = await prisma.evidenceLog.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "EvidenceLog",
      sourceId: r.id,
      phaseLabel: r.phaseLabel,
      metadata: {
        section: "research",
        contentType: "evidence",
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        dissertationSectionId: r.dissertationSectionId,
      },
    },
    {
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      annotation: r.annotation,
      dissertationSectionId: r.dissertationSectionId,
    },
  );
}

export async function createEvidence(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.evidenceLog.create({
    data: { ...input, phaseLabel },
  });
  await reembed(row.id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/evidence");
  redirect(`/dissertation/evidence/${row.id}`);
}

export async function updateEvidence(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  await prisma.evidenceLog.update({ where: { id }, data: input });
  await reembed(id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/evidence");
  revalidatePath(`/dissertation/evidence/${id}`);
  redirect(`/dissertation/evidence/${id}`);
}

export async function deleteEvidence(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "EvidenceLog", sourceId: id },
  });
  await prisma.evidenceLog.delete({ where: { id } });
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/evidence");
  redirect("/dissertation/evidence");
}
