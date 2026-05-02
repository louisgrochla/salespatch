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
  notes: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  feedback: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  agreedActions: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
  followUpStatus: z.string().optional().transform((v) => (v && v.trim() ? v : null)),
});

function fd<S extends z.ZodTypeAny>(data: FormData, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  for (const [k, v] of data.entries()) if (typeof v === "string") obj[k] = v;
  return schema.parse(obj);
}

async function reembed(id: string) {
  const r = await prisma.supervisorMeeting.findUniqueOrThrow({ where: { id } });
  await embedRecord(
    {
      sourceType: "SupervisorMeeting", sourceId: r.id, phaseLabel: r.phaseLabel,
      metadata: { section: "research", contentType: "supervisor_meeting", date: r.date.toISOString() },
    },
    {
      date: r.date, notes: r.notes, feedback: r.feedback,
      agreedActions: r.agreedActions, followUpStatus: r.followUpStatus,
    },
  );
}

export async function createMeeting(formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);
  const row = await prisma.supervisorMeeting.create({
    data: { ...input, date, phaseLabel },
  });
  await reembed(row.id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/supervisor");
  redirect(`/dissertation/supervisor/${row.id}`);
}

export async function updateMeeting(id: string, formData: FormData) {
  await requireSession();
  const input = fd(formData, Input);
  const date = new Date(input.date);
  const phaseLabel = await phaseLabelFor(date);
  await prisma.supervisorMeeting.update({
    where: { id }, data: { ...input, date, phaseLabel },
  });
  await reembed(id);
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/supervisor");
  revalidatePath(`/dissertation/supervisor/${id}`);
  redirect(`/dissertation/supervisor/${id}`);
}

export async function deleteMeeting(id: string) {
  await requireSession();
  await prisma.embedding.deleteMany({
    where: { sourceType: "SupervisorMeeting", sourceId: id },
  });
  await prisma.supervisorMeeting.delete({ where: { id } });
  revalidatePath("/dissertation");
  revalidatePath("/dissertation/supervisor");
  redirect("/dissertation/supervisor");
}
