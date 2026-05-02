"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  date: z.string().min(1),
  category: z.enum(["infrastructure", "compute", "tools", "misc"]),
  amount: z.string().min(1),
  notes: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function reembed(id: string) {
  const r = await prisma.costEntry.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "CostEntry", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "financial", contentType: "cost", category: r.category, date: r.date.toISOString() },
    },
    {
      date: r.date, category: r.category, amount: r.amount.toString(), notes: r.notes,
    },
  );
}

export async function createCost(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.costEntry.create({
    data: {
      date, category: input.category, amount: input.amount, notes: input.notes, phaseLabel,
    },
  });
  await reembed(row.id);
  revalidatePath("/financial");
  revalidatePath("/financial/costs");
  revalidatePath("/dashboard");
  redirect(`/financial/costs/${row.id}`);
}

export async function updateCost(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.costEntry.update({
    where: { id },
    data: {
      date, category: input.category, amount: input.amount, notes: input.notes, phaseLabel,
    },
  });
  await reembed(id);
  revalidatePath("/financial");
  revalidatePath("/financial/costs");
  revalidatePath(`/financial/costs/${id}`);
  revalidatePath("/dashboard");
  redirect(`/financial/costs/${id}`);
}

export async function deleteCost(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({ where: { sourceType: "CostEntry", sourceId: id } });
  await prisma.costEntry.delete({ where: { id } });
  revalidatePath("/financial");
  revalidatePath("/financial/costs");
  revalidatePath("/dashboard");
  redirect("/financial/costs");
}
