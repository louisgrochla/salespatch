"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions, type AppRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

// The single write action available in the supervisor view.

const Input = z.object({
  feedback: z.string().min(1, "feedback required"),
});

async function requireSupervisor() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: AppRole } | undefined)?.role;
  if (role !== "supervisor") {
    throw new Error("supervisor only");
  }
}

export async function setSectionFeedback(sectionId: string, formData: FormData) {
  await requireSupervisor();
  const feedbackRaw = formData.get("feedback");
  const parsed = Input.safeParse({ feedback: typeof feedbackRaw === "string" ? feedbackRaw : "" });
  if (!parsed.success) return;

  await prisma.dissertationSection.update({
    where: { id: sectionId },
    data: { supervisorFeedback: parsed.data.feedback },
  });

  revalidatePath("/supervisor/sections");
  revalidatePath(`/supervisor/sections/${sectionId}`);
  // Also bust the founder-side caches so feedback shows up immediately
  // when the founder next loads the section.
  revalidatePath("/dissertation/sections");
  revalidatePath(`/dissertation/sections/${sectionId}`);
}
