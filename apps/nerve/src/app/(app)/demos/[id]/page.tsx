import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// R7: /demos used to read DemoRecord (legacy manual entries). The new
// /demos list reads DemoArtefact, where every row is tied to a lead.
// All per-demo detail lives on the lead page (iframe preview, brief,
// brand, QA, etc.), so we route through to /leads/[leadId] rather than
// duplicate that surface here.
//
// Accepts either a DemoArtefact.id (cuid PK), a DemoArtefact.artefactId
// (the producer-supplied natural key), or — for backwards compatibility
// with the now-dead manual-entry path — a legacy DemoRecord.id which
// dumps the user back to the index.

export default async function DemoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const artefact = await prisma.demoArtefact.findFirst({
    where: {
      OR: [{ id: params.id }, { artefactId: params.id }],
    },
    select: { leadId: true },
  });

  if (artefact) {
    redirect(`/leads/${artefact.leadId}`);
  }
  // Unknown id — could be a legacy DemoRecord row or a typo. Send back to
  // the index where the operator can scan the current list.
  redirect("/demos");
}
