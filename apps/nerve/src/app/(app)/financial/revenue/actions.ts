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
  dealReference: z.string().optional().transform(emptyToNull),
  amount: z.string().min(1),
  notes: z.string().optional().transform(emptyToNull),
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
  const r = await prisma.revenueEntry.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "RevenueEntry", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "financial", contentType: "revenue", date: r.date.toISOString() },
    },
    {
      date: r.date,
      dealReference: r.dealReference,
      amount: r.amount.toString(),
      notes: r.notes,
    },
  );
}

export async function createRevenue(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.revenueEntry.create({
    data: {
      date,
      dealReference: input.dealReference,
      amount: input.amount,
      notes: input.notes,
      phaseLabel,
    },
  });
  await reembed(row.id);
  revalidatePath("/financial");
  revalidatePath("/financial/revenue");
  revalidatePath("/dashboard");
  redirect(`/financial/revenue/${row.id}`);
}

export async function updateRevenue(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.revenueEntry.update({
    where: { id },
    data: {
      date,
      dealReference: input.dealReference,
      amount: input.amount,
      notes: input.notes,
      phaseLabel,
    },
  });
  await reembed(id);
  revalidatePath("/financial");
  revalidatePath("/financial/revenue");
  revalidatePath(`/financial/revenue/${id}`);
  revalidatePath("/dashboard");
  redirect(`/financial/revenue/${id}`);
}

export async function deleteRevenue(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "RevenueEntry", sourceId: id },
  });
  await prisma.revenueEntry.delete({ where: { id } });
  revalidatePath("/financial");
  revalidatePath("/financial/revenue");
  revalidatePath("/dashboard");
  redirect("/financial/revenue");
}
