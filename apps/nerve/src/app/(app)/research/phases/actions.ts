"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { invalidatePhaseCache } from "@/lib/phase";
import { embedRecord } from "@/lib/embeddings";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  name: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  operationalDescription: z.string().min(1),
});

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function reembed(id: string) {
  const r = await prisma.phaseBoundary.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "PhaseBoundary",
      sourceId: r.id,
      phaseLabel: r.name,
      metadata: {
        section: "research",
        contentType: "phase_boundary",
        date: r.startDate.toISOString(),
      },
    },
    {
      name: r.name,
      startDate: r.startDate,
      endDate: r.endDate,
      operationalDescription: r.operationalDescription,
    },
  );
}

export async function createPhase(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const row = await prisma.phaseBoundary.create({
    data: {
      name: input.name,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      operationalDescription: input.operationalDescription,
    },
  });
  invalidatePhaseCache();
  await reembed(row.id);
  revalidatePath("/research");
  revalidatePath("/research/phases");
  redirect(`/research/phases/${row.id}`);
}

export async function updatePhase(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  await prisma.phaseBoundary.update({
    where: { id },
    data: {
      name: input.name,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      operationalDescription: input.operationalDescription,
    },
  });
  invalidatePhaseCache();
  await reembed(id);
  revalidatePath("/research");
  revalidatePath("/research/phases");
  revalidatePath(`/research/phases/${id}`);
  redirect(`/research/phases/${id}`);
}

export async function deletePhase(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "PhaseBoundary", sourceId: id },
  });
  await prisma.phaseBoundary.delete({ where: { id } });
  invalidatePhaseCache();
  revalidatePath("/research");
  revalidatePath("/research/phases");
  redirect("/research/phases");
}
