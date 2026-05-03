"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const TYPES = ["weekly", "decision", "failure", "iteration"] as const;

const Input = z.object({
  date: z.string().min(1),
  type: z.enum(TYPES),
  body: z.string().optional().transform(emptyToNull),
  decision: z.string().optional().transform(emptyToNull),
  reasoning: z.string().optional().transform(emptyToNull),
  outcome: z.string().optional().transform(emptyToNull),
  whatFailed: z.string().optional().transform(emptyToNull),
  why: z.string().optional().transform(emptyToNull),
  whatChanged: z.string().optional().transform(emptyToNull),
  beforeState: z.string().optional().transform(emptyToNull),
  afterState: z.string().optional().transform(emptyToNull),
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
  const r = await prisma.operationsLog.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "OperationsLog",
      sourceId: r.id,
      phaseLabel: r.phaseLabel,
      metadata: {
        section: "operations",
        contentType: r.type,
        date: r.date.toISOString(),
        tags: r.tags,
      },
    },
    {
      type: r.type,
      body: r.body,
      decision: r.decision,
      reasoning: r.reasoning,
      outcome: r.outcome,
      whatFailed: r.whatFailed,
      why: r.why,
      whatChanged: r.whatChanged,
      beforeState: r.beforeState,
      afterState: r.afterState,
      tags: r.tags.join(", "),
      date: r.date,
    },
  );
}

export async function createOperationsLog(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);

  const row = await prisma.operationsLog.create({
    data: {
      date,
      type: input.type,
      body: input.body,
      decision: input.decision,
      reasoning: input.reasoning,
      outcome: input.outcome,
      whatFailed: input.whatFailed,
      why: input.why,
      whatChanged: input.whatChanged,
      beforeState: input.beforeState,
      afterState: input.afterState,
      tags: input.tags,
      phaseLabel,
    },
  });

  await reembed(row.id);
  revalidatePath("/operations");
  revalidatePath("/dashboard");
  redirect(`/operations/${row.id}`);
}

export async function updateOperationsLog(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);

  await prisma.operationsLog.update({
    where: { id },
    data: {
      date,
      type: input.type,
      body: input.body,
      decision: input.decision,
      reasoning: input.reasoning,
      outcome: input.outcome,
      whatFailed: input.whatFailed,
      why: input.why,
      whatChanged: input.whatChanged,
      beforeState: input.beforeState,
      afterState: input.afterState,
      tags: input.tags,
      phaseLabel,
    },
  });

  await reembed(id);
  revalidatePath("/operations");
  revalidatePath(`/operations/${id}`);
  revalidatePath("/dashboard");
  redirect(`/operations/${id}`);
}

export async function deleteOperationsLog(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "OperationsLog", sourceId: id },
  });
  await prisma.operationsLog.delete({ where: { id } });
  revalidatePath("/operations");
  revalidatePath("/dashboard");
  redirect("/operations");
}
