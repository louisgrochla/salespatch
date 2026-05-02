"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  phaseName: z.string().min(1),
  formalDescription: z.string().min(1),
  mixedMethodsJustification: z.string().optional().transform(emptyToNull),
  sampleSizeNotes: z.string().optional().transform(emptyToNull),
  statisticalApproach: z.string().optional().transform(emptyToNull),
  gdprHandling: z.string().optional().transform(emptyToNull),
  nerveAsInfrastructure: z.string().optional().transform(emptyToNull),
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
  const r = await prisma.methodologyDoc.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "MethodologyDoc",
      sourceId: r.id,
      phaseLabel: r.phaseLabel,
      metadata: { section: "research", contentType: "methodology", phaseName: r.phaseName },
    },
    {
      phaseName: r.phaseName,
      formalDescription: r.formalDescription,
      mixedMethodsJustification: r.mixedMethodsJustification,
      sampleSizeNotes: r.sampleSizeNotes,
      statisticalApproach: r.statisticalApproach,
      gdprHandling: r.gdprHandling,
      nerveAsInfrastructure: r.nerveAsInfrastructure,
    },
  );
}

export async function createMethodology(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.methodologyDoc.create({
    data: { ...input, phaseLabel },
  });
  await reembed(row.id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/methodology");
  redirect(`/dissertation/methodology/${row.id}`);
}

export async function updateMethodology(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  await prisma.methodologyDoc.update({ where: { id }, data: input });
  await reembed(id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/methodology");
  revalidatePath(`/dissertation/methodology/${id}`);
  redirect(`/dissertation/methodology/${id}`);
}

export async function deleteMethodology(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "MethodologyDoc", sourceId: id },
  });
  await prisma.methodologyDoc.delete({ where: { id } });
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/methodology");
  redirect("/dissertation/methodology");
}
