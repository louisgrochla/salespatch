import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { ResearchSubNav } from "../../_components/SubNav";
import { SectionForm, type LiteratureOption } from "../_components/SectionForm";
import { createSection } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewSectionPage() {
  const literature = await prisma.literatureEntry.findMany({
    orderBy: [{ year: "desc" }, { authors: "asc" }],
    select: { id: true, title: true, authors: true, year: true },
  });
  const options: LiteratureOption[] = literature;

  return (
    <div className="p-6">
      <ResearchSubNav />
      <PageHeader
        title="New Section"
        subtitle="Markdown body. Word count tracked live. Version history starts on first save."
      />
      <SectionForm
        action={createSection}
        literatureOptions={options}
        cancelHref="/research/sections"
        submitLabel="Create section"
      />
    </div>
  );
}
