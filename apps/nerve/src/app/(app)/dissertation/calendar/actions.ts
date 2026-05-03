"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { embedRecord } from "@/lib/embeddings";
import { phaseLabelFor } from "@/lib/phase";
import { requireSession } from "@/lib/auth-guard";

const Input = z.object({
  milestone: z.string().min(1),
  deadline: z.string().min(1),
  status: z.string().default("pending"),
  dissertationSectionId: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function reembed(id: string) {
  const r = await prisma.academicCalendarItem.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "AcademicCalendarItem", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "research", contentType: "academic_calendar", deadline: r.deadline.toISOString() },
    },
    {
      milestone: r.milestone, deadline: r.deadline, status: r.status,
      dissertationSectionId: r.dissertationSectionId,
    },
  );
}

export async function createCalendarItem(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const phaseLabel = await phaseLabelFor(new Date());
  const row = await prisma.academicCalendarItem.create({
    data: {
      milestone: input.milestone,
      deadline: new Date(input.deadline),
      status: input.status,
      dissertationSectionId: input.dissertationSectionId,
      phaseLabel,
    },
  });
  await reembed(row.id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/calendar");
  redirect(`/dissertation/calendar/${row.id}`);
}

export async function updateCalendarItem(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  await prisma.academicCalendarItem.update({
    where: { id },
    data: {
      milestone: input.milestone,
      deadline: new Date(input.deadline),
      status: input.status,
      dissertationSectionId: input.dissertationSectionId,
    },
  });
  await reembed(id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/calendar");
  revalidatePath(`/dissertation/calendar/${id}`);
  redirect(`/dissertation/calendar/${id}`);
}

export async function deleteCalendarItem(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "AcademicCalendarItem", sourceId: id },
  });
  await prisma.academicCalendarItem.delete({ where: { id } });
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/calendar");
  redirect("/dissertation/calendar");
}
